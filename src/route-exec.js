// ═══════════════════════════════════════════════════════════════════
// 路由执行层（route-exec）：路由健康度 / 排序 / runRoute / runEngine
// 由 scripts/split-src.mjs 从 dist/index.js 按行切片自动生成；逻辑与 dist 逐字一致，
// 只调整了 import/export 边界。改动请改本文件，或改 src/ 后重跑该脚本（--check 可验证）。
// ═══════════════════════════════════════════════════════════════════

import { ENGINES_META } from './engines-meta.js';
import { UA_BOT, UA_BROWSER } from './constants.js';
import { clampInt, redactSensitive } from './utils.js';
import { request, getJson } from './net.js';
/* ------------------------------------------------------------ 路由执行层 */

/**
 * 路由健康状态：只活在进程内。失败过的路由会被排到同引擎的其它路由之后，
 * 一条都没有成功过的引擎下次仍然从第一条开始试 —— 所以这不是"记住了别试"，
 * 而是"这一轮先换条路"。外部网络恢复后不会留下永久性拉黑。
 */
const routeHealth = new Map();
const routeKey = (id, route) => `${id}|${route.label}`;

function markRouteFailed(id, route, message) {
  const k = routeKey(id, route);
  const cur = routeHealth.get(k) || { fails: 0, lastError: '' };
  routeHealth.set(k, { fails: cur.fails + 1, lastError: message });
}

function markRouteOk(id, route) {
  routeHealth.delete(routeKey(id, route));
}

/**
 * 路由顺序 = 失败次数 → tier 策略 → 声明顺序。
 * `direct-first` 先直连（数据最权威、无第三方转折）；
 * `accel-first` 先走镜像/加速（国内网络直连经常超时）；
 * `auto`（默认）按引擎自己决定 —— 实测直连不可达的引擎（如 huggingface）
 * 先走镜像，其余先直连。tier 2 的第三方索引在任何策略下都排最后。
 */
function orderedRoutes(def, engineId, policy, pin) {
  let list = def.routes || [];
  if (pin) {
    const hit = list.filter((r) => r.label.includes(pin));
    if (hit.length) list = hit;
  }
  const eff = policy === 'direct-first' || policy === 'accel-first'
    ? policy
    : def.preferAccel
      ? 'accel-first'
      : 'direct-first';
  const rank = (r) => (eff === 'accel-first' ? (r.tier === 1 ? 0 : r.tier === 0 ? 1 : 2) : r.tier);
  return list
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const fa = routeHealth.get(routeKey(engineId, a.r))?.fails || 0;
      const fb = routeHealth.get(routeKey(engineId, b.r))?.fails || 0;
      if (fa !== fb) return fa - fb;
      const ta = rank(a.r);
      const tb = rank(b.r);
      if (ta !== tb) return ta - tb;
      return a.i - b.i;
    })
    .map((x) => x.r);
}

/** UA 挂在路由上：API 入口用自报 UA，网页入口用浏览器 UA。 */
function routeUa(def, route) {
  const want = route.ua || def.ua;
  if (want === 'bot') return UA_BOT;
  if (want === 'browser') return UA_BROWSER;
  return def.html ? UA_BROWSER : UA_BOT;
}

