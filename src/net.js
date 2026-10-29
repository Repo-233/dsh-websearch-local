// SPDX-License-Identifier: GPL-3.0-or-later
// 网络层（net）：代理管线（undici 双坑注释）+ request / getJson

import { optionalImport } from './deps.js';
import { redactSensitive } from './utils.js';
import { UA_BROWSER } from './constants.js';
/** 路由没指定 ua 时的默认值（UA_BROWSER / UA_BOT 定义在文件顶部）。 */
const UA = UA_BROWSER;

/**
 * Proxy plumbing.
 *
 * Two separate traps live here, and v0.2 fell into both:
 *
 *  1. `import('undici')` is a BARE specifier, so it resolves from the plugin
 *     file's physical location. Under a junction / symlink install the parent
 *     chain has no `node_modules`, resolution fails, the failure was swallowed,
 *     and `proxyUrl` silently did nothing. We now resolve through the same
 *     multi-base chain as our other peers and WARN once when we cannot.
 *
 *  2. A `ProxyAgent` built from a *separately installed* undici cannot be handed
 *     to the global `fetch`, which uses Node's internal undici copy — the
 *     request dies with a bare `TypeError: fetch failed`. Measured directly:
 *
 *       undici.fetch(url, { dispatcher: new undici.ProxyAgent(p) })  → 200
 *       globalThis.fetch(url, { dispatcher: sameAgent })             → TypeError
 *
 *     So when a proxy is in play we ALSO take the `fetch` implementation from
 *     that same undici instance. Agent and fetch must come from one module.
 *
 * Deliberate non-feature: there is no silent "proxy failed → retry direct". A
 * configured proxy may exist precisely so traffic does NOT go out directly, and
 * quietly bypassing it would be worse than failing. Failures name the proxy.
 */
const NO_PROXY = () => ({ dispatcher: undefined, fetchImpl: null });

// The cache record doubles as the return value, so its dispatcher MUST be keyed
// `dispatcher`: `request()` destructures that name. Keying it `agent` — as an
// earlier revision did — makes every proxied call silently fall back to a direct
// connection, with no warning and no error. Verified by pointing proxyUrl at a
// black hole port: only a correctly shaped return value makes the request fail.
let cachedProxy = { proxyUrl: null, dispatcher: null, fetchImpl: null };

/**
 * 缓存的是 **Promise**，不是解析结果。
 *
 * 早先的写法是 `if (undiciTried) return undiciModule; undiciTried = true;
 * undiciModule = await optionalImport(...)` —— 组合引擎会并发发起请求，
 * 第一个调用刚置位 `undiciTried` 就 await 去了，另外几个并发调用立刻拿到
 * 还没赋值的 null，于是「undici 不存在」被当成结论，整条代理链静默失效。
 * 这个 bug 只在「一次搜索里并发多个 HTTP 请求」时才现形，串行测试永远抓不到。
 */
let undiciPromise = null;
let proxyWarned = false;
/** 同一个 proxyUrl 的首次构造也只做一次，避免并发调用各造一个 ProxyAgent。 */
let proxyBuild = { url: null, promise: null };

function getUndici() {
  if (!undiciPromise) undiciPromise = optionalImport('undici');
  return undiciPromise;
}

/** `{ dispatcher, fetchImpl }` — both undefined when there is nothing to proxy. */
async function resolveProxy(proxyUrl, logger) {
  if (!proxyUrl) return NO_PROXY();
  if (cachedProxy.proxyUrl === proxyUrl && cachedProxy.dispatcher) return cachedProxy;

  if (proxyBuild.url !== proxyUrl || !proxyBuild.promise) {
    proxyBuild = { url: proxyUrl, promise: buildProxy(proxyUrl, logger) };
  }
  const built = await proxyBuild.promise;
  if (built.dispatcher) cachedProxy = built;
  return built;
}

async function buildProxy(proxyUrl, logger) {
  const mod = await getUndici();
  const ProxyAgent = mod?.ProxyAgent ?? mod?.default?.ProxyAgent;
  const fetchImpl = mod?.fetch ?? mod?.default?.fetch ?? null;

  if (!ProxyAgent || !fetchImpl) {
    if (!proxyWarned) {
      proxyWarned = true;
      logger?.warn?.(
        `websearch-local: 已配置 proxyUrl=${redactSensitive(proxyUrl)}，但无法解析 undici（ProxyAgent/fetch 不可用），` +
          '本次代理不会生效。修法：把 undici 装进插件所在的 node_modules，' +
          '或设置 NODE_USE_ENV_PROXY=1 让 Node 直接读取 HTTP(S)_PROXY 环境变量。'
      );
    }
    return NO_PROXY();
  }

  try {
    // Agent 和 fetch 必须来自同一个 undici 实例：跨实例的 ProxyAgent 会被
    // 全局 fetch 拒绝（TypeError: fetch failed）。见文件顶部的代理说明。
    const dispatcher = new ProxyAgent(proxyUrl);
    return { proxyUrl, dispatcher, fetchImpl };
  } catch (err) {
    if (!proxyWarned) {
      proxyWarned = true;
      logger?.warn?.(`websearch-local: ProxyAgent 构造失败（${err.message}），代理不会生效。`);
    }
    return NO_PROXY();
  }
}

async function request(url, { proxyUrl, timeoutMs, signal, accept, ua, extraHeaders, logger } = {}) {
  const { dispatcher, fetchImpl } = await resolveProxy(proxyUrl, logger);
  const doFetch = fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    const res = await doFetch(url, {
      signal: controller.signal,
      dispatcher,
      redirect: 'follow',
      headers: {
        'User-Agent': ua || UA,
        Accept: accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        ...extraHeaders,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.text();
  } catch (err) {
    // Name the proxy: a bare "fetch failed" with a proxy in play is the least
    // diagnosable error this plugin can produce.
    if (proxyUrl && err?.name !== 'AbortError' && !/^HTTP \d/.test(String(err?.message))) {
      throw new Error(`经代理 ${redactSensitive(proxyUrl)} 请求失败: ${redactSensitive(err.message)}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

/** GET + JSON parse with a readable failure message. */
async function getJson(url, opts, what) {
  const raw = await request(url, { ...opts, accept: opts.accept || 'application/json' });
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`${what} 返回非 JSON（可能被限流或拦截）`);
  }
  return data;
}

export {
request,
getJson
};
