// SPDX-License-Identifier: GPL-3.0-or-later
// 配置 Schema（config）：Config
// 定义插件的配置验证模式，包括代理设置、搜索引擎顺序等核心参数。

import { Schema } from './deps.js';
import { ALL_ENGINE_IDS } from './engines-meta.js';
import { DEFAULTS } from './constants.js';
const Config = Schema
  ? Schema.object({
      proxyUrl: Schema.string().default('').description(
        '代理地址，留空则直连。例如 http://127.0.0.1:7890（Clash 默认端口）。' +
        '海外引擎（DuckDuckGo）在直连环境下通常不可达，填了代理才会被真正用到。'
      ),
      engineOrder: Schema.array(Schema.union(ALL_ENGINE_IDS))
        .default(DEFAULTS.engineOrder)
        .description('搜索引擎轮询顺序。省略 engine 时按此顺序尝试（默认 Web 搜索）。代码/仓库/依赖类请用 engine 显式指定 repo / pkg。'),
      githubToken: Schema.string().default('').description(
        '可选的 GitHub Token，仅用于提高 api.github.com 的搜索频率上限（匿名约 10 次/分钟）。' +
        '留空则匿名访问，也支持环境变量 GITHUB_TOKEN。'
      ),
      giteeToken: Schema.string().default('').description(
        'Gitee 访问令牌。Gitee 的搜索 API 现在要求令牌，未配置时 gitee 引擎会被自动跳过' +
        '（其他代码源不受影响）。也支持环境变量 GITEE_TOKEN。'
      ),
      enableGithubMirrors: Schema.boolean().default(true).description(
        '抓取 raw.githubusercontent.com / github.com 失败时，自动改用 GitHub 加速镜像重试' +
        '（ghproxy.net / ghfast.top / gh-proxy.com）。国内网络下能显著提高成功率。'
      ),
      routePolicy: Schema.union(['auto', 'direct-first', 'accel-first'])
        .default('auto')
        .description(
          '同一个源的多个入口谁先试。auto（默认）：按引擎实测情况决定 —— 直连可用就先直连，' +
          '本机实测直连不可达的引擎（如 HuggingFace）先走镜像；direct-first：一律先直连；' +
          'accel-first：一律先走镜像/加速。第三方索引入口在任何策略下都排最后。' +
          '无论哪种顺序，本次会话里失败过的入口都会被自动排到后面。'
        ),
      repoEngines: Schema.array(Schema.union(ALL_ENGINE_IDS))
        .default(DEFAULTS.repoEngines)
        .description('repo 多源合并包含哪些代码托管源。可增删（设成空数组则回退内置默认）。'),
      pkgEngines: Schema.array(Schema.union(ALL_ENGINE_IDS))
        .default(DEFAULTS.pkgEngines)
        .description('pkg 多源合并包含哪些包仓库源。可增删（设成空数组则回退内置默认）。'),
      maxResults: Schema.number().default(DEFAULTS.maxResults).description('每次搜索返回的结果条数。'),
      timeoutMs: Schema.number().default(DEFAULTS.timeoutMs).description('单个 HTTP 请求的超时时间（毫秒）。'),
      fetchMaxChars: Schema.number().default(DEFAULTS.fetchMaxChars).description('抓取网页时正文的最大字符数。'),
      enableFetch: Schema.boolean().default(true).description('是否允许模型调用 web_fetch 抓取 URL 正文。'),
    })
  : undefined;

/*
 * When schemastery is unavailable we export NO schema at all, rather than a
 * plain defaults object. Cordis does `if (!runtime.Config) return config`, then
 * `runtime.Config['~standard'].validate(...)` — so a hand-rolled object without
 * the Standard Schema marker makes `.validate` a method call on undefined and
 * takes the ENTIRE plugin tree down, which is the opposite of degrading.
 * `undefined` means "no schema", the config passes through untouched, and
 * `apply` below merges DEFAULTS itself.
 */

export {
Config
};
