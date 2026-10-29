// SPDX-License-Identifier: GPL-3.0-or-later
// 引擎表（engines-meta）：ENGINES_META + 引擎分组 + 别名 + 派生注册表

import { repoItem, giteaPick, pkgItem } from './items.js';
import { parseBing, parseBaidu, parseDdg } from './parsers.js';
/* ----------------------------------------------------- 引擎 = 逻辑源 + 路由 */

/**
 * 引擎表：定义搜索引擎的基础信息和路由配置
 * 包含仓库、依赖包、通用网页等类型的搜索引擎元数据
 *
 * 核心概念：
 * - 引擎 = 逻辑源（一份仓库 / 一个包生态 / 一个搜索引擎）
 * - 路由 = 指向同一份内容的入口：直连、镜像、加速代理、第三方索引
 * - 路由层级 tier：0直连、1镜像代理、2第三方索引
 *
 * 设计原则：
 * - 同一逻辑源只占一个引擎位，不会重复出现
 * - routes 只放实测可用的入口（双路验证通过）
 * - 实测不可用的候选统一记录在 rejected 字段
 *
 * @module engines-meta
 */
const ENGINES_META = {
  github: {
    label: 'GitHub',
    group: 'repo',
    what: '代码仓库与开源项目（按 star 排序）',
    useWhen: '找开源项目、库、框架、SDK、CLI、插件源码；对比同类实现；查某个项目有多少 star / 是否活跃',
    token: 'githubToken',
    accept: 'application/vnd.github+json',
    search: (r, q, n) =>
      `${r.base}/search/repositories?q=${encodeURIComponent(q)}&per_page=${n}&sort=stars&order=desc`,
    pick: (d) => {
      if (d.message && !d.items) throw new Error(`GitHub API: ${d.message}`);
      return (d.items || []).map((it) =>
        repoItem({
          url: it.html_url,
          name: it.full_name,
          stars: it.stargazers_count,
          desc: it.description,
          lang: it.language,
          updated: it.pushed_at,
          extra: it.topics?.length ? `topics: ${it.topics.slice(0, 5).join(', ')}` : '',
        })
      );
    },
    routes: [
      { label: '直连 api.github.com', base: 'https://api.github.com', tier: 0 },
      { label: 'gh-proxy.com 加速', base: 'https://gh-proxy.com/https://api.github.com', tier: 1 },
      { label: 'gh-proxy.org 加速', base: 'https://gh-proxy.org/https://api.github.com', tier: 1 },
      { label: 'cors.isteed.cc 加速', base: 'https://cors.isteed.cc/https://api.github.com', tier: 1 },
    ],
    rejected:
      'ghproxy.net / ghfast.top（只代理 raw 文件，代 API 一律 403）；' +
      'kkgithub.com、gh.llkk.cc、gitclone.com、hub.gitmirror.com、ghps.cc、gh.api.99988866.xyz、' +
      'ghp.ci、mirror.ghproxy.com、ghproxy.cc、ghproxy.homeboyc.cn、cors.eu.org、api.codetabs.com、' +
      'api.allorigins.win（实测均失败或返回非 JSON）；' +
      'repos.ecosyste.ms（HTTP 200、JSON 结构也合法，但 **完全忽略查询参数** —— ' +
      'query/q/search/加排序四种写法返回同一个固定列表，全是 "0/..." 这种垃圾仓库。' +
      '这条特别值得记：200 不等于可用，可用性探测必须验证「换个查询词结果会变」）',
  },
  gitlab: {
    label: 'GitLab',
    group: 'repo',
    what: 'GitLab.com 上的公开项目',
    useWhen: 'GitHub 上找不到、或想找只在 GitLab 托管的项目与从自建实例迁移过来的项目',
    accept: 'application/json',
    search: (r, q, n) =>
      `${r.base}/projects?search=${encodeURIComponent(q)}&order_by=star_count&sort=desc&per_page=${n}`,
    pick: (d) => {
      if (!Array.isArray(d)) throw new Error('GitLab 返回结构异常');
      return d
        .filter((it) => it && it.web_url)
        .map((it) =>
          repoItem({
            url: it.web_url,
            name: it.path_with_namespace || it.name,
            stars: it.star_count,
            desc: it.description,
            lang: it.language,
            updated: it.last_activity_at,
          })
        );
    },
    routes: [{ label: '直连 gitlab.com', base: 'https://gitlab.com/api/v4', tier: 0 }],
    rejected:
      'framagit.org（TLS/网络不可达）；salsa.debian.org、invent.kde.org、gitlab.gnome.org（可达但搜索域只覆盖各自项目库，通用关键词命中率近 0，收录只会白增延迟）',
  },
  codeberg: {
    label: 'Codeberg',
    group: 'repo',
    what: 'Codeberg（非营利代码托管，Gitea 内核）',
    useWhen: '找无商业托管的开源项目、隐私友好的替代实现；结果独立于 GitHub',
    accept: 'application/json',
    search: (r, q, n) =>
      `${r.base}/repos/search?q=${encodeURIComponent(q)}&sort=stars&order=desc&limit=${n}`,
    pick: (d) => giteaPick(d, 'Codeberg'),
    routes: [
      {
        // 必须用 bot UA：完整浏览器 UA 会被 WAF 403（实测 /api/v1/version 同样 403）
        label: '直连 codeberg.org',
        base: 'https://codeberg.org/api/v1',
        tier: 0,
        ua: 'bot',
      },
    ],
  },
  gitea: {
    label: 'Gitea.com',
    group: 'repo',
    what: 'Gitea 官方托管站上的公开仓库',
    useWhen: '找自托管生态（Gitea / Forgejo）相关项目与插件',
    accept: 'application/json',
    search: (r, q, n) =>
      `${r.base}/repos/search?q=${encodeURIComponent(q)}&sort=stars&order=desc&limit=${n}`,
    pick: (d) => giteaPick(d, 'Gitea'),
    routes: [{ label: '直连 gitea.com', base: 'https://gitea.com/api/v1', tier: 0 }],
  },
  gitee: {
    label: 'Gitee 码云',
    group: 'repo',
    what: '国内代码托管（中文项目、国内团队作品）',
    useWhen: '找国内开源项目、国产替代方案、中文文档为主的仓库',
    token: 'giteeToken',
    accept: 'application/json',
    search: (r, q, n, o) =>
      `${r.base}/search/repositories?q=${encodeURIComponent(q)}&per_page=${n}` +
      `&access_token=${encodeURIComponent(o.giteeToken)}`,
    pick: (d) => {
      if (!Array.isArray(d)) throw new Error('Gitee 返回结构异常（token 是否有效？）');
      return d.map((it) =>
        repoItem({
          url: it.html_url,
          name: it.full_name,
          stars: it.stargazers_count,
          desc: it.description,
          lang: it.language,
          updated: it.updated_at || it.pushed_at,
        })
      );
    },
    routes: [{ label: '直连 gitee.com', base: 'https://gitee.com/api/v5', tier: 0 }],
    note:
      '搜索 API 必须带访问令牌：匿名访问返回 200 + 空数组，看起来像「没有结果」。' +
      '未配置 giteeToken 时该引擎被自动跳过，不会污染 repo 的合并结果。',
  },
  npm: {
    label: 'npm',
    group: 'pkg',
    what: 'npm 包（Node / JS / TS 生态）',
    useWhen: '找 JS/TS 库与 CLI 工具、查包名是否被占用、看包版本与发布时间',
    accept: 'application/json',
    search: (r, q, n) => `${r.base}/-/v1/search?text=${encodeURIComponent(q)}&size=${n}`,
    pick: (d, route) =>
      (d.objects || []).map((o) => {
        const p = o.package || {};
        return pkgItem({
          url: `${route.web}/package/${p.name}`,
          name: p.name,
          version: p.version,
          downloads: o.downloads?.monthly ?? o.score?.detail?.popularity ?? null,
          desc: p.description,
          extra: p.date ? `发布: ${String(p.date).slice(0, 10)}` : '',
        });
      }),
    routes: [
      { label: '直连 registry.npmjs.org', base: 'https://registry.npmjs.org', tier: 0, web: 'https://www.npmjs.com' },
      { label: 'npmmirror 镜像', base: 'https://registry.npmmirror.com', tier: 1, web: 'https://npmmirror.com' },
      { label: '腾讯云镜像', base: 'https://mirrors.cloud.tencent.com/npm', tier: 1, web: 'https://www.npmjs.com' },
    ],
    rejected: 'mirrors.huaweicloud.com/repository/npm（返回结构不是 npm search 格式）',
    note: 'npmmirror 只是 npm 的一条镜像路由，内容与 npm 一致，因此不再单独占一个引擎 id；' +
      '仍然可以写 engine="npmmirror" 强制走这条路由。',
  },
  crates: {
    label: 'crates.io',
    group: 'pkg',
    what: 'Rust crate',
    useWhen: '找 Rust 库、查 crate 下载量与版本',
    accept: 'application/json',
    search: (r, q, n) => `${r.base}?q=${encodeURIComponent(q)}&per_page=${n}`,
    pick: (d) =>
      (d.crates || []).map((c) =>
        pkgItem({
          url: `https://crates.io/crates/${c.name}`,
          name: c.name,
          version: c.max_version,
          downloads: c.downloads,
          desc: c.description,
          extra: c.repository || '',
        })
      ),
    routes: [
      { label: '直连 crates.io', base: 'https://crates.io/api/v1/crates', tier: 0 },
      { label: 'rsproxy.cn 加速', base: 'https://rsproxy.cn/api/v1/crates', tier: 1 },
    ],
    rejected: 'mirrors.ustc.edu.cn（404）、mirrors.tuna.tsinghua.edu.cn（403）—— 两站只镜像 crate 下载，不提供搜索 API',
  },
  packagist: {
    label: 'Packagist',
    group: 'pkg',
    what: 'PHP Composer 包',
    useWhen: '找 PHP 库与框架组件',
    accept: 'application/json',
    search: (r, q, n) => `${r.base}/search.json?q=${encodeURIComponent(q)}&per_page=${n}`,
    pick: (d) =>
      (d.results || []).map((x) =>
        pkgItem({
          url: `https://packagist.org/packages/${x.name}`,
          name: x.name,
          downloads: x.downloads,
          desc: x.description,
          extra: x.repository || '',
        })
      ),
    routes: [{ label: '直连 packagist.org', base: 'https://packagist.org', tier: 0 }],
    rejected: 'mirrors.aliyun.com/composer（404，只镜像下载不提供搜索）',
  },
  nuget: {
    label: 'NuGet',
    group: 'pkg',
    what: '.NET 包',
    useWhen: '找 C# / .NET 库',
    accept: 'application/json',
    search: (r, q, n) => `${r.base}/query?q=${encodeURIComponent(q)}&take=${n}`,
    pick: (d) =>
      (d.data || []).map((p) =>
        pkgItem({
          url: `https://www.nuget.org/packages/${p.id}`,
          name: p.id,
          version: p.version,
          downloads: p.totalDownloads,
          desc: p.description,
          extra: p.projectUrl || '',
        })
      ),
    routes: [
      { label: '直连 azuresearch-usnc', base: 'https://azuresearch-usnc.nuget.org', tier: 0 },
      { label: 'azuresearch-ussc 备用', base: 'https://azuresearch-ussc.nuget.org', tier: 1 },
    ],
    rejected: 'api.nuget.org/v3/query（404）、nuget.cdn.azure.cn（不可达）',
  },
  rubygems: {
    label: 'RubyGems',
    group: 'pkg',
    what: 'Ruby gem',
    useWhen: '找 Ruby 库与 Rails 相关组件',
    accept: 'application/json',
    search: (r, q) => `${r.base}/search.json?query=${encodeURIComponent(q)}`,
    pick: (d, _route, opts) => {
      const arr = Array.isArray(d) ? d : [];
      return arr.slice(0, opts.maxResults).map((g) =>
        pkgItem({
          url: `https://rubygems.org/gems/${g.name}`,
          name: g.name,
          version: g.version,
          downloads: g.downloads,
          desc: g.info,
          extra: g.homepage_uri || '',
        })
      );
    },
    routes: [{ label: '直连 rubygems.org', base: 'https://rubygems.org/api/v1', tier: 0 }],
    rejected: 'mirrors.tuna.tsinghua.edu.cn/rubygems（403，只镜像下载）',
  },
  maven: {
    label: 'Maven Central',
    group: 'pkg',
    what: 'Maven Central 上的 Java / JVM 构件',
    useWhen: '找 Java / Kotlin / Scala 库与框架组件',
    accept: 'application/json',
    search: (r, q, n) => `${r.base}/select?q=${encodeURIComponent(q)}&rows=${n}&wt=json`,
    pick: (d) =>
      ((d.response && d.response.docs) || []).map((x) => {
        const [g, a] = String(x.id || '').split(':');
        return pkgItem({
          url: g && a ? `https://central.sonatype.com/artifact/${g}/${a}` : `https://search.maven.org/#search|ga|1|${x.id}`,
          name: x.id,
          version: x.latestVersion,
          downloads: null,
          desc: 'Maven Central 构件（groupId:artifactId）',
          extra: x.p || '',
        });
      }),
    routes: [{ label: '直连 search.maven.org', base: 'https://search.maven.org/solrsearch', tier: 0 }],
    rejected: 'central.sonatype.com/api/internal/browse（405，内部接口不外放）',
  },
  huggingface: {
    label: 'HuggingFace',
    group: 'pkg',
    what: 'HuggingFace 模型与数据集',
    useWhen: '找预训练模型、数据集、微调权重；确认某个模型是否存在及其下载量',
    accept: 'application/json',
    search: (r, q, n) => `${r.base}/api/models?search=${encodeURIComponent(q)}&limit=${n}&full=false`,
    pick: (d) =>
      (Array.isArray(d) ? d : []).map((m) =>
        pkgItem({
          url: `https://huggingface.co/${m.id}`,
          name: m.id,
          version: null,
          downloads: m.downloads,
          desc: (m.tags || []).filter((t) => !/^(transformers|pytorch|tf|safetensors|arxiv:)/.test(t)).slice(0, 6).join(', '),
          extra: m.likes != null ? `♥${m.likes}` : '',
        })
      ),
    routes: [
      { label: 'hf-mirror.com 加速', base: 'https://hf-mirror.com', tier: 1 },
      { label: '直连 huggingface.co', base: 'https://huggingface.co', tier: 0 },
    ],
    // 实测本机直连 huggingface.co 不可达。默认 direct-first 会让每次冷启动的
    // pkg 搜索白白多等一次超时（实测 16s），所以这个引擎默认先走镜像。
    preferAccel: true,
    note:
      '本机直连 huggingface.co 不可达，默认先走 hf-mirror.com 镜像（实测可用）；' +
      '仍可写 engine="hf-mirror" 显式指定该路由，或用 routePolicy=direct-first 强制先直连。',
  },
  bing: {
    label: 'Bing 中国',
    group: 'web',
    what: '通用网页搜索',
    useWhen:
      '技术文档、教程、新闻、产品官网、报错信息——中英文通用，默认引擎' +
      '（Edge 浏览器的默认搜索引擎同为 Bing，二者等价）',
    html: true,
    ua: 'browser',
    search: (r, q) => `${r.base}/search?q=${encodeURIComponent(q)}&ensearch=0&count=20`,
    pick: (html, _route, opts) => parseBing(html, opts),
    routes: [
      { label: 'cn.bing.com', base: 'https://cn.bing.com', tier: 0 },
      { label: 'www.bing.com 备用', base: 'https://www.bing.com', tier: 1 },
    ],
  },
  baidu: {
    label: '百度',
    group: 'web',
    what: '中文网页搜索',
    useWhen: '纯中文内容、国内站点、百科、问答、论坛帖',
    html: true,
    ua: 'browser',
    search: (r, q) => `${r.base}/s?wd=${encodeURIComponent(q)}&rn=20`,
    pick: (html, _route, opts) => parseBaidu(html, opts),
    routes: [{ label: 'www.baidu.com', base: 'https://www.baidu.com', tier: 0 }],
    rejected: 'm.baidu.com（移动版结构不同且同样有反爬校验，收录无收益）',
  },
  duckduckgo: {
    label: 'DuckDuckGo',
    group: 'web',
    what: '英文隐私搜索',
    useWhen: '英文资料且不希望被追踪；本机实测两个入口均不可达，故排在顺序末位',
    html: true,
    ua: 'browser',
    direct: false,
    search: (r, q) => `${r.base}${r.path || ''}?q=${encodeURIComponent(q)}`,
    pick: (html, _route, opts) => parseDdg(html, opts),
    routes: [
      { label: 'html.duckduckgo.com', base: 'https://html.duckduckgo.com', path: '/html/', tier: 0 },
      { label: 'lite.duckduckgo.com', base: 'https://lite.duckduckgo.com', path: '/lite/', tier: 1 },
    ],
  },
  repo: {
    label: '代码仓库（多源合并）',
    group: 'composite',
    what: '并行查询配置里的所有代码托管源（默认 GitHub + GitLab + Codeberg + Gitea；配了 Gitee 令牌还会带上码云），按来源轮转合并',
    useWhen: '默认的代码/仓库意图入口。想要多源覆盖而不是只看 GitHub 时用它；想只看某一个源就显式指定该引擎',
  },
  pkg: {
    label: '包仓库（多源合并）',
    group: 'composite',
    what: '并行查询配置里的所有包仓库源（默认 npm + crates.io + Packagist + NuGet + RubyGems + Maven Central + HuggingFace）',
    useWhen: '默认的依赖包意图入口。跨语言找库、比较同类包、确认包名与最新版本',
  },
};

