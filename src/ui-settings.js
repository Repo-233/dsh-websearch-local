// ═══════════════════════════════════════════════════════════════════
// 设置卡片状态面（ui-settings）：UI 模型 / 持久化 / 自定义引擎安装 / uiSnapshot
// 由 scripts/split-src.mjs 从 dist/index.js 按行切片自动生成；逻辑与 dist 逐字一致，
// 只调整了 import/export 边界。改动请改本文件，或改 src/ 后重跑该脚本（--check 可验证）。
// custom 引擎的安装（installCustomEngines）与内置源追加入口同步（syncUiRoutes）本质是「把设置状态写进运行时引擎表」，故与卡片状态同模块，读取 registry/engines-meta。
// ═══════════════════════════════════════════════════════════════════

import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { ENGINES_META, BUILTIN_ROUTES, customEngineIdsFor } from './engines-meta.js';
import { ENGINES } from './registry.js';
import { runEngine } from './route-exec.js';
/* ----------------------------------------------------------------- plugin */

/* ------------------------------------------------ 设置页 UI（卡片数据面） */

/**
 * 设置 → 插件 里的「联网搜索（直连优先）」卡片走的是 dshmarket 验证过的三件套：
 *
 *   1. settings 命名空间（上面 apply 里已注册）——让设置页把 `websearch-direct`
 *      列进「插件配置」标签页；
 *   2. 自有 HTTP 路由 /dsh-websearch-direct/api/*——卡片读写配置的数据面；
 *   3. 浏览器半边 client/client.js——认领 `settings.plugin.item` 槽位（key=命名空间）。
 *
 * UI 配置持久化在 <DSH_HOME>/storages/websearch-direct/ui-config.json，
 * 与 cordis 配置（Config schema）解耦：卡片是这个文件的唯一写者。
 */

/** 设置卡片上的四个大类：id → 内置源清单 + 自定义源的兼容类型。 */
const UI_CATEGORY_DEFS = [
  { id: 'code', label: '代码仓库', engines: ['github', 'gitlab', 'codeberg', 'gitea', 'gitee'], customKind: 'gitea' },
  { id: 'pkg', label: '包管理', engines: ['npm', 'crates', 'packagist', 'nuget', 'rubygems'], customKind: 'npm' },
  { id: 'model', label: '模型仓库', engines: ['huggingface'], customKind: 'hf' },
  { id: 'web', label: '网页搜索', engines: ['bing', 'baidu', 'duckduckgo'], customKind: 'bing' },
];

/** 每个大类最多允许几个自定义源（防呆上限）。 */
const UI_CUSTOM_MAX = 8;

/**
 * UI 配置数据模型版本（写进 ui-config.json 与 GET 快照）。
 *   v1 → v2：custom 从 {label,url,proxy} 变成 {name,url,proxies[]}
 *   v2 → v3：自定义代理的启停状态从 routeOverrides["<engId>|代理 N"]
 *            （按 label 定位，删除代理后 label 重排 → 状态错位）
 *            移进 custom.proxies[i].enabled（按数组位置定位）。
 * 读盘对 v1/v2/v3 都兼容：normaliseUiState 会把旧形状归一成当前形状。
 */
const UI_MODEL_VERSION = 3;

const UI_DEFAULT = {
  version: UI_MODEL_VERSION,
  /** 空 = 免 Key 直连（默认）；填写 = 所有联网搜索使用此 Key。 */
  apiKey: '',
  /** 全局代理地址；空 = 不走全局代理。 */
  proxyUrl: '',
  /** 「引擎id|路由label」 -> { proxy?: true|false, url?: 覆盖地址 }；删除该键 = 恢复默认。 */
  routeOverrides: {},
  /** 引擎id -> [ { url } ]：给内置源追加的代理入口（url 可为空 = 待填写，运行时跳过）。 */
  routeExtras: {},
  /** 大类id -> [ { name, url, proxies: [ { url } ] } ]：自定义源 = 名称 + 官方直连 + 代理列表。 */
  custom: { code: [], pkg: [], model: [], web: [] },
};

function uiStateFile() {
  const home = (process.env.DSH_HOME || '').trim() || join(homedir(), '.dsh');
  return join(home, 'storages', 'websearch-direct', 'ui-config.json');
}

