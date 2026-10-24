#!/usr/bin/env node
/**
 * scripts/split-src.mjs — 把 dist/index.js 按功能块拆分成 src/ 模块源码。
 *
 * 原理：dist/index.js 是宿主半边的单体产物。本脚本按「行区间」把它的各段
 * 原样切片出来，配上 import/export 边界，生成 src/ 下的多个 ES 模块 ——
 * 逻辑逐字一致，只动了模块边界。之后在 src/ 里改代码，重跑本脚本可重新
 * 生成（--check 模式验证「已归档的 src/ 与重新生成的结果完全一致」）。
 *
 * 用法：
 *   node scripts/split-src.mjs           # 生成/覆盖 src/ 下各模块
 *   node scripts/split-src.mjs --check   # 只校验，不一致则非零退出
 *
 * 修改手法（重要）：
 *   1) src/xxx.js 是唯一权威源码；dist/index.js 是旧产物，不要手改 dist。
 *   2) 改完 src/ 后按需打包：
 *      npx esbuild src/index.js --bundle --format=esm --platform=node \
 *        --target=node22 --outfile=dist/index.js
 *   3) 想新增/移动功能块时，编辑本文件的 SPEC，再重跑。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist', 'index.js');
const OUT_DIR = join(ROOT, 'src');

const lines = readFileSync(DIST, 'utf8').split('\n'); // 0-based；对外按 1-based
const slice = (s, e) => lines.slice(s - 1, e).join('\n'); // 1-based 闭区间

const HEAD = (title, note) =>
  '// ═══════════════════════════════════════════════════════════════════\n' +
  `// ${title}\n` +
  '// 由 scripts/split-src.mjs 从 dist/index.js 按行切片自动生成；逻辑与 dist 逐字一致，\n' +
  '// 只调整了 import/export 边界。改动请改本文件，或改 src/ 后重跑该脚本（--check 可验证）。\n' +
  (note ? `// ${note}\n` : '') +
  '// ═══════════════════════════════════════════════════════════════════\n\n';

/** 组装一个模块：头注释 + imports + 切片主体 + exports。 */
function build({ title, note = '', imports = [], ranges, stripExports = [], exports }) {
  let body = ranges.map(([s, e]) => slice(s, e)).join('\n\n');
  for (const name of stripExports) {
    // 注意：被剥离的符号可能是 body 的首行（没有前导换行），所以同时允许「行首」。
    body = body
      .replace(new RegExp('(^|\\n)export const ' + name + '\\b'), (m) => (m.startsWith('\n') ? '\n' : '') + 'const ' + name)
      .replace(new RegExp('(^|\\n)export function ' + name + '\\b'), (m) => (m.startsWith('\n') ? '\n' : '') + 'function ' + name);
  }

  const importBlock = imports.length ? imports.join('\n') + '\n' : '';
  return (
    HEAD(title, note) +
    importBlock +
    body.trimEnd() +
    '\n\nexport {\n' +
    exports.join(',\n') +
    '\n};\n'
  );
}