const REPO_ENGINES = ['github', 'gitlab', 'codeberg', 'gitea', 'gitee'];
const PKG_ENGINES = ['npm', 'crates', 'packagist', 'nuget', 'rubygems', 'maven', 'huggingface'];
const WEB_ENGINES = ['bing', 'baidu', 'duckduckgo'];
const COMPOSITE_ENGINES = ['repo', 'pkg'];
const ENGINE_IDS = [...REPO_ENGINES, ...PKG_ENGINES, ...WEB_ENGINES, ...COMPOSITE_ENGINES];

/* ----------------------------------------------------- 引擎分组 */
/**
 * 引擎分组配置
 * 将不同类型的搜索引擎按功能分类，便于管理和调用
 */
const REPO_ENGINES = ['github', 'gitlab', 'codeberg', 'gitea'];
const PKG_ENGINES = ['npm', 'pypi', 'crates', 'maven', 'nuget', 'rubygems', 'huggingface'];
const WEB_ENGINES = ['bing', 'baidu', 'duckduckgo'];

/**
 * 引擎ID列表
 * 包含所有注册的搜索引擎ID，按功能分组
 */
const ENGINE_IDS = [
  'github', 'gitlab', 'codeberg', 'gitea',
  'npm', 'pypi', 'crates', 'maven', 'nuget', 'rubygems', 'huggingface',
  'bing', 'baidu', 'duckduckgo'
];