/** 跑一条路由：拼 URL → 取文本/JSON → 交给解析器（路由可覆盖引擎级实现）。 */
async function runRoute(def, route, query, opts) {
  const n = clampInt(opts.maxResults, 1, 30, 8);
  // 设置卡片里的单入口代理开关：true = 强制走全局代理；false = 强制直连；
  // 缺省 = 跟随全局。GitHub 的加速镜像不需要代理就能用，所以「开代理」
  // 对它意味着「优先用加速镜像」，对其它入口才意味着真正的 proxy。
  let proxyUrl = opts.proxyUrl;
  const ov = opts._ui?.routeOverrides?.[`${opts._engineId}|${route.label}`];
  if (ov?.proxy === true) proxyUrl = opts._globalProxyUrl || '';
  else if (ov?.proxy === false) proxyUrl = '';
  // 卡片里可以直接改写入口网址（设置 → 插件 → 输入框）。
  const effRoute = ov?.url ? { ...route, base: ov.url } : route;
  // 路由可以自带 search / pick：第三方索引的端点和返回结构都和主源不同
  // （repos.ecosyste.ms 就不是 GitHub 的 /search/repositories）。
  const build = effRoute.search || def.search;
  const pick = effRoute.pick || def.pick;
  const url = build(effRoute, query, n, opts);
  const ua = routeUa(def, effRoute);
  const accept = effRoute.accept || def.accept;
  // 凭据只发给权威直连入口。第三方加速代理 / 索引站点会看到整条请求，
  // 把 PAT 送过去等于把令牌交给一个无关的第三方 —— 宁可让加速路由跑匿名限流。
  const extraHeaders =
    def.token === 'githubToken' && opts.githubToken && route.tier === 0
      ? { Authorization: `Bearer ${opts.githubToken}` }
      : undefined;

  let payload;
  if (def.html) {
    payload = await request(url, { ...opts, proxyUrl, ua, accept, extraHeaders });
  } else {
    payload = await getJson(url, { ...opts, proxyUrl, ua, accept, extraHeaders }, def.label);
  }
  // 每条结果都带上它是从哪条入口拿到的：结果异常时先看这个再怀疑内容。
  // 组合引擎会把成员结果原样带进合并结果，所以这里的 via 会一路留到最后。
  return (pick(payload, route, opts) || []).map((it) => ({ ...it, via: route.label }));
}

/**
 * 这条入口是不是「不可用」，还是只是「这次请求被拒」？
 *
 * 区分很重要：4xx 里的 400/401/404 说明入口本身是通的 —— 只是这次没带对
 * 凭据、或者查的东西不存在。把这种失败记成「入口不可用」，会让一次无效 token
 * 把一条好好的直连入口在整个会话里排到最后（实测踩到过：无效 token 触发的
 * 401 让后续所有 github 搜索都先绕去第三方加速代理）。
 *
 * 403 / 429 / 5xx 和网络层错误才是真的入口问题：WAF 拦截、限流、网关故障。
 */
function isRouteUnavailable(message) {
  const http = String(message || '').match(/HTTP (\d{3})/);
  if (!http) return true; // fetch failed / 超时 / DNS → 入口不可用
  const code = Number(http[1]);
  return code === 403 || code === 429 || code >= 500;
}

/** 指数退避重试：429/503 与网络层瞬时错误最多重试 RETRY_MAX 次再降级/换入口。 */
const RETRY_MAX = 2;
const RETRY_BASE_MS = 400;
const RETRY_CAP_MS = 2000;
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
/** 可重试的失败：HTTP 429/503，或非「我方超时中止」的网络故障（DNS/TLS/拒连）。 */
function isRetryable(message) {
  const http = String(message || '').match(/HTTP (\d{3})/);
  if (http) return Number(http[1]) === 429 || Number(http[1]) === 503;
  return !/abort|timeout|超时|timed out/i.test(String(message || ''));
}

/**
 * 跑一个引擎：按路由表依次尝试（对瞬时错误做指数退避重试），第一条成功的就返回。
 * 空结果算成功的答复（同一份内容换入口也一样空），不再浪费后续路由的往返。
 */
