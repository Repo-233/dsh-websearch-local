// ═══════════════════════════════════════════════════════════════════
// 运行时注册表（registry）：ENGINES 构建 / membersOf / engineReady / 组合搜索
// 由 scripts/split-src.mjs 从 dist/index.js 按行切片自动生成；逻辑与 dist 逐字一致，
// 只调整了 import/export 边界。改动请改本文件，或改 src/ 后重跑该脚本（--check 可验证）。
// membersOf 需要的 customEngineIdsFor 从 engines-meta 导入（避免与设置页模块成环）。
// ═══════════════════════════════════════════════════════════════════

import { ENGINES_META, baseEngineId, customEngineIdsFor, REPO_ENGINES, PKG_ENGINES } from './engines-meta.js';
import { runEngine } from './route-exec.js';
import { clampInt } from './utils.js';
import { DEFAULTS } from './constants.js';
/* -------------------------------------------------------------- registry */

/** 所有非组合引擎 → 「(query, opts) => { items, via, ms, failures }」。 */
const ENGINES = {};
for (const [id, def] of Object.entries(ENGINES_META)) {
  if (def.group === 'composite') continue;
  ENGINES[id] = (query, opts) => runEngine(id, query, opts);
}

/** 组合引擎的成员列表：可配置，默认取内置列表；自定义引擎按大类自动并入。 */
function membersOf(kind, cfg) {
  const key = kind === 'repo' ? 'repoEngines' : 'pkgEngines';
  const fallback = kind === 'repo' ? REPO_ENGINES : PKG_ENGINES;
  const list = Array.isArray(cfg?.[key]) && cfg[key].length ? cfg[key] : fallback;
  const catId = kind === 'repo' ? 'code' : 'pkg';
  const customs = kind === 'repo' || kind === 'pkg' ? customEngineIdsFor(catId) : [];
  return [...new Set([...list.map(baseEngineId), ...customs])].filter((e) => ENGINES[e]);
}

/** Is this engine usable with the current config? */
function engineReady(id, cfg) {
  const base = baseEngineId(id);
  if (base === 'gitee') return !!(cfg?.giteeToken || process.env.GITEE_TOKEN);
  if (base === 'repo' || base === 'pkg') return membersOf(base, cfg).some((e) => engineReady(e, cfg));
  return !!ENGINES[base];
}