function asUrl(v) {
  const s = String(v ?? '').trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

function normaliseUiState(raw) {
  const s = { ...structuredClone(UI_DEFAULT), ...(raw && typeof raw === 'object' ? raw : {}) };
  s.apiKey = typeof s.apiKey === 'string' ? s.apiKey : '';
  s.proxyUrl = typeof s.proxyUrl === 'string' ? s.proxyUrl : '';
  const overrides = {};
  if (s.routeOverrides && typeof s.routeOverrides === 'object') {
    for (const [k, v] of Object.entries(s.routeOverrides)) {
      if (typeof k !== 'string' || !k.includes('|') || !v || typeof v !== 'object') continue;
      const o = {};
      if (v.proxy === true || v.proxy === false) o.proxy = v.proxy;
      const u = asUrl(v.url);
      if (u) o.url = u;
      // v2 遗留：启停状态存在 routeOverrides[<engId>|<label>].enabled。
      // 这里必须原样保留 —— 丢掉它会让旧配置里「停用的入口」在下次读盘时
      // 静默变回启用（内置源的追加入口至今仍走这条路径）。
      if (v.enabled === false) o.enabled = false;
      if (Object.keys(o).length) overrides[k] = o;
    }
  }
  s.routeOverrides = overrides;
  const extras = {};
  if (s.routeExtras && typeof s.routeExtras === 'object') {
    for (const [engId, list] of Object.entries(s.routeExtras)) {
      if (typeof engId !== 'string' || engId.startsWith('custom-') || !Array.isArray(list)) continue;
      // routeExtras 是与 routeOverrides / custom 并列的独立写入路径：内置源用
      // 「＋代理」追加的入口存在这里。启停状态同样必须原样保留 ——
      // 旧写法 `list.map(x => asUrl(x?.url))` 只取 url，会把 enabled 丢掉，
      // 于是停用的追加入口每次读盘都静默变回启用。
      const items = list
        .map((x) => ({ url: asUrl(x?.url), enabled: x && typeof x === 'object' && x.enabled === false }))
        .filter((x) => x.url)
        .slice(0, UI_CUSTOM_MAX)
        .map((x) => ({ url: x.url, ...(x.enabled ? { enabled: false } : {}) }));
      if (items.length) extras[engId] = items;
    }
  }
  s.routeExtras = extras;
  const custom = {};
  for (const cat of UI_CATEGORY_DEFS) {
    const list = Array.isArray(s.custom?.[cat.id]) ? s.custom[cat.id] : [];
    custom[cat.id] = list
      .slice(0, UI_CUSTOM_MAX)
      .map((x) => ({
        // v1 遗留 { label, url, proxy } → { name, url, proxies: [] }
        name: String(x.name ?? x.label ?? '').trim().slice(0, 40),
        url: asUrl(x.url),
        proxies: Array.isArray(x.proxies)
          ? x.proxies
              .map((p) => ({
                url: asUrl(p?.url ?? p),
                // v3：启停状态存在条目本身（缺省 = 启用）；v1/v2 遗留条目无此字段。
                ...(p && typeof p === 'object' && p.enabled === false ? { enabled: false } : {}),
              }))
              .filter((p) => p.url)
              .slice(0, UI_CUSTOM_MAX)
          : [],
      }))
      .filter((x) => x.url);
  }
  s.custom = custom;
  // 旧配置（v1/v2）读上来后归一成当前模型版本：结构已经按 v3 形状重建，
  // version 字段必须跟着走，否则「版本号」与「真实结构」会长期不一致。
  s.version = UI_MODEL_VERSION;
  return s;
}

function loadUiState() {
  try {
    return normaliseUiState(JSON.parse(readFileSync(uiStateFile(), 'utf8')));
  } catch {
    return structuredClone(UI_DEFAULT);
  }
}

function saveUiState(state) {
  const file = uiStateFile();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
}

/** 把 routeExtras（内置源追加的代理入口）同步进运行时路由表。 */
function syncUiRoutes(state) {
  for (const [engId, def] of Object.entries(ENGINES_META)) {
    if (engId.startsWith('custom-')) continue;
    const pristine = BUILTIN_ROUTES[engId];
    if (!pristine) continue;
    const extras = (state.routeExtras[engId] || []).map((x, i) => ({
      label: `自定义代理 ${i + 1}`,
      base: x.url, // 可为空 = 待填写；runEngine 会跳过空入口
      tier: 1,
      extra: true,
      // extraIndex = 在 routeExtras[engId] 数组里的位置。与自定义源代理的
      // proxyIndex 同理：启停状态按位置回查条目本身，不靠 label 字符串定位。
      extraIndex: i,
    }));
    def.routes = pristine.concat(extras);
  }
}

/**
 * 把自定义源安装成真实引擎，并同步内置源的追加入口。
 * 克隆同类内置引擎的定义、只换 base —— 自建 Gitea 的 API 和 gitea.com
 * 是同一个形状，npmmirror 和 registry.npmjs.org 也是。
 */
function installCustomEngines(state) {
  for (const engId of Object.keys(ENGINES_META)) {
    if (engId.startsWith('custom-')) {
      delete ENGINES_META[engId];
      delete ENGINES[engId];
    }
  }
  syncUiRoutes(state);
  const kinds = { code: 'gitea', pkg: 'npm', model: 'hf', web: 'bing' };
  const groups = { code: 'repo', pkg: 'pkg', model: 'pkg', web: 'web' };
  for (const cat of UI_CATEGORY_DEFS) {
    (state.custom[cat.id] || []).forEach((src, i) => {
      if (!src.url) return;
      const engId = `custom-${cat.id}-${i + 1}`;
      const ref = ENGINES_META[kinds[cat.id] === 'gitea' ? 'gitea' : kinds[cat.id] === 'npm' ? 'npm' : kinds[cat.id] === 'hf' ? 'huggingface' : 'bing'];
      if (!ref) return;
      const name = src.name || src.url.replace(/^https?:\/\//i, '');
      const routes = [{ label: '直连', base: src.url, tier: 0 }];
      (src.proxies || []).forEach((p, j) => {
        // proxyIndex = 在 custom.proxies 数组里的位置：启停状态存在条目本身
        // （p.enabled），删除某条代理后其余条目位置不变，不会错位。
        routes.push({ label: `代理 ${j + 1}`, base: p.url, tier: 1, proxyIndex: j });
      });
      ENGINES_META[engId] = {
        ...ref,
        label: name,
        group: groups[cat.id],
        routes,
      };
      ENGINES[engId] = (query, opts) => runEngine(engId, query, opts);
    });
  }
}

/** 卡片 GET 的完整快照：源 → 入口（类型 + 可编辑网址 + 覆盖状态）。 */
function uiSnapshot(state) {
  return {
    version: UI_MODEL_VERSION,
    apiKeySet: !!state.apiKey,
    proxyUrl: state.proxyUrl,
    categories: UI_CATEGORY_DEFS.map((cat) => {
      const ids = cat.engines.filter((e) => ENGINES_META[e]).concat(customEngineIdsFor(cat.id));
      return {
        id: cat.id,
        label: cat.label,
        engines: ids.map((e) => {
          const def = ENGINES_META[e];
          const isCustom = e.startsWith('custom-');
          return {
            id: e,
            label: def.label,
            custom: isCustom,
            routes: (def.routes || []).map((r) => {
              const key = `${e}|${r.label}`;
              const ov = state.routeOverrides[key] || {};
              // 自定义代理的启停状态存在条目本身（custom.proxies[idx].enabled，
              // v3 数据模型）；routeOverrides.enabled 作 v2 旧配置回退——
              // 删除代理导致 label 重排时，按位置定位的状态不受影响。
              const catId = isCustom ? e.slice('custom-'.length, e.lastIndexOf('-')) : null;
              const idx = typeof r.proxyIndex === 'number' ? r.proxyIndex : -1;
              const entry = idx >= 0 && catId ? (state.custom[catId] || [])[Number(e.slice(e.lastIndexOf('-') + 1)) - 1]?.proxies?.[idx] : null;
              const legacyEnabled = ov.enabled !== false;
              // v3 条目显式为 false 时以条目为准；否则回退看 v2 的 routeOverrides。
              // 不能写成 `entry ? entry.enabled !== false : legacyEnabled`：
              // 自定义代理的 entry 恒为真，那样会让 v2 旧配置的「停用」被静默丢弃。
              // 内置源「＋代理」追加的入口走 routeExtras（extra:true），同样按
              // extraIndex 回查条目本身的 enabled —— 它与 routeOverrides 是两条
              // 独立路径，只看后者会让这类入口的停用状态永远显示为启用。
              const extraEntry =
                r.extra && typeof r.extraIndex === 'number'
                  ? (state.routeExtras[e] || [])[r.extraIndex]
                  : null;
              const entrySaysDisabled =
                (!!entry && entry.enabled === false) ||
                (!!extraEntry && extraEntry.enabled === false);
              const enabled = !(entrySaysDisabled || !legacyEnabled);
              return {
                key,
                tier: r.tier,
                ...(typeof r.proxyIndex === 'number' ? { proxyIndex: r.proxyIndex } : {}),
                url: ov.url || r.base || '',
                defaultUrl: r.base || '',
                type: (ov.proxy !== undefined ? ov.proxy : r.tier === 1) ? 'proxy' : 'direct',
                enabled,
                switchable: r.tier === 1,
                removable: !!r.extra || (isCustom && r.tier !== 0),
                empty: !r.base && !ov.url,
              };
            }),
          };
        }),
      };
    }),
    limits: { customMax: UI_CUSTOM_MAX },
  };
}

export {
UI_CATEGORY_DEFS,
UI_CUSTOM_MAX,
UI_MODEL_VERSION,
UI_DEFAULT,
uiStateFile,
asUrl,
normaliseUiState,
loadUiState,
saveUiState,
syncUiRoutes,
installCustomEngines,
uiSnapshot
};
