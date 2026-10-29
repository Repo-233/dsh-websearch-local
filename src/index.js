// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * dsh-websearch-local — v0.5
 *
 * A zero-API-key web search / fetch provider for DeepSeek Harness (dsh).
 *
 * This file is part of dsh-websearch-local
 *
 * Copyright (C) 2026 MYCF711 (original author)
 * Copyright (C) 2026 Local modifications
 *
 * This program is derived from dsh-websearch-direct v0.4.4
 * https://github.com/MYCF711/dsh-websearch-direct
 *
 * See LICENSE file for more details.
 *
 * Why this exists: the stock `deepseek-official` channel burns a full model
 * round-trip per search and requires DEEPSEEK_API_KEY, while the popular
 * `web-search-free` plugin needs keys for endpoints that are almost all
 * hosted overseas — from a machine with no proxy those calls intermittently
 * time out ("sometimes it can't reach the network"). This plugin talks to
 * search endpoints that resolve over a plain direct connection and optionally
 * routes through a user-supplied proxy, so the agent gets a working
 * `web_search` / `web_fetch` with nothing to configure.
 *
 * v0.2 added engine awareness (a `github` engine, code-intent auto-routing,
 * and the `web_search_engine` tool).
 *
 * v0.3 turns "code search" from a single source into a group:
 *   - repo engines: github / gitlab / codeberg / gitea / gitee(需 token)
 *   - package engines: npm / crates / packagist / nuget / rubygems / maven /
 *     huggingface
 *   - composite engines `repo` and `pkg` fan out in PARALLEL and round-robin
 *     merge, so one host cannot dominate the answer the way github-only did
 *   - GitHub fetch mirror fallback (ghproxy.net / ghfast.top / gh-proxy.com)
 *     for raw.githubusercontent.com and github.com URLs
 *   - fixes found by the v0.2 trial report: silent proxyUrl death (bare
 *     `import('undici')` could not resolve under a junction install, AND a
 *     cross-instance `ProxyAgent` is rejected by the global fetch — see the
 *     proxy note below), `engineOrder` losing its fallback when every entry was
 *     invalid, loose `enableFetch` parsing, and a silent ignore of an unknown
 *     engine hint at the seam layer.
 *
 * v0.3.1 replaces "one engine = one hardcoded URL" with an explicit
 * engine/route split:
 *
 *   引擎 = 逻辑源（一份仓库、一个包生态、一个搜索引擎）
 *   路由 = 指向同一份内容的入口：直连 / 镜像 / 加速代理 / 第三方索引
 *
 * A mirror of the same repository is NOT a second engine. `github` appears once
 * in the engine list; `api.github.com`, `gh-proxy.com`, `gh-proxy.org` and
 * `cors.isteed.cc` are routes underneath it, tried in order with per-route
 * health demotion. Every route's UA is carried on the route, because
 * availability is header-sensitive in ways that are not guessable: Codeberg's
 * WAF answers 403 to a *complete browser* UA (even on /api/v1/version) and 200
 * to an honest bot UA, while Bing wants the browser UA. Routes that were
 * measured dead are recorded in each engine's `rejected` field instead of being
 * silently retried forever.
 *
 * Retrieval only — no LLM is involved, so searches cost zero model tokens.
 *
 * Dependency policy: every @deepseek-ai import is optional and guarded. The
 * plugin keeps working (basic search + fetch) even if a dsh upgrade removes
 * or renames an API, which is exactly how sibling plugins break.
 */
/* ————————————————————————————————————————————————————————
 * 本文件是 src/ 模块树的公共出口（由 scripts/split-src.mjs 生成）。
 * 与 dist/index.js 的公共形状一致：name / inject / SETTINGS_NAMESPACE / Config / apply。
 * ———————————————————————————————————————————————————————— */

export { name, inject, SETTINGS_NAMESPACE } from './constants.js';
export { Config } from './config.js';
export { apply } from './plugin.js';
