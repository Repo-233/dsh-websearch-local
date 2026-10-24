// ═══════════════════════════════════════════════════════════════════
// 插件身份与常量（constants）：name / inject / UA / 意图正则 / DEFAULTS
// 由 scripts/split-src.mjs 从 dist/index.js 按行切片自动生成；逻辑与 dist 逐字一致，
// 只调整了 import/export 边界。改动请改本文件，或改 src/ 后重跑该脚本（--check 可验证）。
// 原文 L119-121 的 `export const` 改为普通 const，底部统一导出。
// ═══════════════════════════════════════════════════════════════════

const name = 'websearch-direct';
const inject = ['web'];
const SETTINGS_NAMESPACE = 'websearch-direct';

/* ------------------------------------------------------------ UA / 常量 */

/**
 * 两套 UA，因为实测结果是分裂的：
 *
 *   · API 端点（codeberg、crates.io、GitHub…）要一个「自报家门」的 UA。
 *     Codeberg 的 WAF 会专门拦完整浏览器 UA —— 连 /api/v1/version 都回 403，
 *     而同一个请求换成 bot UA 就是 200。crates.io 反过来拦 curl 的默认 UA。
 *     bot UA 在两端都是 200，且它是诚实的。
 *   · 网页搜索（Bing / 百度）要浏览器 UA，否则可能被当成爬虫。
 *
 * 所以 UA 挂在**路由**上而不是插件上：同一份内容换个入口，头就该跟着换。
 */
const UA_BROWSER =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/126.0.0.0 Safari/537.36';
const VERSION = '0.5.0';
const UA_BOT = `dsh-websearch-direct/${VERSION} (+https://workbuddy.cn)`;

// —— v0.5：移除「意图自动路由」（原 PKG_INTENT / CODE_INTENT 两个意图正则已删除）。
// 让模型用 web_search_engine 的 engine / maxResults 等参数自行选择引擎与参数，
// 不再根据关键词偷偷跳到 repo/pkg 组合。留此注释说明删除原因。

const DEFAULTS = {
  proxyUrl: '',
  engineOrder: ['bing', 'baidu', 'duckduckgo'],
  githubToken: '',
  giteeToken: '',
  enableGithubMirrors: true,
  routePolicy: 'auto',
  repoEngines: ['github', 'gitlab', 'codeberg', 'gitea', 'gitee'],
  // maven 故意不在默认成员里：search.maven.org 从本机实测极不稳定（同一个 UA
  // 一次 200 / 一次 15s 超时，三轮里成功约 1/3），放进组合只会稳定拖慢每一次
  // pkg 搜索。引擎本身保留，需要时用 engine="maven" 或加进 pkgEngines。
  pkgEngines: ['npm', 'crates', 'packagist', 'nuget', 'rubygems', 'huggingface'],
  maxResults: 8,
  timeoutMs: 15000,
  compositeMemberMs: 12000,
  fetchMaxChars: 20000,
  enableFetch: true,
};

export {
name,
inject,
SETTINGS_NAMESPACE,
VERSION,
UA_BROWSER,
UA_BOT,
DEFAULTS
};
