# src/ — dsh-websearch-direct 宿主半边源码存档

> 2026-10-18 从 `dist/index.js`（v0.4.11，sha256=`7ac798ea…377`，2117 行）按**功能块**拆分，
> 供后续直接修改。**src/ 是权威源码；dist/index.js 是旧的单体产物，不要手改 dist。**

## 拆分原理

`dist/index.js` 是宿主半边的单体 ES 模块。`scripts/split-src.mjs` 按「行区间」把它的
各段**原样**切片到 `src/` 下的多个模块，只补上 import/export 边界，**逻辑逐字一致**
（已用回归对照验证，见后）。可随时再生成：

```bash
node scripts/split-src.mjs           # 重新生成 src/（覆盖）
node scripts/split-src.mjs --check   # 校验 src/ 与重新生成结果一致（不一致退出码 1）
```

## 模块清单（功能块 → 原 dist 行区间）

| 模块 | 原行区间 | 职责 |
| --- | --- | --- |
| `index.js` | L1-54 | 公共出口：`name` / `inject` / `SETTINGS_NAMESPACE` / `Config` / `apply`（形状与 dist 一致） |
| `deps.js` | L62-117 | 可选依赖解析：`resolutionBases` / `BASES` / `optionalImport` / `Schema` / `defineTool` |
| `constants.js` | L119-121,125-141,545-575 | 插件身份、UA 双套、意图正则、`DEFAULTS` |
| `utils.js` | L632-676 | 纯工具：HTML 清洗、`isOff` / `clampInt` |
| `net.js` | L634-635,678-822 | 网络层：undici 代理管线（双坑注释在内）、`request` / `getJson` |
| `items.js` | L892-930 | 结果条目标签：`repoItem` / `giteaPick` / `pkgItem` |
| `parsers.js` | L824-890 | Bing / 百度 / DuckDuckGo HTML 解析 |
| `engines-meta.js` | L143-543,1566-1570,1630-1633 | 引擎表 + 分组 + 别名 + `BUILTIN_ROUTES` / `customEngineIdsFor` |
| `config.js` | L577-630 | `Config` Schema（无 schemastery 时仍为 undefined，降级语义不变） |
| `route-exec.js` | L932-1144 | 路由健康度 / 排序 / `runRoute` / `runEngine` |
| `registry.js` | L1146-1287 | 运行时引擎注册表、`membersOf` / `engineReady` / 组合搜索 / `normaliseResult` |
| `pick-order.js` | L1289-1322 | `pickOrder` 意图路由 / `renderSources` |
| `gh-mirrors.js` | L1324-1352 | GitHub 加速镜像回退 `fetchWithMirrors` |
| `tools-desc.js` | L1354-1423 | 工具描述 / 系统提示（`toolDescription` / `enginePrompt`） |
| `ui-settings.js` | L1425-1696 | 设置卡片：状态模型 / 持久化 / `installCustomEngines` / `uiSnapshot` |
| `plugin.js` | L1698-2117 | `apply(ctx, config)`：搜/抓提供者、引擎工具、系统提示、设置 HTTP 数据面 |

依赖方向（无环）：`deps` → `constants` / `utils` / `items` / `parsers` → `engines-meta` → `config` / `net` / `route-exec` → `registry` → `pick-order` / `gh-mirrors` / `tools-desc` / `ui-settings` → `plugin` → `index`。

## 拆分时的三个特殊处理（改代码前必读）

1. **`export const/function` 下放**：dist 里 `name` / `inject` / `SETTINGS_NAMESPACE`、
   `Config`、`apply` 是内联导出，切分后改为普通声明，统一由各模块底部 `export { … }` 导出，
   `index.js` 再汇总 —— 公共形状与 dist 完全一致。
2. **`customEngineIdsFor` 归 engines-meta**：它只是枚举 `ENGINES_META` 的键，且被
   `registry.membersOf` 与 `ui-settings.uiSnapshot` 两处使用，放 meta 层避免成环。
3. **`installCustomEngines` / `syncUiRoutes` 归 ui-settings**：本质是「把设置状态写进
   运行时引擎表」，与卡片状态同模块；它们修改的是 `engines-meta`/`registry` 导出的
   同一份对象（引用共享），行为与单体时代一致。`net.js` 额外收纳了原 utils 段的
   `const UA = UA_BROWSER`（它是 request 的默认 UA）。

## 后续修改与回归

```bash
# 1) 改 src/xxx.js（不要改 dist/）
# 2) 重新生成校验 + 离线/联网回归
node scripts/split-src.mjs --check
node scripts/check-parity.mjs            # 离线：形状 + 错误路径
node scripts/check-parity.mjs --live     # 联网：真实搜索结果对比 dist/SRC
node scripts/live-smoke.mjs ./src/index.js "<查询词>" [engine]
# 3) 验证通过后，重新打包 dist（如已安装 esbuild）
npx esbuild src/index.js --bundle --format=esm --platform=node --target=node22 \
  --outfile=dist/index.js --log-level=warning
```

> 2026-10-18 回归记录：`--check` 一致；离线 + 联网（web/pkg/显式 github 三类查询）
> 全部 PASS；`pkg` 多源合并在 SRC 上的结果与 dist 一致（npm/crates/Packagist/NuGet…轮转合并）。
