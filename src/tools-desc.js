// ═══════════════════════════════════════════════════════════════════
// 工具描述（tools-desc）：routeLine / toolDescription / enginePrompt
// 由 scripts/split-src.mjs 从 dist/index.js 按行切片自动生成；逻辑与 dist 逐字一致，
// 只调整了 import/export 边界。改动请改本文件，或改 src/ 后重跑该脚本（--check 可验证）。
// ═══════════════════════════════════════════════════════════════════

import { ENGINES_META, REPO_ENGINES, PKG_ENGINES, WEB_ENGINES, ENGINE_IDS, ENGINE_ALIASES } from './engines-meta.js';
import { membersOf, engineReady } from './registry.js';
/* ------------------------------------------------------------------ tools */

/** 一个引擎的入口清单（只列多条入口的引擎，一条的不啰嗦）。 */
function routeLine(id) {
  const rs = ENGINES_META[id]?.routes || [];
  if (rs.length <= 1) return '';
  const marks = { 0: '直连', 1: '加速', 2: '索引' };
  return ` 　 入口（自动回退）: ${rs.map((r) => `${r.label}[${marks[r.tier] || r.tier}]`).join(' → ')}`;
}

/** Grouped description — the model's map of the engines. */
function toolDescription(cfg) {
  const line = (id) => {
    const m = ENGINES_META[id];
    const hasDirect = (m.routes || []).some((r) => r.tier === 0);
    const reach = m.direct === false ? '直连不可达，走镜像' : hasDirect ? '直连可用' : '仅镜像入口';
    const token = m.token && !engineReady(id, cfg) ? '，当前未配置令牌→自动跳过' : '';
    const rl = routeLine(id);
    return `  - ${id}（${m.label}，${reach}${token}）: ${m.what}。适合：${m.useWhen}${rl ? `\n${rl}` : ''}`;
  };
  return [
    '网页/代码/依赖包搜索，可显式指定搜索引擎。当任务明显匹配某个引擎时优先用本工具，而不是通用搜索。',
    '代码仓库类（省略 engine 时自动走 repo 多源合并）：',
    ...REPO_ENGINES.map(line),
    `  - repo（多源合并，推荐）: 并行查询 ${membersOf('repo', cfg).join(' + ')}，按来源轮转合并，避免只看 GitHub`,
    '依赖包类（省略 engine 时自动走 pkg 多源合并）：',
    ...PKG_ENGINES.map(line),
    `  - pkg（多源合并，推荐）: 并行查询 ${membersOf('pkg', cfg).join(' + ')}`,
    '通用网页：',
    ...WEB_ENGINES.map(line),
    '请求的是「源」，不是「入口」：同一个源的直连 / 镜像 / 加速代理由插件内部按顺序回退，',
    '你不需要也不应该把镜像当成独立的搜索引擎。想强制走某条入口时才用这些别名：',
    `  ${Object.entries(ENGINE_ALIASES).map(([a, v]) => `${a}→${v.engine}(${v.route})`).join('｜')}`,
    '省略 engine 时按 engineOrder（默认 Bing → 百度 → DuckDuckGo）顺序尝试。' +
      '推荐：根据任务用 engine 显式指定来源（代码→repo、依赖包→pkg、模型→huggingface、' +
      '中文网页→baidu、单一托管站→github/gitlab…），并用 maxResults 等参数控制返回量。',
    'engine 传 auto 等同于省略。若某个引擎失败（限流、反爬、无令牌），会自动降级到下一个。',
    '返回值里的 routes 字段记录了每个源实际用了哪条入口 —— 结果异常时先看它，再怀疑内容。',
  ].join('\n');
}

/**
 * System-prompt guidance placed right after the stock `web_search` section.
 * Tool descriptions tell the model *what exists*; this tells it *which one to
 * reach for*, which is what actually changes behaviour.
 */
function enginePrompt(cfg) {
  const usable = (id) => engineReady(id, cfg) && ENGINES_META[id].group !== 'composite';
  const list = ENGINE_IDS.filter(usable)
    .map((id) => {
      const m = ENGINES_META[id];
      const n = (m.routes || []).length;
      return `${id}=${m.label}（${m.what}${n > 1 ? `；${n} 条入口自动回退` : ''}）`;
    })
    .join('；');
  return [
    `可用搜索引擎：${list}。`,
    '每个引擎背后可能有多个入口（直连 / 镜像 / 加速代理），插件自己会按顺序回退，你不需要关心走的是哪条路。',
    '当任务明显匹配某个引擎时，用 web_search_engine 并显式指定 engine，而不是笼统地用 web_search：',
    '· 找开源项目 / 库 / 框架 / SDK / CLI / 插件源码、对比同类实现 → engine="repo"（默认多源合并：GitHub + GitLab + Codeberg + Gitea，配了 Gitee 令牌还会带上码云），不要只指定 github，否则会漏掉其他托管站的项目',
    '· 找依赖包 / 库的版本与下载量（npm / Rust / PHP / .NET / Ruby / Java / HuggingFace 模型） → engine="pkg"',
    '· 找模型 / 数据集 → engine="huggingface"；只看某一个源 → engine="gitlab"、"engine="codeberg" 等',
    '· 纯中文内容、国内站点、百科、问答、论坛帖 → engine="baidu"',
    '· 技术文档 / 教程 / 新闻 / 产品官网 / 报错信息（中英文通用） → 省略 engine，默认走 Bing 中国（与 Edge 默认搜索引擎一致）',
    '省略 engine 时按 engineOrder 顺序尝试（默认 Bing → 百度）。任务明显匹配某引擎时务必显式传 engine，' +
      '并给合适参数，而不是笼统用通用搜索兜底。',
    '回答时说明结果来自哪个搜索引擎及其局限（例如仓库类搜索只覆盖各托管站的公开项目，不代表全网；镜像入口的数据可能比官方源滞后）。',
  ].join('\n');
}

export {
routeLine,
toolDescription,
enginePrompt
};