/** 顺序即文件依赖关系（无环：meta ← registry ← 上层；ui-settings 读取 registry）。 */
const SPEC = [
  {
    file: 'deps.js',
    title: '可选依赖解析（deps）：resolutionBases / optionalImport / Schema / defineTool',
    note: 'dist L56-60 的三个 node 内建 import 移到这里；L110-117 的顶层可选导入块原样保留。',
    imports: [
      "import { createRequire } from 'node:module';",
      "import { pathToFileURL } from 'node:url';",
      "import { join } from 'node:path';",
    ],
    ranges: [
      [62, 74], // 注释含收尾 */
      [75, 117],
    ],
    exports: ['resolutionBases', 'BASES', 'optionalImport', 'Schema', 'defineTool'],
  },
  {
    file: 'constants.js',
    title: '插件身份与常量（constants）：name / inject / UA / 意图正则 / DEFAULTS',
    note: '原文 L119-121 的 `export const` 改为普通 const，底部统一导出。',
    imports: [],
    ranges: [
      [119, 121],
      [125, 141],
      [545, 575],
    ],
    stripExports: ['name', 'inject', 'SETTINGS_NAMESPACE'],
    exports: ['name', 'inject', 'SETTINGS_NAMESPACE', 'UA_BROWSER', 'UA_BOT', 'PKG_INTENT', 'CODE_INTENT', 'DEFAULTS'],
  },
  {
    file: 'utils.js',
    title: '纯工具（utils）：HTML 清洗 / 布尔与数值解析',
    ranges: [
      [632, 633],
      [636, 676],
    ],
    exports: ['decodeEntities', 'stripTags', 'htmlToText', 'isOff', 'clampInt'],
  },
  {
    file: 'net.js',
    title: '网络层（net）：代理管线（undici 双坑注释）+ request / getJson',
    note: 'dist L634-635 的 `const UA = UA_BROWSER`（request 默认 UA）随网络层迁入；L678-822 的代理注释与实现原样保留。',
    imports: [
      "import { optionalImport } from './deps.js';",
      "import { UA_BROWSER } from './constants.js';",
    ],
    ranges: [
      [634, 635],
      [678, 822],
    ],
    exports: ['request', 'getJson'],
  },
  {
    file: 'items.js',
    title: '结果条目建构（items）：repoItem / giteaPick / pkgItem',
    ranges: [[892, 930]],
    exports: ['repoItem', 'giteaPick', 'pkgItem'],
  },
  {
    file: 'parsers.js',
    title: '网页结果解析器（parsers）：Bing / Baidu / DuckDuckGo HTML',
    imports: ["import { decodeEntities, stripTags } from './utils.js';"],
    ranges: [[824, 890]],
    exports: ['parseBing', 'parseBaidu', 'parseDdg'],
  },
  {
    file: 'engines-meta.js',
    title: '引擎表（engines-meta）：ENGINES_META + 引擎分组 + 别名 + 派生注册表',
    note: 'dist 设置页一段里的 BUILTIN_ROUTES / customEngineIdsFor 也是纯「读引擎表」的派生数据，归入本模块。',
    imports: [
      "import { repoItem, giteaPick, pkgItem } from './items.js';",
      "import { parseBing, parseBaidu, parseDdg } from './parsers.js';",
    ],
    ranges: [
      [143, 533],
      [536, 543],
      [1566, 1570],
      [1630, 1633],
    ],
    exports: ['ENGINES_META', 'REPO_ENGINES', 'PKG_ENGINES', 'WEB_ENGINES', 'COMPOSITE_ENGINES', 'ENGINE_IDS', 'ENGINE_ALIASES', 'ALL_ENGINE_IDS', 'baseEngineId', 'pinnedRoute', 'BUILTIN_ROUTES', 'customEngineIdsFor'],
  },
  {
    file: 'config.js',
    title: '配置 Schema（config）：Config',
    note: '原文 L577 的 `export const Config` 改为 const，底部统一导出；未装 schemastery 时 Config 为 undefined（降级语义不变）。',
    imports: [
      "import { Schema } from './deps.js';",
      "import { ALL_ENGINE_IDS } from './engines-meta.js';",
      "import { DEFAULTS } from './constants.js';",
    ],
    ranges: [[577, 630]],
    stripExports: ['Config'],
    exports: ['Config'],
  },
  {
    file: 'route-exec.js',
    title: '路由执行层（route-exec）：路由健康度 / 排序 / runRoute / runEngine',
    imports: [
      "import { ENGINES_META } from './engines-meta.js';",
      "import { UA_BOT, UA_BROWSER } from './constants.js';",
      "import { clampInt } from './utils.js';",
      "import { request, getJson } from './net.js';",
    ],
    ranges: [[932, 1144]],
    exports: ['runEngine', 'orderedRoutes', 'runRoute', 'isRouteUnavailable'],
  },
  {
    file: 'registry.js',
    title: '运行时注册表（registry）：ENGINES 构建 / membersOf / engineReady / 组合搜索',
    note: 'membersOf 需要的 customEngineIdsFor 从 engines-meta 导入（避免与设置页模块成环）。',
    imports: [
      "import { ENGINES_META, baseEngineId, customEngineIdsFor, REPO_ENGINES, PKG_ENGINES } from './engines-meta.js';",
      "import { runEngine } from './route-exec.js';",
      "import { clampInt } from './utils.js';",
      "import { DEFAULTS } from './constants.js';",
    ],
    ranges: [[1146, 1287]],
    exports: ['ENGINES', 'membersOf', 'engineReady', 'canonUrl', 'compositeSearch', 'COMPOSITES', 'normaliseResult'],
  },
  {
    file: 'pick-order.js',
    title: '引擎挑选（pick-order）：pickOrder / renderSources',
    imports: [
      "import { ENGINES, COMPOSITES } from './registry.js';",
      "import { ENGINE_ALIASES, baseEngineId } from './engines-meta.js';",
      "import { DEFAULTS, PKG_INTENT, CODE_INTENT } from './constants.js';",
    ],
    ranges: [[1289, 1322]],
    exports: ['pickOrder', 'renderSources'],
  },
  {
    file: 'gh-mirrors.js',
    title: 'GitHub 加速镜像（gh-mirrors）：fetchWithMirrors',
    imports: [
      "import { request } from './net.js';",
      "import { isOff } from './utils.js';",
    ],
    ranges: [[1324, 1352]],
    exports: ['fetchWithMirrors', 'GH_MIRRORS'],
  },
  {
    file: 'tools-desc.js',
    title: '工具描述（tools-desc）：routeLine / toolDescription / enginePrompt',
    imports: [
      "import { ENGINES_META, REPO_ENGINES, PKG_ENGINES, WEB_ENGINES, ENGINE_IDS, ENGINE_ALIASES } from './engines-meta.js';",
      "import { membersOf, engineReady } from './registry.js';",
    ],
    ranges: [[1354, 1423]],
    exports: ['routeLine', 'toolDescription', 'enginePrompt'],
  },
  {
    file: 'ui-settings.js',
    title: '设置卡片状态面（ui-settings）：UI 模型 / 持久化 / 自定义引擎安装 / uiSnapshot',
    note: 'custom 引擎的安装（installCustomEngines）与内置源追加入口同步（syncUiRoutes）本质是「把设置状态写进运行时引擎表」，故与卡片状态同模块，读取 registry/engines-meta。',
    imports: [
      "import { homedir } from 'node:os';",
      "import { join, dirname } from 'node:path';",
      "import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';",
      "import { ENGINES_META, BUILTIN_ROUTES, customEngineIdsFor } from './engines-meta.js';",
      "import { ENGINES } from './registry.js';",
      "import { runEngine } from './route-exec.js';",
    ],
    ranges: [
      [1425, 1474],
      [1476, 1564],
      [1572, 1628],
      [1635, 1696],
    ],
    exports: ['UI_CATEGORY_DEFS', 'UI_CUSTOM_MAX', 'UI_MODEL_VERSION', 'UI_DEFAULT', 'uiStateFile', 'asUrl', 'normaliseUiState', 'loadUiState', 'saveUiState', 'syncUiRoutes', 'installCustomEngines', 'uiSnapshot'],
  },
  {
    file: 'plugin.js',
    title: '插件入口（plugin）：apply(ctx, config) —— 提供者 / 工具 / 系统提示 / 设置数据面',
    note: '原文 L1698 的 `export function apply` 改为 function，由 index.js 统一导出。',
    imports: [
      "import { unlinkSync } from 'node:fs';",
      "import { Config } from './config.js';",
      "import { SETTINGS_NAMESPACE, DEFAULTS } from './constants.js';",
      "import { defineTool } from './deps.js';",
      "import { isOff, htmlToText, clampInt } from './utils.js';",
      "import { ENGINES, COMPOSITES, engineReady, normaliseResult } from './registry.js';",
      "import { ENGINE_ALIASES, baseEngineId, pinnedRoute, ENGINES_META, ALL_ENGINE_IDS } from './engines-meta.js';",
      "import { pickOrder, renderSources } from './pick-order.js';",
      "import { fetchWithMirrors } from './gh-mirrors.js';",
      "import { toolDescription, enginePrompt } from './tools-desc.js';",
      "import { loadUiState, saveUiState, uiSnapshot, asUrl, uiStateFile, UI_DEFAULT, UI_CATEGORY_DEFS, UI_CUSTOM_MAX, installCustomEngines } from './ui-settings.js';",
    ],
    ranges: [[1698, 2117]],
    stripExports: ['apply'],
    exports: ['apply'],
  },
];

