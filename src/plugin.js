// SPDX-License-Identifier: GPL-3.0-or-later
// 插件入口（plugin）：apply(ctx, config) —— 提供者 / 工具 / 系统提示 / 设置数据面

import { unlinkSync } from 'node:fs';
import { Config } from './config.js';
import { SETTINGS_NAMESPACE, DEFAULTS } from './constants.js';
import { defineTool } from './deps.js';
import { isOff, htmlToText, clampInt } from './utils.js';
import { ENGINES, COMPOSITES, engineReady, normaliseResult } from './registry.js';
import { ENGINE_ALIASES, baseEngineId, pinnedRoute, ENGINES_META, ALL_ENGINE_IDS } from './engines-meta.js';
import { pickOrder, renderSources } from './pick-order.js';
import { fetchWithMirrors } from './gh-mirrors.js';
import { toolDescription, enginePrompt } from './tools-desc.js';
import { loadUiState, saveUiState, uiSnapshot, asUrl, uiStateFile, UI_DEFAULT, UI_CATEGORY_DEFS, UI_CUSTOM_MAX, installCustomEngines } from './ui-settings.js';
function apply(ctx, config) {
  const logger = ctx.logger?.('websearch-local') || console;

  // 设置卡片的数据面：启动即装载（文件不存在 = 全默认），卡片保存后热更新。
  let uiState = loadUiState();
  installCustomEngines(uiState);

  let resolved = () => ({ ...DEFAULTS, ...config });
  ctx.inject(['settings'], (sctx) => {
    // No schema means no settings form to render and nothing to register
    // against; the profile's own config stays authoritative.
    if (!Config) return;
    try {
      const scope = sctx.settings.register(SETTINGS_NAMESPACE, Config, { base: config });
      resolved = () => ({ ...DEFAULTS, ...scope.get() });
      sctx.effect(() => () => {
        resolved = () => ({ ...DEFAULTS, ...config });
      });
    } catch {
      /* Settings service unavailable — profile defaults stay in effect. */
    }
  });

  const opts = () => {
    const c = resolved();
    // UI 卡片是更友好的表面，所以它填的值优先于 cordis 配置里的同名字段。
    const globalProxy =
      (uiState.proxyUrl || '').trim() ||
      (c.proxyUrl || '').trim() ||
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      '';
    return {
      proxyUrl: globalProxy,
      timeoutMs: Number(c.timeoutMs) || DEFAULTS.timeoutMs,
      maxResults: Number(c.maxResults) || DEFAULTS.maxResults,
      githubToken:
        (uiState.apiKey || '').trim() ||
        (c.githubToken || '').trim() ||
        process.env.GITHUB_TOKEN ||
        '',
      giteeToken: (c.giteeToken || '').trim() || process.env.GITEE_TOKEN || '',
      enableGithubMirrors: !isOff(c.enableGithubMirrors),
      routePolicy: c.routePolicy === 'accel-first' || c.routePolicy === 'direct-first'
        ? c.routePolicy
        : 'auto',
      logger,
      _cfg: c,
      _ui: uiState,
      _globalProxyUrl: globalProxy,
    };
  };

  /** Shared by the seam provider and the engine tool. */
  async function runSearch(query, explicitEngine, maxResults, signal) {
    if (!query || !String(query).trim()) throw new Error('query is required');

    // A hint we do not recognise is NOT silently dropped any more: the tool
    // layer throws on it, and the seam layer used to look like it worked.
    if (explicitEngine && !ENGINES[explicitEngine] && !COMPOSITES[explicitEngine] && !ENGINE_ALIASES[explicitEngine]) {
      logger?.warn?.(
        `websearch-local: 未知引擎 "${explicitEngine}"，已忽略该提示并按 engineOrder 顺序兜底。` +
          `可用：${ALL_ENGINE_IDS.join(' / ')}`
      );
    }

    const c = opts();
    const cfg = resolved();
    const want = clampInt(maxResults, 1, 30, c.maxResults);
    const order = pickOrder(query, explicitEngine, cfg);

    const errors = [];
    const attempted = [];
    const skipped = [];
    const routes = {};
    for (const wanted of order) {
      // 别名（npmmirror / hf-mirror …）在这里拆成「真实引擎 + 指定路由」
      const engine = baseEngineId(wanted);
      const fn = ENGINES[engine] || COMPOSITES[engine];
      if (!fn) continue;
      if (!engineReady(wanted, cfg)) {
        skipped.push(wanted);
        errors.push(`${wanted}: 未配置（跳过）`);
        continue;
      }
      attempted.push(wanted);
      const pin = pinnedRoute(wanted);
      if (pin && !(ENGINES_META[engine]?.routes || []).some((r) => r.label.includes(pin))) {
        logger?.warn?.(`websearch-local: 别名 "${wanted}" 指定的入口 "${pin}" 在 ${engine} 上不存在，退回该引擎全部入口。`);
      }
      try {
        const raw = await fn(String(query), {
          ...c,
          maxResults: want,
          signal,
          _routePin: pin,
        });
        const norm = normaliseResult(engine, raw);
        const sources = norm.items.slice(0, want);
        if (!sources.length) {
          errors.push(`${wanted}: 无结果`);
          continue;
        }
        errors.push(...norm.failures);
        Object.assign(routes, norm.routes);
        return {
          engine: wanted,
          baseEngine: engine,
          usedEngines: norm.usedEngines,
          routes,
          sources,
          content: renderSources(sources),
          attempted,
          errors,
          skipped,
        };
      } catch (err) {
        errors.push(`${wanted}: ${err.message}`);
        logger?.warn?.(`websearch-local: ${wanted} 失败 — ${err.message}；尝试下一个引擎`);
      }
    }

    if (!attempted.length) {
      throw new Error(
        `没有可用的引擎可尝试（order=[${order.join(', ')}]，跳过=[${skipped.join(', ')}]）。` +
          `可用引擎：${ALL_ENGINE_IDS.join(' / ')}。${errors.join(' | ')}`
      );
    }
    throw new Error(`所有引擎均失败（已尝试 ${attempted.join(' → ')}）。${errors.join(' | ')}`);
  }

  ctx.effect(() =>
    ctx.web?.registerSearchProvider({
      id: 'websearch-local',
      // No credentials to check: this provider is always ready, which is the
      // whole point — the agent never hits WEB_PROVIDER_CREDENTIAL_MISSING.
      available: () => true,
      async search(req, signal) {
        const r = await runSearch(req.query, req.engine, req.maxResults, signal);
        return { content: r.content, sources: r.sources, truncated: false };
      },
    })
  );

  ctx.effect(() =>
    ctx.web?.registerFetchProvider({
      id: 'websearch-local',
      available: () => !isOff(resolved().enableFetch),
      async fetch(req, signal) {
        const c = opts();
        const maxChars = Number(resolved().fetchMaxChars) || DEFAULTS.fetchMaxChars;
        const { text: raw, via } = await fetchWithMirrors(req.url, { ...c, signal });
        const text = htmlToText(raw);
        const truncated = text.length > maxChars;
        return {
          url: req.url,
          statusCode: 200,
          body: {
            kind: 'text',
            content: truncated ? text.slice(0, maxChars) : text,
            ...(via ? { note: `GitHub 直连失败，经加速镜像 ${via} 抓取` } : {}),
          },
          truncated,
        };
      },
    })
  );

  /* Engine-aware tools. Registered only when dsh-tools is importable, so a
   * future API change degrades to "search still works, tool disappears"
   * instead of breaking the whole plugin. */
  if (defineTool) {
    ctx.inject(['tools'], (sctx) => {
      sctx.effect(() => {
        const dispose = sctx.tools.register(
          defineTool({
            name: 'web_search_engine',
            description: toolDescription(resolved()),
            parameters: {
              query: {
                type: 'string',
                required: true,
                description: '搜索关键词。代码类查询可直接写项目名或技术栈，如 "dsh plugin"、"python http client"。',
              },
              engine: {
                type: 'string',
                description:
                  `指定搜索源，可选 ${ALL_ENGINE_IDS.join(' / ')}；推荐 repo（代码多源合并）/ pkg（依赖包多源合并）；` +
                  '传 auto 或省略则按 engineOrder 顺序尝试。别名（如 npmmirror / hf-mirror）表示「强制走该源的某一条入口」。',
              },
              maxResults: {
                type: 'number',
                description: '返回条数（默认 8，最大 30）。',
              },
            },
            output: {
              schema: { type: 'object', additionalProperties: true },
              render: (_args, value) => {
                const used = value.routes && Object.keys(value.routes).length
                  ? Object.entries(value.routes)
                      .map(([e, r]) => `${ENGINES_META[e]?.label || e}→${r}`)
                      .join('，')
                  : '';
                const head =
                  `引擎: ${ENGINES_META[value.baseEngine]?.label || value.engine}` +
                  (value.usedEngines?.length > 1
                    ? `（合并来源: ${value.usedEngines.map((e) => ENGINES_META[e]?.label || e).join(' + ')}）`
                    : '') +
                  (value.degraded ? `（首选不可用，已降级；尝试顺序 ${value.attempted.join(' → ')}）` : '') +
                  (used ? `\n实际入口: ${used}` : '');
                return [{ type: 'text', text: `${head}\n\n${value.content}` }];
              },
            },
            execute: async (args) => {
              const engine = args.engine && args.engine !== 'auto' ? args.engine : undefined;
              if (engine && !ENGINES[engine] && !COMPOSITES[engine] && !ENGINE_ALIASES[engine]) {
                throw new Error(
                  `未知引擎 "${engine}"。可用：${ALL_ENGINE_IDS.join(' / ')}，或省略按 engineOrder 顺序尝试。`
                );
              }
              const r = await runSearch(args.query, engine, args.maxResults);
              // dsh 的工具结果要求"无损 JSON"：JSON.parse(JSON.stringify(v)) 必须与
              // 原值一致。`notes: undefined` 这种显式 undefined 字段会被 stringify
              // 丢掉，导致每次调用都在宿主的工具结果边界被拒（"value is not
              // lossless JSON"）—— 而且只在真宿主里现形，mock 直调 execute 抓不到。
              // 规矩：不确定就别放字段，用条件展开，绝不写 `: undefined`。
              return {
                query: args.query,
                engine: r.engine,
                baseEngine: r.baseEngine,
                usedEngines: r.usedEngines,
                routes: r.routes,
                attempted: r.attempted,
                degraded: r.attempted.length > 1,
                ...(r.errors.length ? { notes: r.errors } : {}),
                content: r.content,
                sources: r.sources,
              };
            },
          })
        );
        return () => dispose();
      }, 'websearch-local: engine tool');
    });

    /* Prompt guidance sits immediately after the stock `web_search` section
     * (order 2000) so the engine list reads as part of the same block.
     * Registered defensively: a dsh without systemPrompt just skips it. */
    ctx.inject(['systemPrompt'], (pctx) => {
      pctx.effect(() => {
        try {
          return pctx.systemPrompt.section({
            name: 'tool:web_search_engine',
            order: 2005,
            text: () => enginePrompt(resolved()),
          });
        } catch {
          return () => {};
        }
      }, 'websearch-local: engine prompt');
    });
  } else {
    logger?.info?.('websearch-local: @deepseek-ai/dsh-tools 不可用，跳过 web_search_engine 工具注册');
  }

  /* ---- 设置卡片的数据面：GET/POST 配置 + 恢复默认（防御式注册） ---- */
  ctx.inject(['webServer'], (wctx) => {
    wctx.effect(() => {
      const json = (res, code, obj) => {
        res.writeHead(code, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        });
        res.end(JSON.stringify(obj));
      };
      const readBody = (req) =>
        new Promise((resolveBody, rejectBody) => {
          let data = '';
          req.on('data', (c) => {
            data += c;
            if (data.length > 1e6) req.destroy();
          });
          req.on('end', () => {
            try {
              resolveBody(data ? JSON.parse(data) : {});
            } catch (err) {
              rejectBody(new Error(`请求体不是合法 JSON：${err.message}`));
            }
          });
          req.on('error', rejectBody);
        });

      /** 应用卡片提交的增量：只动卡片拥有的字段。 */
      const applyUiUpdate = (body) => {
        if (body.apiKey !== undefined && typeof body.apiKey === 'string') {
          uiState.apiKey = body.apiKey.trim();
        }
        if (body.clearApiKey === true) uiState.apiKey = '';
        if (body.proxyUrl !== undefined && typeof body.proxyUrl === 'string') {
          uiState.proxyUrl = body.proxyUrl.trim();
        }
        if (body.routeOverrides && typeof body.routeOverrides === 'object') {
          // 入参形状：{ "<engineId>|<routeLabel>": { proxy?, url?, enabled? } | null }
          for (const [k, v] of Object.entries(body.routeOverrides)) {
            if (typeof k !== 'string' || !k.includes('|')) continue;
            if (v === null || v === undefined) {
              delete uiState.routeOverrides[k]; // 恢复默认
              continue;
            }
            const o = {};
            if (v && typeof v === 'object') {
              if (v.proxy === true || v.proxy === false) o.proxy = v.proxy;
              const u = asUrl(v.url);
              if (u) o.url = u;
              if (v.enabled === false) o.enabled = false; // 缺省即启用
            }
            if (Object.keys(o).length) uiState.routeOverrides[k] = o;
            else delete uiState.routeOverrides[k];
          }
        }
        if (body.routeExtras && typeof body.routeExtras === 'object') {
          // 入参形状：{ "<engineId>": [ { url, enabled? } ] }（按引擎整体替换）
          // enabled 必须落库：内置源追加入口的停用状态存在条目本身，
          // 只保留 url 会让客户端刚点的「停用」在下次读盘时丢失。
          for (const [engId, list] of Object.entries(body.routeExtras)) {
            if (typeof engId !== 'string' || engId.startsWith('custom-') || !Array.isArray(list)) continue;
            uiState.routeExtras[engId] = list
              .map((x) => ({ url: asUrl(x?.url), enabled: x && typeof x === 'object' && x.enabled === false }))
              .filter((x) => x.url)
              .slice(0, UI_CUSTOM_MAX)
              .map((x) => ({ url: x.url, ...(x.enabled ? { enabled: false } : {}) }));
          }
        }
        if (body.custom && typeof body.custom === 'object') {
          // 入参形状：{ "<catId>": [ { name, url, proxies: [ { url, enabled? } ] } ] }（按大类整体替换）
          // v3：代理条目可携带 enabled（启停状态存在条目本身，label 重排不影响）。
          for (const cat of UI_CATEGORY_DEFS) {
            const list = body.custom[cat.id];
            if (!Array.isArray(list)) continue;
            uiState.custom[cat.id] = list
              .slice(0, UI_CUSTOM_MAX)
              .map((x) => ({
                name: String(x?.name ?? '').trim().slice(0, 40),
                url: asUrl(x?.url),
                proxies: Array.isArray(x?.proxies)
                  ? x.proxies
                      .map((p) => ({
                        url: asUrl(p?.url ?? p),
                        ...(p && typeof p === 'object' && p.enabled === false ? { enabled: false } : {}),
                      }))
                      .filter((p) => p.url)
                      .slice(0, UI_CUSTOM_MAX)
                  : [],
              }))
              .filter((x) => x.url);
            // v2 僵尸键清理：v3 的启停状态存在 custom.proxies[i].enabled，而读取侧
            // 是「v3 条目 OR v2 键」的合并（见 uiSnapshot）。若不清掉 v2 遗留的
            // routeOverrides["custom-<cat>-N|代理 M"].enabled=false，它会永久压制
            // 条目上的「启用」—— 客户端点启用只 POST custom，永远碰不到那个键，
            // 于是变成「磁盘说已启用、界面说已停用、且无任何报错」的死循环。
            //
            // 🔴 只清 custom- 前缀：内置源追加入口（routeExtras 产生、无 proxyIndex）
            // 的停用状态至今仍依赖 routeOverrides，误删会直接打断该功能。
            const prefix = `custom-${cat.id}-`;
            for (const k of Object.keys(uiState.routeOverrides)) {
              if (k.startsWith(prefix)) delete uiState.routeOverrides[k];
            }
          }
        }
        saveUiState(uiState);
        installCustomEngines(uiState);
      };

      const resetUi = () => {
        uiState = structuredClone(UI_DEFAULT);
        try {
          unlinkSync(uiStateFile());
        } catch {
          /* 文件本来就不存在，等于已重置 */
        }
        installCustomEngines(uiState);
      };

      const d1 = wctx.webServer.register({
        kind: 'exact',
        path: '/dsh-websearch-local/api/config',
        handler: async (req, res) => {
          try {
            if (req.method === 'GET') return json(res, 200, uiSnapshot(uiState));
            if (req.method === 'POST') {
              const body = await readBody(req);
              applyUiUpdate(body);
              return json(res, 200, { ok: true, ...uiSnapshot(uiState) });
            }
            return json(res, 405, { error: 'method not allowed' });
          } catch (err) {
            return json(res, 400, { error: err.message });
          }
        },
      });
      const d2 = wctx.webServer.register({
        kind: 'exact',
        path: '/dsh-websearch-local/api/reset',
        handler: async (req, res) => {
          try {
            if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
            resetUi();
            return json(res, 200, { ok: true, ...uiSnapshot(uiState) });
          } catch (err) {
            return json(res, 400, { error: err.message });
          }
        },
      });
      return () => {
        d1();
        d2();
      };
    }, 'websearch-local: settings card routes');
  });
}

export {
apply
};