/* ----------------------------------------------------- 引擎别名 */
/**
 * 路由别名配置
 * 旧版本中某些引擎（如 npmmirror）曾是独立引擎，现降级为对应引擎的路由别名
 * 保持向后兼容性的同时提供强制走特定路由的能力
 */
const ENGINE_ALIASES = {
  npmmirror: { engine: 'npm', route: 'npmmirror' },
  'npm-mirror': { engine: 'npm', route: 'npmmirror' },
  'hf-mirror': { engine: 'huggingface', route: 'hf-mirror' },
  'gh-proxy': { engine: 'github', route: 'gh-proxy.com' },
  ghproxy: { engine: 'github', route: 'gh-proxy.com' },
  'github-mirror': { engine: 'github', route: 'gh-proxy.com' },
};
const ALL_ENGINE_IDS = [...ENGINE_IDS, ...Object.keys(ENGINE_ALIASES)];

function baseEngineId(id) {
  return ENGINE_ALIASES[id]?.engine || id;
}

/** 别名指定的路由匹配串（用于把路由表过滤成一条）。 */
function pinnedRoute(id) {
  return ENGINE_ALIASES[id]?.route || null;
}

/** 内置路由的出厂快照：syncUiRoutes 每次从这里重建，保证「恢复默认」幂等。 */
const BUILTIN_ROUTES = {};
for (const [id, def] of Object.entries(ENGINES_META)) {
  BUILTIN_ROUTES[id] = (def.routes || []).map((r) => ({ ...r }));
}

/** 某大类下已安装的自定义源引擎 id（供 membersOf 并入组合搜索）。 */
function customEngineIdsFor(catId) {
  return Object.keys(ENGINES_META).filter((id) => id.startsWith(`custom-${catId}-`));
}

export {
ENGINES_META,
REPO_ENGINES,
PKG_ENGINES,
WEB_ENGINES,
COMPOSITE_ENGINES,
ENGINE_IDS,
ENGINE_ALIASES,
ALL_ENGINE_IDS,
baseEngineId,
pinnedRoute,
BUILTIN_ROUTES,
customEngineIdsFor
};