/** index.js：保留 dist 顶部的插件设计说明，再统一导出公共 API（形状与 dist 一致）。 */
function buildIndex() {
  const body = slice(1, 54); // 已含 /** ... */ 完整注释块（dist 顶部的插件设计说明）
  const reexports = [
    "export { name, inject, SETTINGS_NAMESPACE } from './constants.js';",
    "export { Config } from './config.js';",
    "export { apply } from './plugin.js';",
  ].join('\n');
  return (
    body + '\n' +
    '/* ————————————————————————————————————————————————————————\n' +
    ' * 本文件是 src/ 模块树的公共出口（由 scripts/split-src.mjs 生成）。\n' +
    ' * 与 dist/index.js 的公共形状一致：name / inject / SETTINGS_NAMESPACE / Config / apply。\n' +
    ' * ———————————————————————————————————————————————————————— */\n\n' +
    reexports + '\n'
  );
}

function main() {
  const check = process.argv.includes('--check');
  const distExists = existsSync(DIST);
  if (!distExists) {
    console.error(`[split] 找不到 ${DIST}`);
    process.exit(2);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const files = [...SPEC.map((s) => ({ file: s.file, content: build(s) })), { file: 'index.js', content: buildIndex() }];

  let changed = false;
  for (const { file, content } of files) {
    const out = join(OUT_DIR, file);
    if (check) {
      const current = existsSync(out) ? readFileSync(out, 'utf8') : null;
      if (current !== content) {
        console.log(`[split] ✗ ${file} 与重新生成结果不一致（${current === null ? '缺失' : '内容变更'}）`);
        changed = true;
      } else {
        console.log(`[split] ✓ ${file} 一致`);
      }
    } else {
      writeFileSync(out, content);
      console.log(`[split] 写 ${file}（${content.split('\n').length} 行）`);
    }
  }

  if (check) {
    if (changed) {
      console.error('[split] --check 失败：src/ 与 dist 切片不一致，请重跑 split-src.mjs 重新生成。');
      process.exit(1);
    }
    console.log(`[split] --check 通过：${files.length} 个文件与重新生成结果完全一致。`);
  } else {
    console.log(`[split] 完成：src/ 下共 ${files.length} 个文件。`);
  }
}

main();