async function runEngine(engineId, query, opts) {
  const def = ENGINES_META[engineId];
  if (!def) throw new Error(`未知引擎 "${engineId}"`);

  const policy = ['direct-first', 'accel-first'].includes(opts.routePolicy)
    ? opts.routePolicy
    : 'auto';
  const pin = opts._routePin || null;
  // 空网址的入口（卡片里「添加代理」后还没填 URL）不参与运行时。
  let routes = orderedRoutes(def, engineId, policy, pin).filter((r) => r.base);
  // 卡片里被蓝色开关停用的代理入口也不参与运行时（保留配置，随时可再启用）。
  // 自定义代理：启停状态优先读条目本身（custom.proxies[proxyIndex].enabled，
  // v3 数据模型）；routeOverrides.enabled 仅作 v2 旧配置回退。
  const uiOv = opts._ui?.routeOverrides;
  const uiCustom = opts._ui?.custom;
  const uiExtras = opts._ui?.routeExtras;
  if (
    (uiOv && Object.keys(uiOv).length) ||
    (uiCustom && Object.keys(uiCustom).length) ||
    (uiExtras && Object.keys(uiExtras).length) // 只看前两者会漏掉纯 routeExtras 的停用配置
  ) {
    routes = routes.filter((r) => {
      if (r.tier !== 1) return true;
      if (engineId.startsWith('custom-') && typeof r.proxyIndex === 'number') {
        const catId = engineId.slice('custom-'.length, engineId.lastIndexOf('-'));
        const srcNo = Number(engineId.slice(engineId.lastIndexOf('-') + 1)) - 1;
        const entry = (uiCustom?.[catId] || [])[srcNo]?.proxies?.[r.proxyIndex];
        // v3 条目显式 false → 停用；否则继续看 v2 回退键，不能在这里 early return
        // （entry 恒为真，early return 会吞掉 v2 旧配置的「停用」）。
        if (entry && entry.enabled === false) return false;
      } else if (r.extra && typeof r.extraIndex === 'number') {
        // 内置源「＋代理」入口：状态存在 routeExtras[engId][extraIndex].enabled。
        const extra = (uiExtras?.[engineId] || [])[r.extraIndex];
        if (extra && extra.enabled === false) return false;
      }
      return uiOv?.[`${engineId}|${r.label}`]?.enabled !== false;
    });
  }
  if (!routes.length) throw new Error(`${def.label}：没有可用路由`);

  // 设置卡片的单入口代理开关参与路由排序。语义对齐用户直觉：
  //   任意入口 proxy=true → 该引擎整体 accel-first（加速镜像/代理入口排最前，
  //     —— GitHub 的 gh-proxy.com 这类镜像本身就是「代理」，无需本机代理地址）
  //   任意入口 proxy=false → 该引擎整体 direct-first，且该入口排最前
  //   缺省 → 引擎默认策略。稳定排序保住健康度/层级顺序。
  const overrides = opts._ui?.routeOverrides;
  if (overrides && Object.keys(overrides).length) {
    const ov = (r) => overrides[`${engineId}|${r.label}`]?.proxy;
    const wantsProxy = (def.routes || []).some((r) => ov(r) === true);
    const wantsDirect = (def.routes || []).some((r) => ov(r) === false);
    if (wantsProxy || wantsDirect) {
      const eff = wantsProxy ? 'accel-first' : 'direct-first';
      const rank = (r) =>
        eff === 'accel-first' ? (r.tier === 1 ? 0 : r.tier === 0 ? 1 : 2) : r.tier;
      const forced = (r) => (ov(r) === false ? -1 : 0); // 显式「直连」的入口在 direct-first 下排最前
      routes = [...routes].sort((a, b) => {
        const fa = forced(a) - forced(b);
        if (fa) return fa;
        const ta = rank(a) - rank(b);
        if (ta) return ta;
        return 0;
      });
    }
  }
  opts._engineId = engineId;

  const failures = [];
  for (const route of routes) {
    const t0 = Date.now();
    let lastErr = null;
    for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
      if (opts.signal?.aborted) { lastErr = lastErr || new Error('已取消'); break; }
      try {
        const items = await runRoute(def, route, query, opts);
        markRouteOk(engineId, route);
        if (!items.length) {
          opts.logger?.debug?.(`websearch-local: ${def.label} 经「${route.label}」无结果`);
        }
        return { items, via: route.label, ms: Date.now() - t0, failures };
      } catch (err) {
        lastErr = err;
        if (attempt < RETRY_MAX && isRetryable(err.message)) {
          const delay = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_CAP_MS);
          opts.logger?.warn?.(
            `websearch-local: ${def.label} 入口「${route.label}」暂败（${redactSensitive(err.message)}），` +
              `${delay}ms 后重试（${attempt + 1}/${RETRY_MAX}）`
          );
          await sleep(delay);
          continue;
        }
        break;
      }
    }
    const err = lastErr;
    failures.push(`${route.label}: ${err?.message ?? err}`);
    const unusable = isRouteUnavailable(String(err?.message ?? ''));
    if (unusable) markRouteFailed(engineId, route, String(err?.message ?? ''));
    if (routes.length > 1) {
      opts.logger?.warn?.(
        `websearch-local: ${def.label} 入口「${route.label}」失败 — ${redactSensitive(err?.message ?? '')}；换下一条入口` +
          (unusable ? '' : '（该入口本身可用，不计入降级）')
      );
    }
  }
  throw new Error(
    routes.length === 1
      ? failures[0]
      : `${routes.length} 条入口全部失败 → ${failures.join(' | ')}`
  );
}

export {
runEngine,
orderedRoutes,
runRoute,
isRouteUnavailable
};
