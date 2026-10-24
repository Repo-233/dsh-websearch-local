// ═══════════════════════════════════════════════════════════════════
// 引擎挑选（pick-order）：pickOrder / renderSources
// 由 scripts/split-src.mjs 从 dist/index.js 按行切片自动生成；逻辑与 dist 逐字一致，
// 只调整了 import/export 边界。改动请改本文件，或改 src/ 后重跑该脚本（--check 可验证）。
// ═══════════════════════════════════════════════════════════════════

import { ENGINES, COMPOSITES } from './registry.js';
import { ENGINE_ALIASES, baseEngineId } from './engines-meta.js';
import { DEFAULTS } from './constants.js';
/* --------------------------------------------------------------- routing */

/**
 * Decide which engines to try, in order. An explicit choice always wins.
 * 意图推断已移除（v0.5）：不再根据关键词自动跳到 repo/pkg 组合；由模型通过
 * web_search_engine 的 engine 参数自行选择来源，maxResults 等参数亦由模型控制。
 * 省略 engine 时，按 engineOrder（默认 Bing → 百度 → DuckDuckGo）顺序尝试。
 */
function pickOrder(query, explicit, cfg) {
  const known = (e) => !!(ENGINES[e] || COMPOSITES[e] || ENGINE_ALIASES[e]);
  // A configured order that filters down to nothing must NOT replace the
  // defaults — an all-invalid engineOrder used to leave an empty list, which
  // then surfaced as "所有引擎均失败（已尝试 ）。"
  const configured = (Array.isArray(cfg.engineOrder) ? cfg.engineOrder : [])
    .map(baseEngineId)
    .filter((e) => ENGINES[e] || COMPOSITES[e]);
  const fallback = configured.length ? configured : DEFAULTS.engineOrder.slice();

  // 别名（npmmirror / hf-mirror …）要原样保留，runSearch 靠它决定 pin 哪条路由
  if (explicit && known(explicit)) return [explicit];
  return fallback;
}

function renderSources(sources) {
  return sources
    .map((s, i) => `[${i + 1}] ${s.title}\n${s.url}${s.snippet ? `\n${s.snippet}` : ''}`)
    .join('\n\n');
}

export {
pickOrder,
renderSources
};