/** 归一化 URL：用于跨源去重（大小写、www.、query、尾斜杠都不该造成两条）。 */
function canonUrl(u) {
  try {
    const x = new URL(String(u));
    return `${x.hostname.replace(/^www\./i, '').toLowerCase()}${x.pathname.replace(/\/+$/, '')}`;
  } catch {
    return String(u || '').replace(/[#?].*$/, '').replace(/\/+$/, '');
  }
}

/**
 * Composite search: fan out to every ready member IN PARALLEL, then merge by
 * round-robin so the answer is genuinely multi-source instead of "GitHub plus
 * whatever is left". Each member's own results are sorted by its native
 * popularity metric first; cross-host scores are not comparable, which is
 * exactly why we interleave rather than sort globally.
 *
 * 成员是**逻辑源**（github / gitlab / …），不是路由。同一个源的镜像和加速
 * 在 runEngine 内部就已经收敛成一条结果，不会在这里被当成两个源重复出现。
 */
/** 组合搜索并发上限：避免一次性打满所有成员（降低被限流/封禁概率）。 */
const COMPOSITE_CONCURRENCY = 3;

/**
 * Composite search: fan out to ready members with a concurrency cap, then merge
 * by round-robin so the answer is genuinely multi-source instead of "GitHub plus
 * whatever is left". 已完成的搜索先返回：成员各自完成即并入（谁先到先算）；一旦凑够
 * maxResults 就不再启动新的成员（按需填充），并立即返回 —— 不等最慢成员。超过总时间
 * 预算时，把已完成的结果先返回，避免被单个不稳源拖垮（实测 maven 曾 15s+ 超时）。
 * 跨源分数不可比，所以用 round-robin 交错而不是全局排序。
 *
 * 成员是**逻辑源**（github / gitlab / …），不是路由。同一个源的镜像和加速
 * 在 runEngine 内部就已经收敛成一条结果，不会在这里被当成两个源重复出现。
 */
function compositeSearch(kind, label) {
  return async function searchComposite(query, opts) {
    const cfg = opts._cfg || {};
    const ready = membersOf(kind, cfg).filter((id) => engineReady(id, cfg));
    if (!ready.length) throw new Error(`${label}：没有可用的子引擎`);

    const want = clampInt(opts.maxResults, 1, 30, DEFAULTS.maxResults);
    const perEngine = clampInt(Math.ceil(want / ready.length) + 2, 3, 30, 5);
    // 成员超时预算：比全局更紧，避免一个不稳源拖垮整次搜索。
    const memberMs = clampInt(
      Math.min(opts.timeoutMs || DEFAULTS.timeoutMs, DEFAULTS.compositeMemberMs),
      3000,
      60000,
      DEFAULTS.compositeMemberMs
    );
    const concurrency = Math.min(COMPOSITE_CONCURRENCY, ready.length);
    const labelOf = (id) => ENGINES_META[id]?.label || id;

    const groups = [];      // 已完成成员 {id, items, via}
    const failures = [];
    const routes = {};
    const seen = new Set(); // 跨源 URL 去重
    const merged = [];
    const depth = new Map();
    let index = 0;
    let active = 0;
    let finished = false;
    let timer;

    // 按 ready 顺序稳定交错：让不同源在结果里交替出现，避免单一源霸榜。
    function pull() {
      if (merged.length >= want) return;
      const ordered = groups.slice().sort((a, b) => ready.indexOf(a.id) - ready.indexOf(b.id));
      let progressed = true;
      while (progressed && merged.length < want) {
        progressed = false;
        for (const g of ordered) {
          if (merged.length >= want) break;
          const d = depth.get(g.id) || 0;
          if (d >= g.items.length) continue;
          depth.set(g.id, d + 1);
          const it = g.items[d];
          const key = canonUrl(it.url);
          if (key && seen.has(key)) { progressed = true; continue; }
          if (key) seen.add(key);
          merged.push({ ...it, url: it.url, title: `[${labelOf(g.id)}] ${it.title}`, engine: g.id });
          progressed = true;
        }
      }
    }

    await new Promise((resolve) => {
      const finish = (how) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve(how);
      };
      const onMemberDone = (id, rec) => {
        if (finished) return; // 预算/已足够后到账的结果不再并入
        active--;
        if (rec.error) {
          failures.push(`${id}: ${rec.error}`);
        } else {
          routes[id] = rec.via;
          if (rec.items.length) {
            groups.push({ id, items: rec.items, via: rec.via });
            pull();
          }
        }
        pump();
      };
      const pump = () => {
        if (finished) return;
        while (active < concurrency && index < ready.length && merged.length < want) {
          const id = ready[index++];
          active++;
          const meta = ENGINES_META[id] || {};
          // Gitee answers in ~10s, so give slow members more headroom.
          const timeoutMs = Math.round(memberMs * (meta.slow ? 1.8 : 1));
          ENGINES[id](query, { ...opts, maxResults: perEngine, timeoutMs })
            .then((r) => {
              const items = (r.items || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0));
              onMemberDone(id, { items, via: r.via });
            })
            .catch((e) => onMemberDone(id, { error: e?.message ?? String(e) }));
        }
        if (merged.length >= want) return finish('enough'); // 已凑够：立即返回，不等在飞成员
        if (active === 0 && index >= ready.length) return finish('done');
      };
      timer = setTimeout(() => finish('budget'), memberMs); // 全局时间预算
      pump();
    });

    if (!merged.length) {
      throw new Error(
        `${label}：所有源均无结果${failures.length ? `（${failures.join(' | ')}）` : ''}`
      );
    }
    return { items: merged, usedEngines: groups.map((g) => g.id), routes, failures };
  };
}

const COMPOSITES = {
  repo: compositeSearch('repo', '代码仓库多源合并'),
  pkg: compositeSearch('pkg', '包仓库多源合并'),
};

/**
 * Composite engines return a richer shape than a plain engine, so normalise
 * here. A plain engine yields `{ items, via, failures }`; a composite yields
 * `{ items, usedEngines, routes, failures }`. `routes` records which entry of
 * each source actually answered — that is what makes "同一份内容的多个入口"
 * observable instead of a black box.
 */
function normaliseResult(id, result) {
  if (Array.isArray(result)) return { items: result, usedEngines: [id], routes: {}, failures: [] };
  return {
    items: result.items || [],
    usedEngines: result.usedEngines || [id],
    routes: result.routes || (result.via ? { [id]: result.via } : {}),
    failures: result.failures || [],
  };
}

export {
ENGINES,
membersOf,
engineReady,
canonUrl,
compositeSearch,
COMPOSITES,
normaliseResult
};
