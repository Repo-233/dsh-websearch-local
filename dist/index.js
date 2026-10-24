/* dsh-websearch-local v0.5.0 — bundled from src/ (local fork) */

// src/constants.js
var name = "websearch-local";
var inject = ["web"];
var SETTINGS_NAMESPACE = "websearch-local";
var UA_BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
var VERSION = "0.5.0";
var UA_BOT = `dsh-websearch-local/${VERSION} (+https://github.com/Repo-233/dsh-websearch-local)`;
var DEFAULTS = {
  proxyUrl: "",
  engineOrder: ["bing", "baidu", "duckduckgo"],
  githubToken: "",
  giteeToken: "",
  enableGithubMirrors: true,
  routePolicy: "auto",
  repoEngines: ["github", "gitlab", "codeberg", "gitea", "gitee"],
  // maven 故意不在默认成员里：search.maven.org 从本机实测极不稳定（同一个 UA
  // 一次 200 / 一次 15s 超时，三轮里成功约 1/3），放进组合只会稳定拖慢每一次
  // pkg 搜索。引擎本身保留，需要时用 engine="maven" 或加进 pkgEngines。
  pkgEngines: ["npm", "crates", "packagist", "nuget", "rubygems", "huggingface"],
  maxResults: 8,
  timeoutMs: 15e3,
  compositeMemberMs: 12e3,
  fetchMaxChars: 2e4,
  enableFetch: true
};

// src/deps.js
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
function resolutionBases() {
  const bases = [import.meta.url];
  const push = (path) => {
    try {
      bases.push(pathToFileURL(path).href);
    } catch {
    }
  };
  push(join(process.cwd(), "_"));
  const home = process.env.DSH_HOME;
  const argv = process.argv;
  const at = argv.indexOf("--profile");
  const profile = at >= 0 && argv[at + 1] && !argv[at + 1].startsWith("-") ? argv[at + 1] : null;
  if (home && profile) push(join(home, "profiles", profile, "_"));
  if (home) push(join(home, "profiles", "node_modules", "_"));
  return bases;
}
var BASES = resolutionBases();
async function optionalImport(spec) {
  for (const base of BASES) {
    try {
      const resolved = createRequire(base).resolve(spec);
      return await import(pathToFileURL(resolved).href);
    } catch {
    }
  }
  return null;
}
var Schema = null;
var defineTool = null;
{
  const schemastery = await optionalImport("@deepseek-ai/schemastery");
  Schema = schemastery?.default ?? null;
  const tools = await optionalImport("@deepseek-ai/dsh-tools");
  defineTool = tools?.defineTool ?? null;
}

// src/items.js
function repoItem({ url, name: name2, stars, desc, lang, updated, extra }) {
  return {
    url,
    title: `${name2}  \u2605${stars ?? 0}`,
    score: Number(stars) || 0,
    snippet: [desc || "", lang ? `\u8BED\u8A00: ${lang}` : "", updated ? `\u6700\u8FD1\u66F4\u65B0: ${String(updated).slice(0, 10)}` : "", extra || ""].filter(Boolean).join(" \xB7 ")
  };
}
function giteaPick(data, label) {
  const arr = data?.data || data?.items || [];
  if (!Array.isArray(arr)) throw new Error(`${label} \u8FD4\u56DE\u7ED3\u6784\u5F02\u5E38`);
  return arr.map(
    (it) => repoItem({
      url: it.html_url,
      name: it.full_name,
      stars: it.stars_count,
      desc: it.description,
      lang: it.language,
      updated: it.updated_at
    })
  );
}
function pkgItem({ url, name: name2, version, downloads, desc, extra }) {
  return {
    url,
    title: `${name2}${version ? `@${version}` : ""}${downloads != null ? `  \u2913${downloads}` : ""}`,
    score: Number(downloads) || 0,
    snippet: [desc || "", extra || ""].filter(Boolean).join(" \xB7 ")
  };
}

// src/utils.js
function decodeEntities(s) {
  return s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}
function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}
function htmlToText(html) {
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<noscript[\s\S]*?<\/noscript>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<(br|p|div|li|h[1-6]|tr)\b[^>]*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return s.replace(/[ \t\r\f\v]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
function isOff(v) {
  if (v === false || v === 0) return true;
  if (typeof v === "string") return ["false", "0", "no", "off", ""].includes(v.trim().toLowerCase());
  return false;
}
function redactSensitive(s) {
  return String(s ?? "").replace(/([?&](?:access_token|token|key|api_key|apikey)=)[^&\s"'`]+/gi, "$1***").replace(/(\/\/)([^@\/\s]+)@/g, "$1***@");
}
function clampInt(v, lo, hi, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return dflt;
  return Math.min(Math.max(Math.round(n), lo), hi);
}

// src/parsers.js
function parseBing(html, opts) {
  const out = [];
  for (const block of html.split(/<li class="b_algo"/).slice(1)) {
    const m = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!m) continue;
    const url = decodeEntities(m[1]);
    if (!/^https?:\/\//i.test(url)) continue;
    const p = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    out.push({ url, title: stripTags(m[2]), snippet: p ? stripTags(p[1]) : "" });
    if (out.length >= opts.maxResults) break;
  }
  return out;
}
function parseBaidu(html, opts) {
  if (/百度安全验证|verify\.baidu|wappass\.baidu/i.test(html)) {
    throw new Error("\u767E\u5EA6\u8FD4\u56DE\u4E86\u53CD\u722C\u9A8C\u8BC1\u9875\uFF0C\u8BE5\u5165\u53E3\u672C\u8F6E\u4E0D\u53EF\u7528");
  }
  const out = [];
  const re = /<h3[^>]*class="[^"]*t[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null && out.length < opts.maxResults) {
    const raw = decodeEntities(m[1]);
    if (!/^https?:\/\//i.test(raw)) continue;
    out.push({ url: raw, title: stripTags(m[2]), snippet: "" });
  }
  for (const item of out) {
    const idx = html.indexOf(item.url);
    if (idx === -1) continue;
    const tail = html.slice(idx, idx + 3e3);
    const s = tail.match(/<span[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    if (s) item.snippet = stripTags(s[1]);
  }
  return out;
}
function parseDdg(html, opts) {
  const out = [];
  const re = /<a[^>]+class="(?:result__a|result-link)"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<a[^>]+class="(?:result__a|result-link)"|$)/gi;
  let m;
  while ((m = re.exec(html)) !== null && out.length < opts.maxResults) {
    let url = decodeEntities(m[1]);
    const uddg = url.match(/uddg=([^&]+)/);
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (!/^https?:\/\//i.test(url)) continue;
    const snip = m[3].match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
    out.push({ url, title: stripTags(m[2] || ""), snippet: snip ? stripTags(snip[1]) : "" });
  }
  return out;
}

// src/engines-meta.js
var ENGINES_META = {
  github: {
    label: "GitHub",
    group: "repo",
    what: "\u4EE3\u7801\u4ED3\u5E93\u4E0E\u5F00\u6E90\u9879\u76EE\uFF08\u6309 star \u6392\u5E8F\uFF09",
    useWhen: "\u627E\u5F00\u6E90\u9879\u76EE\u3001\u5E93\u3001\u6846\u67B6\u3001SDK\u3001CLI\u3001\u63D2\u4EF6\u6E90\u7801\uFF1B\u5BF9\u6BD4\u540C\u7C7B\u5B9E\u73B0\uFF1B\u67E5\u67D0\u4E2A\u9879\u76EE\u6709\u591A\u5C11 star / \u662F\u5426\u6D3B\u8DC3",
    token: "githubToken",
    accept: "application/vnd.github+json",
    search: (r, q, n) => `${r.base}/search/repositories?q=${encodeURIComponent(q)}&per_page=${n}&sort=stars&order=desc`,
    pick: (d) => {
      if (d.message && !d.items) throw new Error(`GitHub API: ${d.message}`);
      return (d.items || []).map(
        (it) => repoItem({
          url: it.html_url,
          name: it.full_name,
          stars: it.stargazers_count,
          desc: it.description,
          lang: it.language,
          updated: it.pushed_at,
          extra: it.topics?.length ? `topics: ${it.topics.slice(0, 5).join(", ")}` : ""
        })
      );
    },
    routes: [
      { label: "\u76F4\u8FDE api.github.com", base: "https://api.github.com", tier: 0 },
      { label: "gh-proxy.com \u52A0\u901F", base: "https://gh-proxy.com/https://api.github.com", tier: 1 },
      { label: "gh-proxy.org \u52A0\u901F", base: "https://gh-proxy.org/https://api.github.com", tier: 1 },
      { label: "cors.isteed.cc \u52A0\u901F", base: "https://cors.isteed.cc/https://api.github.com", tier: 1 }
    ],
    rejected: 'ghproxy.net / ghfast.top\uFF08\u53EA\u4EE3\u7406 raw \u6587\u4EF6\uFF0C\u4EE3 API \u4E00\u5F8B 403\uFF09\uFF1Bkkgithub.com\u3001gh.llkk.cc\u3001gitclone.com\u3001hub.gitmirror.com\u3001ghps.cc\u3001gh.api.99988866.xyz\u3001ghp.ci\u3001mirror.ghproxy.com\u3001ghproxy.cc\u3001ghproxy.homeboyc.cn\u3001cors.eu.org\u3001api.codetabs.com\u3001api.allorigins.win\uFF08\u5B9E\u6D4B\u5747\u5931\u8D25\u6216\u8FD4\u56DE\u975E JSON\uFF09\uFF1Brepos.ecosyste.ms\uFF08HTTP 200\u3001JSON \u7ED3\u6784\u4E5F\u5408\u6CD5\uFF0C\u4F46 **\u5B8C\u5168\u5FFD\u7565\u67E5\u8BE2\u53C2\u6570** \u2014\u2014 query/q/search/\u52A0\u6392\u5E8F\u56DB\u79CD\u5199\u6CD5\u8FD4\u56DE\u540C\u4E00\u4E2A\u56FA\u5B9A\u5217\u8868\uFF0C\u5168\u662F "0/..." \u8FD9\u79CD\u5783\u573E\u4ED3\u5E93\u3002\u8FD9\u6761\u7279\u522B\u503C\u5F97\u8BB0\uFF1A200 \u4E0D\u7B49\u4E8E\u53EF\u7528\uFF0C\u53EF\u7528\u6027\u63A2\u6D4B\u5FC5\u987B\u9A8C\u8BC1\u300C\u6362\u4E2A\u67E5\u8BE2\u8BCD\u7ED3\u679C\u4F1A\u53D8\u300D\uFF09'
  },
  gitlab: {
    label: "GitLab",
    group: "repo",
    what: "GitLab.com \u4E0A\u7684\u516C\u5F00\u9879\u76EE",
    useWhen: "GitHub \u4E0A\u627E\u4E0D\u5230\u3001\u6216\u60F3\u627E\u53EA\u5728 GitLab \u6258\u7BA1\u7684\u9879\u76EE\u4E0E\u4ECE\u81EA\u5EFA\u5B9E\u4F8B\u8FC1\u79FB\u8FC7\u6765\u7684\u9879\u76EE",
    accept: "application/json",
    search: (r, q, n) => `${r.base}/projects?search=${encodeURIComponent(q)}&order_by=star_count&sort=desc&per_page=${n}`,
    pick: (d) => {
      if (!Array.isArray(d)) throw new Error("GitLab \u8FD4\u56DE\u7ED3\u6784\u5F02\u5E38");
      return d.filter((it) => it && it.web_url).map(
        (it) => repoItem({
          url: it.web_url,
          name: it.path_with_namespace || it.name,
          stars: it.star_count,
          desc: it.description,
          lang: it.language,
          updated: it.last_activity_at
        })
      );
    },
    routes: [{ label: "\u76F4\u8FDE gitlab.com", base: "https://gitlab.com/api/v4", tier: 0 }],
    rejected: "framagit.org\uFF08TLS/\u7F51\u7EDC\u4E0D\u53EF\u8FBE\uFF09\uFF1Bsalsa.debian.org\u3001invent.kde.org\u3001gitlab.gnome.org\uFF08\u53EF\u8FBE\u4F46\u641C\u7D22\u57DF\u53EA\u8986\u76D6\u5404\u81EA\u9879\u76EE\u5E93\uFF0C\u901A\u7528\u5173\u952E\u8BCD\u547D\u4E2D\u7387\u8FD1 0\uFF0C\u6536\u5F55\u53EA\u4F1A\u767D\u589E\u5EF6\u8FDF\uFF09"
  },
  codeberg: {
    label: "Codeberg",
    group: "repo",
    what: "Codeberg\uFF08\u975E\u8425\u5229\u4EE3\u7801\u6258\u7BA1\uFF0CGitea \u5185\u6838\uFF09",
    useWhen: "\u627E\u65E0\u5546\u4E1A\u6258\u7BA1\u7684\u5F00\u6E90\u9879\u76EE\u3001\u9690\u79C1\u53CB\u597D\u7684\u66FF\u4EE3\u5B9E\u73B0\uFF1B\u7ED3\u679C\u72EC\u7ACB\u4E8E GitHub",
    accept: "application/json",
    search: (r, q, n) => `${r.base}/repos/search?q=${encodeURIComponent(q)}&sort=stars&order=desc&limit=${n}`,
    pick: (d) => giteaPick(d, "Codeberg"),
    routes: [
      {
        // 必须用 bot UA：完整浏览器 UA 会被 WAF 403（实测 /api/v1/version 同样 403）
        label: "\u76F4\u8FDE codeberg.org",
        base: "https://codeberg.org/api/v1",
        tier: 0,
        ua: "bot"
      }
    ]
  },
  gitea: {
    label: "Gitea.com",
    group: "repo",
    what: "Gitea \u5B98\u65B9\u6258\u7BA1\u7AD9\u4E0A\u7684\u516C\u5F00\u4ED3\u5E93",
    useWhen: "\u627E\u81EA\u6258\u7BA1\u751F\u6001\uFF08Gitea / Forgejo\uFF09\u76F8\u5173\u9879\u76EE\u4E0E\u63D2\u4EF6",
    accept: "application/json",
    search: (r, q, n) => `${r.base}/repos/search?q=${encodeURIComponent(q)}&sort=stars&order=desc&limit=${n}`,
    pick: (d) => giteaPick(d, "Gitea"),
    routes: [{ label: "\u76F4\u8FDE gitea.com", base: "https://gitea.com/api/v1", tier: 0 }]
  },
  gitee: {
    label: "Gitee \u7801\u4E91",
    group: "repo",
    what: "\u56FD\u5185\u4EE3\u7801\u6258\u7BA1\uFF08\u4E2D\u6587\u9879\u76EE\u3001\u56FD\u5185\u56E2\u961F\u4F5C\u54C1\uFF09",
    useWhen: "\u627E\u56FD\u5185\u5F00\u6E90\u9879\u76EE\u3001\u56FD\u4EA7\u66FF\u4EE3\u65B9\u6848\u3001\u4E2D\u6587\u6587\u6863\u4E3A\u4E3B\u7684\u4ED3\u5E93",
    token: "giteeToken",
    accept: "application/json",
    search: (r, q, n, o) => `${r.base}/search/repositories?q=${encodeURIComponent(q)}&per_page=${n}&access_token=${encodeURIComponent(o.giteeToken)}`,
    pick: (d) => {
      if (!Array.isArray(d)) throw new Error("Gitee \u8FD4\u56DE\u7ED3\u6784\u5F02\u5E38\uFF08token \u662F\u5426\u6709\u6548\uFF1F\uFF09");
      return d.map(
        (it) => repoItem({
          url: it.html_url,
          name: it.full_name,
          stars: it.stargazers_count,
          desc: it.description,
          lang: it.language,
          updated: it.updated_at || it.pushed_at
        })
      );
    },
    routes: [{ label: "\u76F4\u8FDE gitee.com", base: "https://gitee.com/api/v5", tier: 0 }],
    note: "\u641C\u7D22 API \u5FC5\u987B\u5E26\u8BBF\u95EE\u4EE4\u724C\uFF1A\u533F\u540D\u8BBF\u95EE\u8FD4\u56DE 200 + \u7A7A\u6570\u7EC4\uFF0C\u770B\u8D77\u6765\u50CF\u300C\u6CA1\u6709\u7ED3\u679C\u300D\u3002\u672A\u914D\u7F6E giteeToken \u65F6\u8BE5\u5F15\u64CE\u88AB\u81EA\u52A8\u8DF3\u8FC7\uFF0C\u4E0D\u4F1A\u6C61\u67D3 repo \u7684\u5408\u5E76\u7ED3\u679C\u3002"
  },
  npm: {
    label: "npm",
    group: "pkg",
    what: "npm \u5305\uFF08Node / JS / TS \u751F\u6001\uFF09",
    useWhen: "\u627E JS/TS \u5E93\u4E0E CLI \u5DE5\u5177\u3001\u67E5\u5305\u540D\u662F\u5426\u88AB\u5360\u7528\u3001\u770B\u5305\u7248\u672C\u4E0E\u53D1\u5E03\u65F6\u95F4",
    accept: "application/json",
    search: (r, q, n) => `${r.base}/-/v1/search?text=${encodeURIComponent(q)}&size=${n}`,
    pick: (d, route) => (d.objects || []).map((o) => {
      const p = o.package || {};
      return pkgItem({
        url: `${route.web}/package/${p.name}`,
        name: p.name,
        version: p.version,
        downloads: o.downloads?.monthly ?? o.score?.detail?.popularity ?? null,
        desc: p.description,
        extra: p.date ? `\u53D1\u5E03: ${String(p.date).slice(0, 10)}` : ""
      });
    }),
    routes: [
      { label: "\u76F4\u8FDE registry.npmjs.org", base: "https://registry.npmjs.org", tier: 0, web: "https://www.npmjs.com" },
      { label: "npmmirror \u955C\u50CF", base: "https://registry.npmmirror.com", tier: 1, web: "https://npmmirror.com" },
      { label: "\u817E\u8BAF\u4E91\u955C\u50CF", base: "https://mirrors.cloud.tencent.com/npm", tier: 1, web: "https://www.npmjs.com" }
    ],
    rejected: "mirrors.huaweicloud.com/repository/npm\uFF08\u8FD4\u56DE\u7ED3\u6784\u4E0D\u662F npm search \u683C\u5F0F\uFF09",
    note: 'npmmirror \u53EA\u662F npm \u7684\u4E00\u6761\u955C\u50CF\u8DEF\u7531\uFF0C\u5185\u5BB9\u4E0E npm \u4E00\u81F4\uFF0C\u56E0\u6B64\u4E0D\u518D\u5355\u72EC\u5360\u4E00\u4E2A\u5F15\u64CE id\uFF1B\u4ECD\u7136\u53EF\u4EE5\u5199 engine="npmmirror" \u5F3A\u5236\u8D70\u8FD9\u6761\u8DEF\u7531\u3002'
  },
  crates: {
    label: "crates.io",
    group: "pkg",
    what: "Rust crate",
    useWhen: "\u627E Rust \u5E93\u3001\u67E5 crate \u4E0B\u8F7D\u91CF\u4E0E\u7248\u672C",
    accept: "application/json",
    search: (r, q, n) => `${r.base}?q=${encodeURIComponent(q)}&per_page=${n}`,
    pick: (d) => (d.crates || []).map(
      (c) => pkgItem({
        url: `https://crates.io/crates/${c.name}`,
        name: c.name,
        version: c.max_version,
        downloads: c.downloads,
        desc: c.description,
        extra: c.repository || ""
      })
    ),
    routes: [
      { label: "\u76F4\u8FDE crates.io", base: "https://crates.io/api/v1/crates", tier: 0 },
      { label: "rsproxy.cn \u52A0\u901F", base: "https://rsproxy.cn/api/v1/crates", tier: 1 }
    ],
    rejected: "mirrors.ustc.edu.cn\uFF08404\uFF09\u3001mirrors.tuna.tsinghua.edu.cn\uFF08403\uFF09\u2014\u2014 \u4E24\u7AD9\u53EA\u955C\u50CF crate \u4E0B\u8F7D\uFF0C\u4E0D\u63D0\u4F9B\u641C\u7D22 API"
  },
  packagist: {
    label: "Packagist",
    group: "pkg",
    what: "PHP Composer \u5305",
    useWhen: "\u627E PHP \u5E93\u4E0E\u6846\u67B6\u7EC4\u4EF6",
    accept: "application/json",
    search: (r, q, n) => `${r.base}/search.json?q=${encodeURIComponent(q)}&per_page=${n}`,
    pick: (d) => (d.results || []).map(
      (x) => pkgItem({
        url: `https://packagist.org/packages/${x.name}`,
        name: x.name,
        downloads: x.downloads,
        desc: x.description,
        extra: x.repository || ""
      })
    ),
    routes: [{ label: "\u76F4\u8FDE packagist.org", base: "https://packagist.org", tier: 0 }],
    rejected: "mirrors.aliyun.com/composer\uFF08404\uFF0C\u53EA\u955C\u50CF\u4E0B\u8F7D\u4E0D\u63D0\u4F9B\u641C\u7D22\uFF09"
  },
  nuget: {
    label: "NuGet",
    group: "pkg",
    what: ".NET \u5305",
    useWhen: "\u627E C# / .NET \u5E93",
    accept: "application/json",
    search: (r, q, n) => `${r.base}/query?q=${encodeURIComponent(q)}&take=${n}`,
    pick: (d) => (d.data || []).map(
      (p) => pkgItem({
        url: `https://www.nuget.org/packages/${p.id}`,
        name: p.id,
        version: p.version,
        downloads: p.totalDownloads,
        desc: p.description,
        extra: p.projectUrl || ""
      })
    ),
    routes: [
      { label: "\u76F4\u8FDE azuresearch-usnc", base: "https://azuresearch-usnc.nuget.org", tier: 0 },
      { label: "azuresearch-ussc \u5907\u7528", base: "https://azuresearch-ussc.nuget.org", tier: 1 }
    ],
    rejected: "api.nuget.org/v3/query\uFF08404\uFF09\u3001nuget.cdn.azure.cn\uFF08\u4E0D\u53EF\u8FBE\uFF09"
  },
  rubygems: {
    label: "RubyGems",
    group: "pkg",
    what: "Ruby gem",
    useWhen: "\u627E Ruby \u5E93\u4E0E Rails \u76F8\u5173\u7EC4\u4EF6",
    accept: "application/json",
    search: (r, q) => `${r.base}/search.json?query=${encodeURIComponent(q)}`,
    pick: (d, _route, opts) => {
      const arr = Array.isArray(d) ? d : [];
      return arr.slice(0, opts.maxResults).map(
        (g) => pkgItem({
          url: `https://rubygems.org/gems/${g.name}`,
          name: g.name,
          version: g.version,
          downloads: g.downloads,
          desc: g.info,
          extra: g.homepage_uri || ""
        })
      );
    },
    routes: [{ label: "\u76F4\u8FDE rubygems.org", base: "https://rubygems.org/api/v1", tier: 0 }],
    rejected: "mirrors.tuna.tsinghua.edu.cn/rubygems\uFF08403\uFF0C\u53EA\u955C\u50CF\u4E0B\u8F7D\uFF09"
  },
  maven: {
    label: "Maven Central",
    group: "pkg",
    what: "Maven Central \u4E0A\u7684 Java / JVM \u6784\u4EF6",
    useWhen: "\u627E Java / Kotlin / Scala \u5E93\u4E0E\u6846\u67B6\u7EC4\u4EF6",
    accept: "application/json",
    search: (r, q, n) => `${r.base}/select?q=${encodeURIComponent(q)}&rows=${n}&wt=json`,
    pick: (d) => (d.response && d.response.docs || []).map((x) => {
      const [g, a] = String(x.id || "").split(":");
      return pkgItem({
        url: g && a ? `https://central.sonatype.com/artifact/${g}/${a}` : `https://search.maven.org/#search|ga|1|${x.id}`,
        name: x.id,
        version: x.latestVersion,
        downloads: null,
        desc: "Maven Central \u6784\u4EF6\uFF08groupId:artifactId\uFF09",
        extra: x.p || ""
      });
    }),
    routes: [{ label: "\u76F4\u8FDE search.maven.org", base: "https://search.maven.org/solrsearch", tier: 0 }],
    rejected: "central.sonatype.com/api/internal/browse\uFF08405\uFF0C\u5185\u90E8\u63A5\u53E3\u4E0D\u5916\u653E\uFF09"
  },
  huggingface: {
    label: "HuggingFace",
    group: "pkg",
    what: "HuggingFace \u6A21\u578B\u4E0E\u6570\u636E\u96C6",
    useWhen: "\u627E\u9884\u8BAD\u7EC3\u6A21\u578B\u3001\u6570\u636E\u96C6\u3001\u5FAE\u8C03\u6743\u91CD\uFF1B\u786E\u8BA4\u67D0\u4E2A\u6A21\u578B\u662F\u5426\u5B58\u5728\u53CA\u5176\u4E0B\u8F7D\u91CF",
    accept: "application/json",
    search: (r, q, n) => `${r.base}/api/models?search=${encodeURIComponent(q)}&limit=${n}&full=false`,
    pick: (d) => (Array.isArray(d) ? d : []).map(
      (m) => pkgItem({
        url: `https://huggingface.co/${m.id}`,
        name: m.id,
        version: null,
        downloads: m.downloads,
        desc: (m.tags || []).filter((t) => !/^(transformers|pytorch|tf|safetensors|arxiv:)/.test(t)).slice(0, 6).join(", "),
        extra: m.likes != null ? `\u2665${m.likes}` : ""
      })
    ),
    routes: [
      { label: "hf-mirror.com \u52A0\u901F", base: "https://hf-mirror.com", tier: 1 },
      { label: "\u76F4\u8FDE huggingface.co", base: "https://huggingface.co", tier: 0 }
    ],
    // 实测本机直连 huggingface.co 不可达。默认 direct-first 会让每次冷启动的
    // pkg 搜索白白多等一次超时（实测 16s），所以这个引擎默认先走镜像。
    preferAccel: true,
    note: '\u672C\u673A\u76F4\u8FDE huggingface.co \u4E0D\u53EF\u8FBE\uFF0C\u9ED8\u8BA4\u5148\u8D70 hf-mirror.com \u955C\u50CF\uFF08\u5B9E\u6D4B\u53EF\u7528\uFF09\uFF1B\u4ECD\u53EF\u5199 engine="hf-mirror" \u663E\u5F0F\u6307\u5B9A\u8BE5\u8DEF\u7531\uFF0C\u6216\u7528 routePolicy=direct-first \u5F3A\u5236\u5148\u76F4\u8FDE\u3002'
  },
  bing: {
    label: "Bing \u4E2D\u56FD",
    group: "web",
    what: "\u901A\u7528\u7F51\u9875\u641C\u7D22",
    useWhen: "\u6280\u672F\u6587\u6863\u3001\u6559\u7A0B\u3001\u65B0\u95FB\u3001\u4EA7\u54C1\u5B98\u7F51\u3001\u62A5\u9519\u4FE1\u606F\u2014\u2014\u4E2D\u82F1\u6587\u901A\u7528\uFF0C\u9ED8\u8BA4\u5F15\u64CE\uFF08Edge \u6D4F\u89C8\u5668\u7684\u9ED8\u8BA4\u641C\u7D22\u5F15\u64CE\u540C\u4E3A Bing\uFF0C\u4E8C\u8005\u7B49\u4EF7\uFF09",
    html: true,
    ua: "browser",
    search: (r, q) => `${r.base}/search?q=${encodeURIComponent(q)}&ensearch=0&count=20`,
    pick: (html, _route, opts) => parseBing(html, opts),
    routes: [
      { label: "cn.bing.com", base: "https://cn.bing.com", tier: 0 },
      { label: "www.bing.com \u5907\u7528", base: "https://www.bing.com", tier: 1 }
    ]
  },
  baidu: {
    label: "\u767E\u5EA6",
    group: "web",
    what: "\u4E2D\u6587\u7F51\u9875\u641C\u7D22",
    useWhen: "\u7EAF\u4E2D\u6587\u5185\u5BB9\u3001\u56FD\u5185\u7AD9\u70B9\u3001\u767E\u79D1\u3001\u95EE\u7B54\u3001\u8BBA\u575B\u5E16",
    html: true,
    ua: "browser",
    search: (r, q) => `${r.base}/s?wd=${encodeURIComponent(q)}&rn=20`,
    pick: (html, _route, opts) => parseBaidu(html, opts),
    routes: [{ label: "www.baidu.com", base: "https://www.baidu.com", tier: 0 }],
    rejected: "m.baidu.com\uFF08\u79FB\u52A8\u7248\u7ED3\u6784\u4E0D\u540C\u4E14\u540C\u6837\u6709\u53CD\u722C\u6821\u9A8C\uFF0C\u6536\u5F55\u65E0\u6536\u76CA\uFF09"
  },
  duckduckgo: {
    label: "DuckDuckGo",
    group: "web",
    what: "\u82F1\u6587\u9690\u79C1\u641C\u7D22",
    useWhen: "\u82F1\u6587\u8D44\u6599\u4E14\u4E0D\u5E0C\u671B\u88AB\u8FFD\u8E2A\uFF1B\u672C\u673A\u5B9E\u6D4B\u4E24\u4E2A\u5165\u53E3\u5747\u4E0D\u53EF\u8FBE\uFF0C\u6545\u6392\u5728\u987A\u5E8F\u672B\u4F4D",
    html: true,
    ua: "browser",
    direct: false,
    search: (r, q) => `${r.base}${r.path || ""}?q=${encodeURIComponent(q)}`,
    pick: (html, _route, opts) => parseDdg(html, opts),
    routes: [
      { label: "html.duckduckgo.com", base: "https://html.duckduckgo.com", path: "/html/", tier: 0 },
      { label: "lite.duckduckgo.com", base: "https://lite.duckduckgo.com", path: "/lite/", tier: 1 }
    ]
  },
  repo: {
    label: "\u4EE3\u7801\u4ED3\u5E93\uFF08\u591A\u6E90\u5408\u5E76\uFF09",
    group: "composite",
    what: "\u5E76\u884C\u67E5\u8BE2\u914D\u7F6E\u91CC\u7684\u6240\u6709\u4EE3\u7801\u6258\u7BA1\u6E90\uFF08\u9ED8\u8BA4 GitHub + GitLab + Codeberg + Gitea\uFF1B\u914D\u4E86 Gitee \u4EE4\u724C\u8FD8\u4F1A\u5E26\u4E0A\u7801\u4E91\uFF09\uFF0C\u6309\u6765\u6E90\u8F6E\u8F6C\u5408\u5E76",
    useWhen: "\u9ED8\u8BA4\u7684\u4EE3\u7801/\u4ED3\u5E93\u610F\u56FE\u5165\u53E3\u3002\u60F3\u8981\u591A\u6E90\u8986\u76D6\u800C\u4E0D\u662F\u53EA\u770B GitHub \u65F6\u7528\u5B83\uFF1B\u60F3\u53EA\u770B\u67D0\u4E00\u4E2A\u6E90\u5C31\u663E\u5F0F\u6307\u5B9A\u8BE5\u5F15\u64CE"
  },
  pkg: {
    label: "\u5305\u4ED3\u5E93\uFF08\u591A\u6E90\u5408\u5E76\uFF09",
    group: "composite",
    what: "\u5E76\u884C\u67E5\u8BE2\u914D\u7F6E\u91CC\u7684\u6240\u6709\u5305\u4ED3\u5E93\u6E90\uFF08\u9ED8\u8BA4 npm + crates.io + Packagist + NuGet + RubyGems + Maven Central + HuggingFace\uFF09",
    useWhen: "\u9ED8\u8BA4\u7684\u4F9D\u8D56\u5305\u610F\u56FE\u5165\u53E3\u3002\u8DE8\u8BED\u8A00\u627E\u5E93\u3001\u6BD4\u8F83\u540C\u7C7B\u5305\u3001\u786E\u8BA4\u5305\u540D\u4E0E\u6700\u65B0\u7248\u672C"
  }
};
var REPO_ENGINES = ["github", "gitlab", "codeberg", "gitea", "gitee"];
var PKG_ENGINES = ["npm", "crates", "packagist", "nuget", "rubygems", "maven", "huggingface"];
var WEB_ENGINES = ["bing", "baidu", "duckduckgo"];
var COMPOSITE_ENGINES = ["repo", "pkg"];
var ENGINE_IDS = [...REPO_ENGINES, ...PKG_ENGINES, ...WEB_ENGINES, ...COMPOSITE_ENGINES];
var ENGINE_ALIASES = {
  npmmirror: { engine: "npm", route: "npmmirror" },
  "npm-mirror": { engine: "npm", route: "npmmirror" },
  "hf-mirror": { engine: "huggingface", route: "hf-mirror" },
  "gh-proxy": { engine: "github", route: "gh-proxy.com" },
  ghproxy: { engine: "github", route: "gh-proxy.com" },
  "github-mirror": { engine: "github", route: "gh-proxy.com" }
};
var ALL_ENGINE_IDS = [...ENGINE_IDS, ...Object.keys(ENGINE_ALIASES)];
function baseEngineId(id) {
  return ENGINE_ALIASES[id]?.engine || id;
}
function pinnedRoute(id) {
  return ENGINE_ALIASES[id]?.route || null;
}
var BUILTIN_ROUTES = {};
for (const [id, def] of Object.entries(ENGINES_META)) {
  BUILTIN_ROUTES[id] = (def.routes || []).map((r) => ({ ...r }));
}
function customEngineIdsFor(catId) {
  return Object.keys(ENGINES_META).filter((id) => id.startsWith(`custom-${catId}-`));
}

// src/config.js
var Config = Schema ? Schema.object({
  proxyUrl: Schema.string().default("").description(
    "\u4EE3\u7406\u5730\u5740\uFF0C\u7559\u7A7A\u5219\u76F4\u8FDE\u3002\u4F8B\u5982 http://127.0.0.1:7890\uFF08Clash \u9ED8\u8BA4\u7AEF\u53E3\uFF09\u3002\u6D77\u5916\u5F15\u64CE\uFF08DuckDuckGo\uFF09\u5728\u76F4\u8FDE\u73AF\u5883\u4E0B\u901A\u5E38\u4E0D\u53EF\u8FBE\uFF0C\u586B\u4E86\u4EE3\u7406\u624D\u4F1A\u88AB\u771F\u6B63\u7528\u5230\u3002"
  ),
  engineOrder: Schema.array(Schema.union(ALL_ENGINE_IDS)).default(DEFAULTS.engineOrder).description("\u641C\u7D22\u5F15\u64CE\u8F6E\u8BE2\u987A\u5E8F\u3002\u7701\u7565 engine \u65F6\u6309\u6B64\u987A\u5E8F\u5C1D\u8BD5\uFF08\u9ED8\u8BA4 Web \u641C\u7D22\uFF09\u3002\u4EE3\u7801/\u4ED3\u5E93/\u4F9D\u8D56\u7C7B\u8BF7\u7528 engine \u663E\u5F0F\u6307\u5B9A repo / pkg\u3002"),
  githubToken: Schema.string().default("").description(
    "\u53EF\u9009\u7684 GitHub Token\uFF0C\u4EC5\u7528\u4E8E\u63D0\u9AD8 api.github.com \u7684\u641C\u7D22\u9891\u7387\u4E0A\u9650\uFF08\u533F\u540D\u7EA6 10 \u6B21/\u5206\u949F\uFF09\u3002\u7559\u7A7A\u5219\u533F\u540D\u8BBF\u95EE\uFF0C\u4E5F\u652F\u6301\u73AF\u5883\u53D8\u91CF GITHUB_TOKEN\u3002"
  ),
  giteeToken: Schema.string().default("").description(
    "Gitee \u8BBF\u95EE\u4EE4\u724C\u3002Gitee \u7684\u641C\u7D22 API \u73B0\u5728\u8981\u6C42\u4EE4\u724C\uFF0C\u672A\u914D\u7F6E\u65F6 gitee \u5F15\u64CE\u4F1A\u88AB\u81EA\u52A8\u8DF3\u8FC7\uFF08\u5176\u4ED6\u4EE3\u7801\u6E90\u4E0D\u53D7\u5F71\u54CD\uFF09\u3002\u4E5F\u652F\u6301\u73AF\u5883\u53D8\u91CF GITEE_TOKEN\u3002"
  ),
  enableGithubMirrors: Schema.boolean().default(true).description(
    "\u6293\u53D6 raw.githubusercontent.com / github.com \u5931\u8D25\u65F6\uFF0C\u81EA\u52A8\u6539\u7528 GitHub \u52A0\u901F\u955C\u50CF\u91CD\u8BD5\uFF08ghproxy.net / ghfast.top / gh-proxy.com\uFF09\u3002\u56FD\u5185\u7F51\u7EDC\u4E0B\u80FD\u663E\u8457\u63D0\u9AD8\u6210\u529F\u7387\u3002"
  ),
  routePolicy: Schema.union(["auto", "direct-first", "accel-first"]).default("auto").description(
    "\u540C\u4E00\u4E2A\u6E90\u7684\u591A\u4E2A\u5165\u53E3\u8C01\u5148\u8BD5\u3002auto\uFF08\u9ED8\u8BA4\uFF09\uFF1A\u6309\u5F15\u64CE\u5B9E\u6D4B\u60C5\u51B5\u51B3\u5B9A \u2014\u2014 \u76F4\u8FDE\u53EF\u7528\u5C31\u5148\u76F4\u8FDE\uFF0C\u672C\u673A\u5B9E\u6D4B\u76F4\u8FDE\u4E0D\u53EF\u8FBE\u7684\u5F15\u64CE\uFF08\u5982 HuggingFace\uFF09\u5148\u8D70\u955C\u50CF\uFF1Bdirect-first\uFF1A\u4E00\u5F8B\u5148\u76F4\u8FDE\uFF1Baccel-first\uFF1A\u4E00\u5F8B\u5148\u8D70\u955C\u50CF/\u52A0\u901F\u3002\u7B2C\u4E09\u65B9\u7D22\u5F15\u5165\u53E3\u5728\u4EFB\u4F55\u7B56\u7565\u4E0B\u90FD\u6392\u6700\u540E\u3002\u65E0\u8BBA\u54EA\u79CD\u987A\u5E8F\uFF0C\u672C\u6B21\u4F1A\u8BDD\u91CC\u5931\u8D25\u8FC7\u7684\u5165\u53E3\u90FD\u4F1A\u88AB\u81EA\u52A8\u6392\u5230\u540E\u9762\u3002"
  ),
  repoEngines: Schema.array(Schema.union(ALL_ENGINE_IDS)).default(DEFAULTS.repoEngines).description("repo \u591A\u6E90\u5408\u5E76\u5305\u542B\u54EA\u4E9B\u4EE3\u7801\u6258\u7BA1\u6E90\u3002\u53EF\u589E\u5220\uFF08\u8BBE\u6210\u7A7A\u6570\u7EC4\u5219\u56DE\u9000\u5185\u7F6E\u9ED8\u8BA4\uFF09\u3002"),
  pkgEngines: Schema.array(Schema.union(ALL_ENGINE_IDS)).default(DEFAULTS.pkgEngines).description("pkg \u591A\u6E90\u5408\u5E76\u5305\u542B\u54EA\u4E9B\u5305\u4ED3\u5E93\u6E90\u3002\u53EF\u589E\u5220\uFF08\u8BBE\u6210\u7A7A\u6570\u7EC4\u5219\u56DE\u9000\u5185\u7F6E\u9ED8\u8BA4\uFF09\u3002"),
  maxResults: Schema.number().default(DEFAULTS.maxResults).description("\u6BCF\u6B21\u641C\u7D22\u8FD4\u56DE\u7684\u7ED3\u679C\u6761\u6570\u3002"),
  timeoutMs: Schema.number().default(DEFAULTS.timeoutMs).description("\u5355\u4E2A HTTP \u8BF7\u6C42\u7684\u8D85\u65F6\u65F6\u95F4\uFF08\u6BEB\u79D2\uFF09\u3002"),
  fetchMaxChars: Schema.number().default(DEFAULTS.fetchMaxChars).description("\u6293\u53D6\u7F51\u9875\u65F6\u6B63\u6587\u7684\u6700\u5927\u5B57\u7B26\u6570\u3002"),
  enableFetch: Schema.boolean().default(true).description("\u662F\u5426\u5141\u8BB8\u6A21\u578B\u8C03\u7528 web_fetch \u6293\u53D6 URL \u6B63\u6587\u3002")
}) : void 0;

// src/plugin.js
import { unlinkSync } from "node:fs";

// src/net.js
var UA = UA_BROWSER;
var NO_PROXY = () => ({ dispatcher: void 0, fetchImpl: null });
var cachedProxy = { proxyUrl: null, dispatcher: null, fetchImpl: null };
var undiciPromise = null;
var proxyWarned = false;
var proxyBuild = { url: null, promise: null };
function getUndici() {
  if (!undiciPromise) undiciPromise = optionalImport("undici");
  return undiciPromise;
}
async function resolveProxy(proxyUrl, logger) {
  if (!proxyUrl) return NO_PROXY();
  if (cachedProxy.proxyUrl === proxyUrl && cachedProxy.dispatcher) return cachedProxy;
  if (proxyBuild.url !== proxyUrl || !proxyBuild.promise) {
    proxyBuild = { url: proxyUrl, promise: buildProxy(proxyUrl, logger) };
  }
  const built = await proxyBuild.promise;
  if (built.dispatcher) cachedProxy = built;
  return built;
}
async function buildProxy(proxyUrl, logger) {
  const mod = await getUndici();
  const ProxyAgent = mod?.ProxyAgent ?? mod?.default?.ProxyAgent;
  const fetchImpl = mod?.fetch ?? mod?.default?.fetch ?? null;
  if (!ProxyAgent || !fetchImpl) {
    if (!proxyWarned) {
      proxyWarned = true;
      logger?.warn?.(
        `websearch-direct: \u5DF2\u914D\u7F6E proxyUrl=${redactSensitive(proxyUrl)}\uFF0C\u4F46\u65E0\u6CD5\u89E3\u6790 undici\uFF08ProxyAgent/fetch \u4E0D\u53EF\u7528\uFF09\uFF0C\u672C\u6B21\u4EE3\u7406\u4E0D\u4F1A\u751F\u6548\u3002\u4FEE\u6CD5\uFF1A\u628A undici \u88C5\u8FDB\u63D2\u4EF6\u6240\u5728\u7684 node_modules\uFF0C\u6216\u8BBE\u7F6E NODE_USE_ENV_PROXY=1 \u8BA9 Node \u76F4\u63A5\u8BFB\u53D6 HTTP(S)_PROXY \u73AF\u5883\u53D8\u91CF\u3002`
      );
    }
    return NO_PROXY();
  }
  try {
    const dispatcher = new ProxyAgent(proxyUrl);
    return { proxyUrl, dispatcher, fetchImpl };
  } catch (err) {
    if (!proxyWarned) {
      proxyWarned = true;
      logger?.warn?.(`websearch-direct: ProxyAgent \u6784\u9020\u5931\u8D25\uFF08${err.message}\uFF09\uFF0C\u4EE3\u7406\u4E0D\u4F1A\u751F\u6548\u3002`);
    }
    return NO_PROXY();
  }
}
async function request(url, { proxyUrl, timeoutMs, signal, accept, ua, extraHeaders, logger } = {}) {
  const { dispatcher, fetchImpl } = await resolveProxy(proxyUrl, logger);
  const doFetch = fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    const res = await doFetch(url, {
      signal: controller.signal,
      dispatcher,
      redirect: "follow",
      headers: {
        "User-Agent": ua || UA,
        Accept: accept || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        ...extraHeaders
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.text();
  } catch (err) {
    if (proxyUrl && err?.name !== "AbortError" && !/^HTTP \d/.test(String(err?.message))) {
      throw new Error(`\u7ECF\u4EE3\u7406 ${redactSensitive(proxyUrl)} \u8BF7\u6C42\u5931\u8D25: ${redactSensitive(err.message)}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}
async function getJson(url, opts, what) {
  const raw = await request(url, { ...opts, accept: opts.accept || "application/json" });
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`${what} \u8FD4\u56DE\u975E JSON\uFF08\u53EF\u80FD\u88AB\u9650\u6D41\u6216\u62E6\u622A\uFF09`);
  }
  return data;
}

// src/route-exec.js
var routeHealth = /* @__PURE__ */ new Map();
var routeKey = (id, route) => `${id}|${route.label}`;
function markRouteFailed(id, route, message) {
  const k = routeKey(id, route);
  const cur = routeHealth.get(k) || { fails: 0, lastError: "" };
  routeHealth.set(k, { fails: cur.fails + 1, lastError: message });
}
function markRouteOk(id, route) {
  routeHealth.delete(routeKey(id, route));
}
function orderedRoutes(def, engineId, policy, pin) {
  let list = def.routes || [];
  if (pin) {
    const hit = list.filter((r) => r.label.includes(pin));
    if (hit.length) list = hit;
  }
  const eff = policy === "direct-first" || policy === "accel-first" ? policy : def.preferAccel ? "accel-first" : "direct-first";
  const rank = (r) => eff === "accel-first" ? r.tier === 1 ? 0 : r.tier === 0 ? 1 : 2 : r.tier;
  return list.map((r, i) => ({ r, i })).sort((a, b) => {
    const fa = routeHealth.get(routeKey(engineId, a.r))?.fails || 0;
    const fb = routeHealth.get(routeKey(engineId, b.r))?.fails || 0;
    if (fa !== fb) return fa - fb;
    const ta = rank(a.r);
    const tb = rank(b.r);
    if (ta !== tb) return ta - tb;
    return a.i - b.i;
  }).map((x) => x.r);
}
function routeUa(def, route) {
  const want = route.ua || def.ua;
  if (want === "bot") return UA_BOT;
  if (want === "browser") return UA_BROWSER;
  return def.html ? UA_BROWSER : UA_BOT;
}
async function runRoute(def, route, query, opts) {
  const n = clampInt(opts.maxResults, 1, 30, 8);
  let proxyUrl = opts.proxyUrl;
  const ov = opts._ui?.routeOverrides?.[`${opts._engineId}|${route.label}`];
  if (ov?.proxy === true) proxyUrl = opts._globalProxyUrl || "";
  else if (ov?.proxy === false) proxyUrl = "";
  const effRoute = ov?.url ? { ...route, base: ov.url } : route;
  const build = effRoute.search || def.search;
  const pick = effRoute.pick || def.pick;
  const url = build(effRoute, query, n, opts);
  const ua = routeUa(def, effRoute);
  const accept = effRoute.accept || def.accept;
  const extraHeaders = def.token === "githubToken" && opts.githubToken && route.tier === 0 ? { Authorization: `Bearer ${opts.githubToken}` } : void 0;
  let payload;
  if (def.html) {
    payload = await request(url, { ...opts, proxyUrl, ua, accept, extraHeaders });
  } else {
    payload = await getJson(url, { ...opts, proxyUrl, ua, accept, extraHeaders }, def.label);
  }
  return (pick(payload, route, opts) || []).map((it) => ({ ...it, via: route.label }));
}
function isRouteUnavailable(message) {
  const http = String(message || "").match(/HTTP (\d{3})/);
  if (!http) return true;
  const code = Number(http[1]);
  return code === 403 || code === 429 || code >= 500;
}
var RETRY_MAX = 2;
var RETRY_BASE_MS = 400;
var RETRY_CAP_MS = 2e3;
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function isRetryable(message) {
  const http = String(message || "").match(/HTTP (\d{3})/);
  if (http) return Number(http[1]) === 429 || Number(http[1]) === 503;
  return !/abort|timeout|超时|timed out/i.test(String(message || ""));
}
async function runEngine(engineId, query, opts) {
  const def = ENGINES_META[engineId];
  if (!def) throw new Error(`\u672A\u77E5\u5F15\u64CE "${engineId}"`);
  const policy = ["direct-first", "accel-first"].includes(opts.routePolicy) ? opts.routePolicy : "auto";
  const pin = opts._routePin || null;
  let routes = orderedRoutes(def, engineId, policy, pin).filter((r) => r.base);
  const uiOv = opts._ui?.routeOverrides;
  const uiCustom = opts._ui?.custom;
  const uiExtras = opts._ui?.routeExtras;
  if (uiOv && Object.keys(uiOv).length || uiCustom && Object.keys(uiCustom).length || uiExtras && Object.keys(uiExtras).length) {
    routes = routes.filter((r) => {
      if (r.tier !== 1) return true;
      if (engineId.startsWith("custom-") && typeof r.proxyIndex === "number") {
        const catId = engineId.slice("custom-".length, engineId.lastIndexOf("-"));
        const srcNo = Number(engineId.slice(engineId.lastIndexOf("-") + 1)) - 1;
        const entry = (uiCustom?.[catId] || [])[srcNo]?.proxies?.[r.proxyIndex];
        if (entry && entry.enabled === false) return false;
      } else if (r.extra && typeof r.extraIndex === "number") {
        const extra = (uiExtras?.[engineId] || [])[r.extraIndex];
        if (extra && extra.enabled === false) return false;
      }
      return uiOv?.[`${engineId}|${r.label}`]?.enabled !== false;
    });
  }
  if (!routes.length) throw new Error(`${def.label}\uFF1A\u6CA1\u6709\u53EF\u7528\u8DEF\u7531`);
  const overrides = opts._ui?.routeOverrides;
  if (overrides && Object.keys(overrides).length) {
    const ov = (r) => overrides[`${engineId}|${r.label}`]?.proxy;
    const wantsProxy = (def.routes || []).some((r) => ov(r) === true);
    const wantsDirect = (def.routes || []).some((r) => ov(r) === false);
    if (wantsProxy || wantsDirect) {
      const eff = wantsProxy ? "accel-first" : "direct-first";
      const rank = (r) => eff === "accel-first" ? r.tier === 1 ? 0 : r.tier === 0 ? 1 : 2 : r.tier;
      const forced = (r) => ov(r) === false ? -1 : 0;
      routes = [...routes].sort((a, b) => {
        const fa = forced(a) - forced(b);
        if (fa) return fa;
        const ta = rank(a) - rank(b);
        if (ta) return ta;
        return 0;
      });
    }
  }
  opts._engineId = engineId;
  const failures = [];
  for (const route of routes) {
    const t0 = Date.now();
    let lastErr = null;
    for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
      if (opts.signal?.aborted) {
        lastErr = lastErr || new Error("\u5DF2\u53D6\u6D88");
        break;
      }
      try {
        const items = await runRoute(def, route, query, opts);
        markRouteOk(engineId, route);
        if (!items.length) {
          opts.logger?.debug?.(`websearch-direct: ${def.label} \u7ECF\u300C${route.label}\u300D\u65E0\u7ED3\u679C`);
        }
        return { items, via: route.label, ms: Date.now() - t0, failures };
      } catch (err2) {
        lastErr = err2;
        if (attempt < RETRY_MAX && isRetryable(err2.message)) {
          const delay = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_CAP_MS);
          opts.logger?.warn?.(
            `websearch-direct: ${def.label} \u5165\u53E3\u300C${route.label}\u300D\u6682\u8D25\uFF08${redactSensitive(err2.message)}\uFF09\uFF0C${delay}ms \u540E\u91CD\u8BD5\uFF08${attempt + 1}/${RETRY_MAX}\uFF09`
          );
          await sleep(delay);
          continue;
        }
        break;
      }
    }
    const err = lastErr;
    failures.push(`${route.label}: ${err?.message ?? err}`);
    const unusable = isRouteUnavailable(String(err?.message ?? ""));
    if (unusable) markRouteFailed(engineId, route, String(err?.message ?? ""));
    if (routes.length > 1) {
      opts.logger?.warn?.(
        `websearch-direct: ${def.label} \u5165\u53E3\u300C${route.label}\u300D\u5931\u8D25 \u2014 ${redactSensitive(err?.message ?? "")}\uFF1B\u6362\u4E0B\u4E00\u6761\u5165\u53E3` + (unusable ? "" : "\uFF08\u8BE5\u5165\u53E3\u672C\u8EAB\u53EF\u7528\uFF0C\u4E0D\u8BA1\u5165\u964D\u7EA7\uFF09")
      );
    }
  }
  throw new Error(
    routes.length === 1 ? failures[0] : `${routes.length} \u6761\u5165\u53E3\u5168\u90E8\u5931\u8D25 \u2192 ${failures.join(" | ")}`
  );
}

// src/registry.js
var ENGINES = {};
for (const [id, def] of Object.entries(ENGINES_META)) {
  if (def.group === "composite") continue;
  ENGINES[id] = (query, opts) => runEngine(id, query, opts);
}
function membersOf(kind, cfg) {
  const key = kind === "repo" ? "repoEngines" : "pkgEngines";
  const fallback = kind === "repo" ? REPO_ENGINES : PKG_ENGINES;
  const list = Array.isArray(cfg?.[key]) && cfg[key].length ? cfg[key] : fallback;
  const catId = kind === "repo" ? "code" : "pkg";
  const customs = kind === "repo" || kind === "pkg" ? customEngineIdsFor(catId) : [];
  return [.../* @__PURE__ */ new Set([...list.map(baseEngineId), ...customs])].filter((e) => ENGINES[e]);
}
function engineReady(id, cfg) {
  const base = baseEngineId(id);
  if (base === "gitee") return !!(cfg?.giteeToken || process.env.GITEE_TOKEN);
  if (base === "repo" || base === "pkg") return membersOf(base, cfg).some((e) => engineReady(e, cfg));
  return !!ENGINES[base];
}
function canonUrl(u) {
  try {
    const x = new URL(String(u));
    return `${x.hostname.replace(/^www\./i, "").toLowerCase()}${x.pathname.replace(/\/+$/, "")}`;
  } catch {
    return String(u || "").replace(/[#?].*$/, "").replace(/\/+$/, "");
  }
}
var COMPOSITE_CONCURRENCY = 3;
function compositeSearch(kind, label) {
  return async function searchComposite(query, opts) {
    const cfg = opts._cfg || {};
    const ready = membersOf(kind, cfg).filter((id) => engineReady(id, cfg));
    if (!ready.length) throw new Error(`${label}\uFF1A\u6CA1\u6709\u53EF\u7528\u7684\u5B50\u5F15\u64CE`);
    const want = clampInt(opts.maxResults, 1, 30, DEFAULTS.maxResults);
    const perEngine = clampInt(Math.ceil(want / ready.length) + 2, 3, 30, 5);
    const memberMs = clampInt(
      Math.min(opts.timeoutMs || DEFAULTS.timeoutMs, DEFAULTS.compositeMemberMs),
      3e3,
      6e4,
      DEFAULTS.compositeMemberMs
    );
    const concurrency = Math.min(COMPOSITE_CONCURRENCY, ready.length);
    const labelOf = (id) => ENGINES_META[id]?.label || id;
    const groups = [];
    const failures = [];
    const routes = {};
    const seen = /* @__PURE__ */ new Set();
    const merged = [];
    const depth = /* @__PURE__ */ new Map();
    let index = 0;
    let active = 0;
    let finished = false;
    let timer;
    function pull() {
      if (merged.length >= want) return;
      const ordered = groups.slice().sort((a, b) => ready.indexOf(a.id) - ready.indexOf(b.id));
      let progressed = true;
      while (progressed && merged.length < want) {
        progressed = false;
        for (const g of ordered) {
          if (merged.length >= want) break;
          const d = depth.get(g.id) || 0;
          if (d >= g.items.length) continue;
          depth.set(g.id, d + 1);
          const it = g.items[d];
          const key = canonUrl(it.url);
          if (key && seen.has(key)) {
            progressed = true;
            continue;
          }
          if (key) seen.add(key);
          merged.push({ ...it, url: it.url, title: `[${labelOf(g.id)}] ${it.title}`, engine: g.id });
          progressed = true;
        }
      }
    }
    await new Promise((resolve) => {
      const finish = (how) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve(how);
      };
      const onMemberDone = (id, rec) => {
        if (finished) return;
        active--;
        if (rec.error) {
          failures.push(`${id}: ${rec.error}`);
        } else {
          routes[id] = rec.via;
          if (rec.items.length) {
            groups.push({ id, items: rec.items, via: rec.via });
            pull();
          }
        }
        pump();
      };
      const pump = () => {
        if (finished) return;
        while (active < concurrency && index < ready.length && merged.length < want) {
          const id = ready[index++];
          active++;
          const meta = ENGINES_META[id] || {};
          const timeoutMs = Math.round(memberMs * (meta.slow ? 1.8 : 1));
          ENGINES[id](query, { ...opts, maxResults: perEngine, timeoutMs }).then((r) => {
            const items = (r.items || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0));
            onMemberDone(id, { items, via: r.via });
          }).catch((e) => onMemberDone(id, { error: e?.message ?? String(e) }));
        }
        if (merged.length >= want) return finish("enough");
        if (active === 0 && index >= ready.length) return finish("done");
      };
      timer = setTimeout(() => finish("budget"), memberMs);
      pump();
    });
    if (!merged.length) {
      throw new Error(
        `${label}\uFF1A\u6240\u6709\u6E90\u5747\u65E0\u7ED3\u679C${failures.length ? `\uFF08${failures.join(" | ")}\uFF09` : ""}`
      );
    }
    return { items: merged, usedEngines: groups.map((g) => g.id), routes, failures };
  };
}
var COMPOSITES = {
  repo: compositeSearch("repo", "\u4EE3\u7801\u4ED3\u5E93\u591A\u6E90\u5408\u5E76"),
  pkg: compositeSearch("pkg", "\u5305\u4ED3\u5E93\u591A\u6E90\u5408\u5E76")
};
function normaliseResult(id, result) {
  if (Array.isArray(result)) return { items: result, usedEngines: [id], routes: {}, failures: [] };
  return {
    items: result.items || [],
    usedEngines: result.usedEngines || [id],
    routes: result.routes || (result.via ? { [id]: result.via } : {}),
    failures: result.failures || []
  };
}

// src/pick-order.js
function pickOrder(query, explicit, cfg) {
  const known = (e) => !!(ENGINES[e] || COMPOSITES[e] || ENGINE_ALIASES[e]);
  const configured = (Array.isArray(cfg.engineOrder) ? cfg.engineOrder : []).map(baseEngineId).filter((e) => ENGINES[e] || COMPOSITES[e]);
  const fallback = configured.length ? configured : DEFAULTS.engineOrder.slice();
  if (explicit && known(explicit)) return [explicit];
  return fallback;
}
function renderSources(sources) {
  return sources.map((s, i) => `[${i + 1}] ${s.title}
${s.url}${s.snippet ? `
${s.snippet}` : ""}`).join("\n\n");
}

// src/gh-mirrors.js
import { lookup } from "node:dns/promises";
var GH_MIRRORS = ["https://ghproxy.net/", "https://ghfast.top/", "https://gh-proxy.com/"];
var GH_MIRRORABLE = /^https?:\/\/(raw\.githubusercontent\.com|github\.com|objects\.githubusercontent\.com|codeload\.github\.com|gist\.githubusercontent\.com|gist\.github\.com)\//i;
var PRIVATE_IP_RE = /^(?:10\.|127\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.|0\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|fe80:|fc00:|fd00:)/i;
function isPrivateIp(ip) {
  return PRIVATE_IP_RE.test(String(ip).replace(/^\[|\]$/g, "").toLowerCase());
}
async function assertPublicFetchUrl(rawUrl) {
  let u;
  try {
    u = new URL(String(rawUrl));
  } catch {
    throw new Error(`\u975E\u6CD5 URL\uFF08SSRF \u9632\u62A4\uFF09\uFF1A${rawUrl}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`\u4EC5\u5141\u8BB8 http(s)\uFF08SSRF \u9632\u62A4\uFF09\uFF1A${rawUrl}`);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|metadata|metadata\.google\.internal)$/i.test(host) || /(^|\.)(169\.254\.169\.254)$/.test(host)) {
    throw new Error(`\u5DF2\u963B\u6B62\u6293\u53D6\u5185\u7F51/\u4E91\u5143\u6570\u636E\u5730\u5740\uFF08SSRF \u9632\u62A4\uFF09\uFF1A${host}`);
  }
  let addrs = [];
  try {
    addrs = await lookup(host, { all: true, verbatim: true });
  } catch {
  }
  const v4 = addrs.filter((a) => a.family === 4).map((a) => a.address);
  if (!addrs.length) throw new Error(`\u65E0\u6CD5\u89E3\u6790\u6216\u89E3\u6790\u4E3A\u7A7A\u5730\u5740\uFF08SSRF \u9632\u62A4\uFF09\uFF1A${host}`);
  if (v4.some((ip) => isPrivateIp(ip))) throw new Error(`\u5DF2\u963B\u6B62\u6293\u53D6\u5185\u7F51/\u94FE\u8DEF\u672C\u5730\u5730\u5740\uFF08SSRF \u9632\u62A4\uFF09\uFF1A${host}`);
  return rawUrl;
}
async function fetchWithMirrors(url, opts) {
  await assertPublicFetchUrl(url);
  try {
    return { text: await request(url, opts), via: null };
  } catch (err) {
    if (isOff(opts.enableGithubMirrors) || !GH_MIRRORABLE.test(url)) throw err;
    const errors = [err.message];
    for (const mirror of GH_MIRRORS) {
      try {
        const text = await request(mirror + url, opts);
        return { text, via: mirror.replace(/\/+$/, "") };
      } catch (e) {
        errors.push(`${mirror} \u2192 ${e.message}`);
      }
    }
    throw new Error(`\u76F4\u8FDE\u5931\u8D25\uFF08${err.message}\uFF09\uFF0C\u4E14 ${GH_MIRRORS.length} \u4E2A GitHub \u52A0\u901F\u955C\u50CF\u5747\u5931\u8D25\uFF1A${errors.slice(1).join(" | ")}`);
  }
}

// src/tools-desc.js
function routeLine(id) {
  const rs = ENGINES_META[id]?.routes || [];
  if (rs.length <= 1) return "";
  const marks = { 0: "\u76F4\u8FDE", 1: "\u52A0\u901F", 2: "\u7D22\u5F15" };
  return ` \u3000 \u5165\u53E3\uFF08\u81EA\u52A8\u56DE\u9000\uFF09: ${rs.map((r) => `${r.label}[${marks[r.tier] || r.tier}]`).join(" \u2192 ")}`;
}
function toolDescription(cfg) {
  const line = (id) => {
    const m = ENGINES_META[id];
    const hasDirect = (m.routes || []).some((r) => r.tier === 0);
    const reach = m.direct === false ? "\u76F4\u8FDE\u4E0D\u53EF\u8FBE\uFF0C\u8D70\u955C\u50CF" : hasDirect ? "\u76F4\u8FDE\u53EF\u7528" : "\u4EC5\u955C\u50CF\u5165\u53E3";
    const token = m.token && !engineReady(id, cfg) ? "\uFF0C\u5F53\u524D\u672A\u914D\u7F6E\u4EE4\u724C\u2192\u81EA\u52A8\u8DF3\u8FC7" : "";
    const rl = routeLine(id);
    return `  - ${id}\uFF08${m.label}\uFF0C${reach}${token}\uFF09: ${m.what}\u3002\u9002\u5408\uFF1A${m.useWhen}${rl ? `
${rl}` : ""}`;
  };
  return [
    "\u7F51\u9875/\u4EE3\u7801/\u4F9D\u8D56\u5305\u641C\u7D22\uFF0C\u53EF\u663E\u5F0F\u6307\u5B9A\u641C\u7D22\u5F15\u64CE\u3002\u5F53\u4EFB\u52A1\u660E\u663E\u5339\u914D\u67D0\u4E2A\u5F15\u64CE\u65F6\u4F18\u5148\u7528\u672C\u5DE5\u5177\uFF0C\u800C\u4E0D\u662F\u901A\u7528\u641C\u7D22\u3002",
    "\u4EE3\u7801\u4ED3\u5E93\u7C7B\uFF08\u7701\u7565 engine \u65F6\u81EA\u52A8\u8D70 repo \u591A\u6E90\u5408\u5E76\uFF09\uFF1A",
    ...REPO_ENGINES.map(line),
    `  - repo\uFF08\u591A\u6E90\u5408\u5E76\uFF0C\u63A8\u8350\uFF09: \u5E76\u884C\u67E5\u8BE2 ${membersOf("repo", cfg).join(" + ")}\uFF0C\u6309\u6765\u6E90\u8F6E\u8F6C\u5408\u5E76\uFF0C\u907F\u514D\u53EA\u770B GitHub`,
    "\u4F9D\u8D56\u5305\u7C7B\uFF08\u7701\u7565 engine \u65F6\u81EA\u52A8\u8D70 pkg \u591A\u6E90\u5408\u5E76\uFF09\uFF1A",
    ...PKG_ENGINES.map(line),
    `  - pkg\uFF08\u591A\u6E90\u5408\u5E76\uFF0C\u63A8\u8350\uFF09: \u5E76\u884C\u67E5\u8BE2 ${membersOf("pkg", cfg).join(" + ")}`,
    "\u901A\u7528\u7F51\u9875\uFF1A",
    ...WEB_ENGINES.map(line),
    "\u8BF7\u6C42\u7684\u662F\u300C\u6E90\u300D\uFF0C\u4E0D\u662F\u300C\u5165\u53E3\u300D\uFF1A\u540C\u4E00\u4E2A\u6E90\u7684\u76F4\u8FDE / \u955C\u50CF / \u52A0\u901F\u4EE3\u7406\u7531\u63D2\u4EF6\u5185\u90E8\u6309\u987A\u5E8F\u56DE\u9000\uFF0C",
    "\u4F60\u4E0D\u9700\u8981\u4E5F\u4E0D\u5E94\u8BE5\u628A\u955C\u50CF\u5F53\u6210\u72EC\u7ACB\u7684\u641C\u7D22\u5F15\u64CE\u3002\u60F3\u5F3A\u5236\u8D70\u67D0\u6761\u5165\u53E3\u65F6\u624D\u7528\u8FD9\u4E9B\u522B\u540D\uFF1A",
    `  ${Object.entries(ENGINE_ALIASES).map(([a, v]) => `${a}\u2192${v.engine}(${v.route})`).join("\uFF5C")}`,
    "\u7701\u7565 engine \u65F6\u6309 engineOrder\uFF08\u9ED8\u8BA4 Bing \u2192 \u767E\u5EA6 \u2192 DuckDuckGo\uFF09\u987A\u5E8F\u5C1D\u8BD5\u3002\u63A8\u8350\uFF1A\u6839\u636E\u4EFB\u52A1\u7528 engine \u663E\u5F0F\u6307\u5B9A\u6765\u6E90\uFF08\u4EE3\u7801\u2192repo\u3001\u4F9D\u8D56\u5305\u2192pkg\u3001\u6A21\u578B\u2192huggingface\u3001\u4E2D\u6587\u7F51\u9875\u2192baidu\u3001\u5355\u4E00\u6258\u7BA1\u7AD9\u2192github/gitlab\u2026\uFF09\uFF0C\u5E76\u7528 maxResults \u7B49\u53C2\u6570\u63A7\u5236\u8FD4\u56DE\u91CF\u3002",
    "engine \u4F20 auto \u7B49\u540C\u4E8E\u7701\u7565\u3002\u82E5\u67D0\u4E2A\u5F15\u64CE\u5931\u8D25\uFF08\u9650\u6D41\u3001\u53CD\u722C\u3001\u65E0\u4EE4\u724C\uFF09\uFF0C\u4F1A\u81EA\u52A8\u964D\u7EA7\u5230\u4E0B\u4E00\u4E2A\u3002",
    "\u8FD4\u56DE\u503C\u91CC\u7684 routes \u5B57\u6BB5\u8BB0\u5F55\u4E86\u6BCF\u4E2A\u6E90\u5B9E\u9645\u7528\u4E86\u54EA\u6761\u5165\u53E3 \u2014\u2014 \u7ED3\u679C\u5F02\u5E38\u65F6\u5148\u770B\u5B83\uFF0C\u518D\u6000\u7591\u5185\u5BB9\u3002"
  ].join("\n");
}
function enginePrompt(cfg) {
  const usable = (id) => engineReady(id, cfg) && ENGINES_META[id].group !== "composite";
  const list = ENGINE_IDS.filter(usable).map((id) => {
    const m = ENGINES_META[id];
    const n = (m.routes || []).length;
    return `${id}=${m.label}\uFF08${m.what}${n > 1 ? `\uFF1B${n} \u6761\u5165\u53E3\u81EA\u52A8\u56DE\u9000` : ""}\uFF09`;
  }).join("\uFF1B");
  return [
    `\u53EF\u7528\u641C\u7D22\u5F15\u64CE\uFF1A${list}\u3002`,
    "\u6BCF\u4E2A\u5F15\u64CE\u80CC\u540E\u53EF\u80FD\u6709\u591A\u4E2A\u5165\u53E3\uFF08\u76F4\u8FDE / \u955C\u50CF / \u52A0\u901F\u4EE3\u7406\uFF09\uFF0C\u63D2\u4EF6\u81EA\u5DF1\u4F1A\u6309\u987A\u5E8F\u56DE\u9000\uFF0C\u4F60\u4E0D\u9700\u8981\u5173\u5FC3\u8D70\u7684\u662F\u54EA\u6761\u8DEF\u3002",
    "\u5F53\u4EFB\u52A1\u660E\u663E\u5339\u914D\u67D0\u4E2A\u5F15\u64CE\u65F6\uFF0C\u7528 web_search_engine \u5E76\u663E\u5F0F\u6307\u5B9A engine\uFF0C\u800C\u4E0D\u662F\u7B3C\u7EDF\u5730\u7528 web_search\uFF1A",
    '\xB7 \u627E\u5F00\u6E90\u9879\u76EE / \u5E93 / \u6846\u67B6 / SDK / CLI / \u63D2\u4EF6\u6E90\u7801\u3001\u5BF9\u6BD4\u540C\u7C7B\u5B9E\u73B0 \u2192 engine="repo"\uFF08\u9ED8\u8BA4\u591A\u6E90\u5408\u5E76\uFF1AGitHub + GitLab + Codeberg + Gitea\uFF0C\u914D\u4E86 Gitee \u4EE4\u724C\u8FD8\u4F1A\u5E26\u4E0A\u7801\u4E91\uFF09\uFF0C\u4E0D\u8981\u53EA\u6307\u5B9A github\uFF0C\u5426\u5219\u4F1A\u6F0F\u6389\u5176\u4ED6\u6258\u7BA1\u7AD9\u7684\u9879\u76EE',
    '\xB7 \u627E\u4F9D\u8D56\u5305 / \u5E93\u7684\u7248\u672C\u4E0E\u4E0B\u8F7D\u91CF\uFF08npm / Rust / PHP / .NET / Ruby / Java / HuggingFace \u6A21\u578B\uFF09 \u2192 engine="pkg"',
    '\xB7 \u627E\u6A21\u578B / \u6570\u636E\u96C6 \u2192 engine="huggingface"\uFF1B\u53EA\u770B\u67D0\u4E00\u4E2A\u6E90 \u2192 engine="gitlab"\u3001"engine="codeberg" \u7B49',
    '\xB7 \u7EAF\u4E2D\u6587\u5185\u5BB9\u3001\u56FD\u5185\u7AD9\u70B9\u3001\u767E\u79D1\u3001\u95EE\u7B54\u3001\u8BBA\u575B\u5E16 \u2192 engine="baidu"',
    "\xB7 \u6280\u672F\u6587\u6863 / \u6559\u7A0B / \u65B0\u95FB / \u4EA7\u54C1\u5B98\u7F51 / \u62A5\u9519\u4FE1\u606F\uFF08\u4E2D\u82F1\u6587\u901A\u7528\uFF09 \u2192 \u7701\u7565 engine\uFF0C\u9ED8\u8BA4\u8D70 Bing \u4E2D\u56FD\uFF08\u4E0E Edge \u9ED8\u8BA4\u641C\u7D22\u5F15\u64CE\u4E00\u81F4\uFF09",
    "\u7701\u7565 engine \u65F6\u6309 engineOrder \u987A\u5E8F\u5C1D\u8BD5\uFF08\u9ED8\u8BA4 Bing \u2192 \u767E\u5EA6\uFF09\u3002\u4EFB\u52A1\u660E\u663E\u5339\u914D\u67D0\u5F15\u64CE\u65F6\u52A1\u5FC5\u663E\u5F0F\u4F20 engine\uFF0C\u5E76\u7ED9\u5408\u9002\u53C2\u6570\uFF0C\u800C\u4E0D\u662F\u7B3C\u7EDF\u7528\u901A\u7528\u641C\u7D22\u515C\u5E95\u3002",
    "\u56DE\u7B54\u65F6\u8BF4\u660E\u7ED3\u679C\u6765\u81EA\u54EA\u4E2A\u641C\u7D22\u5F15\u64CE\u53CA\u5176\u5C40\u9650\uFF08\u4F8B\u5982\u4ED3\u5E93\u7C7B\u641C\u7D22\u53EA\u8986\u76D6\u5404\u6258\u7BA1\u7AD9\u7684\u516C\u5F00\u9879\u76EE\uFF0C\u4E0D\u4EE3\u8868\u5168\u7F51\uFF1B\u955C\u50CF\u5165\u53E3\u7684\u6570\u636E\u53EF\u80FD\u6BD4\u5B98\u65B9\u6E90\u6EDE\u540E\uFF09\u3002"
  ].join("\n");
}

// src/ui-settings.js
import { homedir } from "node:os";
import { join as join2, dirname } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
var UI_CATEGORY_DEFS = [
  { id: "code", label: "\u4EE3\u7801\u4ED3\u5E93", engines: ["github", "gitlab", "codeberg", "gitea", "gitee"], customKind: "gitea" },
  { id: "pkg", label: "\u5305\u7BA1\u7406", engines: ["npm", "crates", "packagist", "nuget", "rubygems"], customKind: "npm" },
  { id: "model", label: "\u6A21\u578B\u4ED3\u5E93", engines: ["huggingface"], customKind: "hf" },
  { id: "web", label: "\u7F51\u9875\u641C\u7D22", engines: ["bing", "baidu", "duckduckgo"], customKind: "bing" }
];
var UI_CUSTOM_MAX = 8;
var UI_MODEL_VERSION = 3;
var UI_DEFAULT = {
  version: UI_MODEL_VERSION,
  /** 空 = 免 Key 直连（默认）；填写 = 所有联网搜索使用此 Key。 */
  apiKey: "",
  /** 全局代理地址；空 = 不走全局代理。 */
  proxyUrl: "",
  /** 「引擎id|路由label」 -> { proxy?: true|false, url?: 覆盖地址 }；删除该键 = 恢复默认。 */
  routeOverrides: {},
  /** 引擎id -> [ { url } ]：给内置源追加的代理入口（url 可为空 = 待填写，运行时跳过）。 */
  routeExtras: {},
  /** 大类id -> [ { name, url, proxies: [ { url } ] } ]：自定义源 = 名称 + 官方直连 + 代理列表。 */
  custom: { code: [], pkg: [], model: [], web: [] }
};
function uiStateFile() {
  const home = (process.env.DSH_HOME || "").trim() || join2(homedir(), ".dsh");
  return join2(home, "storages", "websearch-direct", "ui-config.json");
}
function asUrl(v) {
  const s = String(v ?? "").trim();
  return /^https?:\/\//i.test(s) ? s : "";
}
function normaliseUiState(raw) {
  const s = { ...structuredClone(UI_DEFAULT), ...raw && typeof raw === "object" ? raw : {} };
  s.apiKey = typeof s.apiKey === "string" ? s.apiKey : "";
  s.proxyUrl = typeof s.proxyUrl === "string" ? s.proxyUrl : "";
  const overrides = {};
  if (s.routeOverrides && typeof s.routeOverrides === "object") {
    for (const [k, v] of Object.entries(s.routeOverrides)) {
      if (typeof k !== "string" || !k.includes("|") || !v || typeof v !== "object") continue;
      const o = {};
      if (v.proxy === true || v.proxy === false) o.proxy = v.proxy;
      const u = asUrl(v.url);
      if (u) o.url = u;
      if (v.enabled === false) o.enabled = false;
      if (Object.keys(o).length) overrides[k] = o;
    }
  }
  s.routeOverrides = overrides;
  const extras = {};
  if (s.routeExtras && typeof s.routeExtras === "object") {
    for (const [engId, list] of Object.entries(s.routeExtras)) {
      if (typeof engId !== "string" || engId.startsWith("custom-") || !Array.isArray(list)) continue;
      const items = list.map((x) => ({ url: asUrl(x?.url), enabled: x && typeof x === "object" && x.enabled === false })).filter((x) => x.url).slice(0, UI_CUSTOM_MAX).map((x) => ({ url: x.url, ...x.enabled ? { enabled: false } : {} }));
      if (items.length) extras[engId] = items;
    }
  }
  s.routeExtras = extras;
  const custom = {};
  for (const cat of UI_CATEGORY_DEFS) {
    const list = Array.isArray(s.custom?.[cat.id]) ? s.custom[cat.id] : [];
    custom[cat.id] = list.slice(0, UI_CUSTOM_MAX).map((x) => ({
      // v1 遗留 { label, url, proxy } → { name, url, proxies: [] }
      name: String(x.name ?? x.label ?? "").trim().slice(0, 40),
      url: asUrl(x.url),
      proxies: Array.isArray(x.proxies) ? x.proxies.map((p) => ({
        url: asUrl(p?.url ?? p),
        // v3：启停状态存在条目本身（缺省 = 启用）；v1/v2 遗留条目无此字段。
        ...p && typeof p === "object" && p.enabled === false ? { enabled: false } : {}
      })).filter((p) => p.url).slice(0, UI_CUSTOM_MAX) : []
    })).filter((x) => x.url);
  }
  s.custom = custom;
  s.version = UI_MODEL_VERSION;
  return s;
}
function loadUiState() {
  try {
    return normaliseUiState(JSON.parse(readFileSync(uiStateFile(), "utf8")));
  } catch {
    return structuredClone(UI_DEFAULT);
  }
}
function saveUiState(state) {
  const file = uiStateFile();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
}
function syncUiRoutes(state) {
  for (const [engId, def] of Object.entries(ENGINES_META)) {
    if (engId.startsWith("custom-")) continue;
    const pristine = BUILTIN_ROUTES[engId];
    if (!pristine) continue;
    const extras = (state.routeExtras[engId] || []).map((x, i) => ({
      label: `\u81EA\u5B9A\u4E49\u4EE3\u7406 ${i + 1}`,
      base: x.url,
      // 可为空 = 待填写；runEngine 会跳过空入口
      tier: 1,
      extra: true,
      // extraIndex = 在 routeExtras[engId] 数组里的位置。与自定义源代理的
      // proxyIndex 同理：启停状态按位置回查条目本身，不靠 label 字符串定位。
      extraIndex: i
    }));
    def.routes = pristine.concat(extras);
  }
}
function installCustomEngines(state) {
  for (const engId of Object.keys(ENGINES_META)) {
    if (engId.startsWith("custom-")) {
      delete ENGINES_META[engId];
      delete ENGINES[engId];
    }
  }
  syncUiRoutes(state);
  const kinds = { code: "gitea", pkg: "npm", model: "hf", web: "bing" };
  const groups = { code: "repo", pkg: "pkg", model: "pkg", web: "web" };
  for (const cat of UI_CATEGORY_DEFS) {
    (state.custom[cat.id] || []).forEach((src, i) => {
      if (!src.url) return;
      const engId = `custom-${cat.id}-${i + 1}`;
      const ref = ENGINES_META[kinds[cat.id] === "gitea" ? "gitea" : kinds[cat.id] === "npm" ? "npm" : kinds[cat.id] === "hf" ? "huggingface" : "bing"];
      if (!ref) return;
      const name2 = src.name || src.url.replace(/^https?:\/\//i, "");
      const routes = [{ label: "\u76F4\u8FDE", base: src.url, tier: 0 }];
      (src.proxies || []).forEach((p, j) => {
        routes.push({ label: `\u4EE3\u7406 ${j + 1}`, base: p.url, tier: 1, proxyIndex: j });
      });
      ENGINES_META[engId] = {
        ...ref,
        label: name2,
        group: groups[cat.id],
        routes
      };
      ENGINES[engId] = (query, opts) => runEngine(engId, query, opts);
    });
  }
}
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
          const isCustom = e.startsWith("custom-");
          return {
            id: e,
            label: def.label,
            custom: isCustom,
            routes: (def.routes || []).map((r) => {
              const key = `${e}|${r.label}`;
              const ov = state.routeOverrides[key] || {};
              const catId = isCustom ? e.slice("custom-".length, e.lastIndexOf("-")) : null;
              const idx = typeof r.proxyIndex === "number" ? r.proxyIndex : -1;
              const entry = idx >= 0 && catId ? (state.custom[catId] || [])[Number(e.slice(e.lastIndexOf("-") + 1)) - 1]?.proxies?.[idx] : null;
              const legacyEnabled = ov.enabled !== false;
              const extraEntry = r.extra && typeof r.extraIndex === "number" ? (state.routeExtras[e] || [])[r.extraIndex] : null;
              const entrySaysDisabled = !!entry && entry.enabled === false || !!extraEntry && extraEntry.enabled === false;
              const enabled = !(entrySaysDisabled || !legacyEnabled);
              return {
                key,
                tier: r.tier,
                ...typeof r.proxyIndex === "number" ? { proxyIndex: r.proxyIndex } : {},
                url: ov.url || r.base || "",
                defaultUrl: r.base || "",
                type: (ov.proxy !== void 0 ? ov.proxy : r.tier === 1) ? "proxy" : "direct",
                enabled,
                switchable: r.tier === 1,
                removable: !!r.extra || isCustom && r.tier !== 0,
                empty: !r.base && !ov.url
              };
            })
          };
        })
      };
    }),
    limits: { customMax: UI_CUSTOM_MAX }
  };
}

// src/plugin.js
function apply(ctx, config) {
  const logger = ctx.logger?.("websearch-direct") || console;
  let uiState = loadUiState();
  installCustomEngines(uiState);
  let resolved = () => ({ ...DEFAULTS, ...config });
  ctx.inject(["settings"], (sctx) => {
    if (!Config) return;
    try {
      const scope = sctx.settings.register(SETTINGS_NAMESPACE, Config, { base: config });
      resolved = () => ({ ...DEFAULTS, ...scope.get() });
      sctx.effect(() => () => {
        resolved = () => ({ ...DEFAULTS, ...config });
      });
    } catch {
    }
  });
  const opts = () => {
    const c = resolved();
    const globalProxy = (uiState.proxyUrl || "").trim() || (c.proxyUrl || "").trim() || process.env.HTTPS_PROXY || process.env.https_proxy || "";
    return {
      proxyUrl: globalProxy,
      timeoutMs: Number(c.timeoutMs) || DEFAULTS.timeoutMs,
      maxResults: Number(c.maxResults) || DEFAULTS.maxResults,
      githubToken: (uiState.apiKey || "").trim() || (c.githubToken || "").trim() || process.env.GITHUB_TOKEN || "",
      giteeToken: (c.giteeToken || "").trim() || process.env.GITEE_TOKEN || "",
      enableGithubMirrors: !isOff(c.enableGithubMirrors),
      routePolicy: c.routePolicy === "accel-first" || c.routePolicy === "direct-first" ? c.routePolicy : "auto",
      logger,
      _cfg: c,
      _ui: uiState,
      _globalProxyUrl: globalProxy
    };
  };
  async function runSearch(query, explicitEngine, maxResults, signal) {
    if (!query || !String(query).trim()) throw new Error("query is required");
    if (explicitEngine && !ENGINES[explicitEngine] && !COMPOSITES[explicitEngine] && !ENGINE_ALIASES[explicitEngine]) {
      logger?.warn?.(
        `websearch-direct: \u672A\u77E5\u5F15\u64CE "${explicitEngine}"\uFF0C\u5DF2\u5FFD\u7565\u8BE5\u63D0\u793A\u5E76\u6309 engineOrder \u987A\u5E8F\u515C\u5E95\u3002\u53EF\u7528\uFF1A${ALL_ENGINE_IDS.join(" / ")}`
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
      const engine = baseEngineId(wanted);
      const fn = ENGINES[engine] || COMPOSITES[engine];
      if (!fn) continue;
      if (!engineReady(wanted, cfg)) {
        skipped.push(wanted);
        errors.push(`${wanted}: \u672A\u914D\u7F6E\uFF08\u8DF3\u8FC7\uFF09`);
        continue;
      }
      attempted.push(wanted);
      const pin = pinnedRoute(wanted);
      if (pin && !(ENGINES_META[engine]?.routes || []).some((r) => r.label.includes(pin))) {
        logger?.warn?.(`websearch-direct: \u522B\u540D "${wanted}" \u6307\u5B9A\u7684\u5165\u53E3 "${pin}" \u5728 ${engine} \u4E0A\u4E0D\u5B58\u5728\uFF0C\u9000\u56DE\u8BE5\u5F15\u64CE\u5168\u90E8\u5165\u53E3\u3002`);
      }
      try {
        const raw = await fn(String(query), {
          ...c,
          maxResults: want,
          signal,
          _routePin: pin
        });
        const norm = normaliseResult(engine, raw);
        const sources = norm.items.slice(0, want);
        if (!sources.length) {
          errors.push(`${wanted}: \u65E0\u7ED3\u679C`);
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
          skipped
        };
      } catch (err) {
        errors.push(`${wanted}: ${err.message}`);
        logger?.warn?.(`websearch-direct: ${wanted} \u5931\u8D25 \u2014 ${err.message}\uFF1B\u5C1D\u8BD5\u4E0B\u4E00\u4E2A\u5F15\u64CE`);
      }
    }
    if (!attempted.length) {
      throw new Error(
        `\u6CA1\u6709\u53EF\u7528\u7684\u5F15\u64CE\u53EF\u5C1D\u8BD5\uFF08order=[${order.join(", ")}]\uFF0C\u8DF3\u8FC7=[${skipped.join(", ")}]\uFF09\u3002\u53EF\u7528\u5F15\u64CE\uFF1A${ALL_ENGINE_IDS.join(" / ")}\u3002${errors.join(" | ")}`
      );
    }
    throw new Error(`\u6240\u6709\u5F15\u64CE\u5747\u5931\u8D25\uFF08\u5DF2\u5C1D\u8BD5 ${attempted.join(" \u2192 ")}\uFF09\u3002${errors.join(" | ")}`);
  }
  ctx.effect(
    () => ctx.web?.registerSearchProvider({
      id: "websearch-direct",
      // No credentials to check: this provider is always ready, which is the
      // whole point — the agent never hits WEB_PROVIDER_CREDENTIAL_MISSING.
      available: () => true,
      async search(req, signal) {
        const r = await runSearch(req.query, req.engine, req.maxResults, signal);
        return { content: r.content, sources: r.sources, truncated: false };
      }
    })
  );
  ctx.effect(
    () => ctx.web?.registerFetchProvider({
      id: "websearch-direct",
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
            kind: "text",
            content: truncated ? text.slice(0, maxChars) : text,
            ...via ? { note: `GitHub \u76F4\u8FDE\u5931\u8D25\uFF0C\u7ECF\u52A0\u901F\u955C\u50CF ${via} \u6293\u53D6` } : {}
          },
          truncated
        };
      }
    })
  );
  if (defineTool) {
    ctx.inject(["tools"], (sctx) => {
      sctx.effect(() => {
        const dispose = sctx.tools.register(
          defineTool({
            name: "web_search_engine",
            description: toolDescription(resolved()),
            parameters: {
              query: {
                type: "string",
                required: true,
                description: '\u641C\u7D22\u5173\u952E\u8BCD\u3002\u4EE3\u7801\u7C7B\u67E5\u8BE2\u53EF\u76F4\u63A5\u5199\u9879\u76EE\u540D\u6216\u6280\u672F\u6808\uFF0C\u5982 "dsh plugin"\u3001"python http client"\u3002'
              },
              engine: {
                type: "string",
                description: `\u6307\u5B9A\u641C\u7D22\u6E90\uFF0C\u53EF\u9009 ${ALL_ENGINE_IDS.join(" / ")}\uFF1B\u63A8\u8350 repo\uFF08\u4EE3\u7801\u591A\u6E90\u5408\u5E76\uFF09/ pkg\uFF08\u4F9D\u8D56\u5305\u591A\u6E90\u5408\u5E76\uFF09\uFF1B\u4F20 auto \u6216\u7701\u7565\u5219\u6309 engineOrder \u987A\u5E8F\u5C1D\u8BD5\u3002\u522B\u540D\uFF08\u5982 npmmirror / hf-mirror\uFF09\u8868\u793A\u300C\u5F3A\u5236\u8D70\u8BE5\u6E90\u7684\u67D0\u4E00\u6761\u5165\u53E3\u300D\u3002`
              },
              maxResults: {
                type: "number",
                description: "\u8FD4\u56DE\u6761\u6570\uFF08\u9ED8\u8BA4 8\uFF0C\u6700\u5927 30\uFF09\u3002"
              }
            },
            output: {
              schema: { type: "object", additionalProperties: true },
              render: (_args, value) => {
                const used = value.routes && Object.keys(value.routes).length ? Object.entries(value.routes).map(([e, r]) => `${ENGINES_META[e]?.label || e}\u2192${r}`).join("\uFF0C") : "";
                const head = `\u5F15\u64CE: ${ENGINES_META[value.baseEngine]?.label || value.engine}` + (value.usedEngines?.length > 1 ? `\uFF08\u5408\u5E76\u6765\u6E90: ${value.usedEngines.map((e) => ENGINES_META[e]?.label || e).join(" + ")}\uFF09` : "") + (value.degraded ? `\uFF08\u9996\u9009\u4E0D\u53EF\u7528\uFF0C\u5DF2\u964D\u7EA7\uFF1B\u5C1D\u8BD5\u987A\u5E8F ${value.attempted.join(" \u2192 ")}\uFF09` : "") + (used ? `
\u5B9E\u9645\u5165\u53E3: ${used}` : "");
                return [{ type: "text", text: `${head}

${value.content}` }];
              }
            },
            execute: async (args) => {
              const engine = args.engine && args.engine !== "auto" ? args.engine : void 0;
              if (engine && !ENGINES[engine] && !COMPOSITES[engine] && !ENGINE_ALIASES[engine]) {
                throw new Error(
                  `\u672A\u77E5\u5F15\u64CE "${engine}"\u3002\u53EF\u7528\uFF1A${ALL_ENGINE_IDS.join(" / ")}\uFF0C\u6216\u7701\u7565\u6309 engineOrder \u987A\u5E8F\u5C1D\u8BD5\u3002`
                );
              }
              const r = await runSearch(args.query, engine, args.maxResults);
              return {
                query: args.query,
                engine: r.engine,
                baseEngine: r.baseEngine,
                usedEngines: r.usedEngines,
                routes: r.routes,
                attempted: r.attempted,
                degraded: r.attempted.length > 1,
                ...r.errors.length ? { notes: r.errors } : {},
                content: r.content,
                sources: r.sources
              };
            }
          })
        );
        return () => dispose();
      }, "websearch-direct: engine tool");
    });
    ctx.inject(["systemPrompt"], (pctx) => {
      pctx.effect(() => {
        try {
          return pctx.systemPrompt.section({
            name: "tool:web_search_engine",
            order: 2005,
            text: () => enginePrompt(resolved())
          });
        } catch {
          return () => {
          };
        }
      }, "websearch-direct: engine prompt");
    });
  } else {
    logger?.info?.("websearch-direct: @deepseek-ai/dsh-tools \u4E0D\u53EF\u7528\uFF0C\u8DF3\u8FC7 web_search_engine \u5DE5\u5177\u6CE8\u518C");
  }
  ctx.inject(["webServer"], (wctx) => {
    wctx.effect(() => {
      const json = (res, code, obj) => {
        res.writeHead(code, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store"
        });
        res.end(JSON.stringify(obj));
      };
      const readBody = (req) => new Promise((resolveBody, rejectBody) => {
        let data = "";
        req.on("data", (c) => {
          data += c;
          if (data.length > 1e6) req.destroy();
        });
        req.on("end", () => {
          try {
            resolveBody(data ? JSON.parse(data) : {});
          } catch (err) {
            rejectBody(new Error(`\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5 JSON\uFF1A${err.message}`));
          }
        });
        req.on("error", rejectBody);
      });
      const applyUiUpdate = (body) => {
        if (body.apiKey !== void 0 && typeof body.apiKey === "string") {
          uiState.apiKey = body.apiKey.trim();
        }
        if (body.clearApiKey === true) uiState.apiKey = "";
        if (body.proxyUrl !== void 0 && typeof body.proxyUrl === "string") {
          uiState.proxyUrl = body.proxyUrl.trim();
        }
        if (body.routeOverrides && typeof body.routeOverrides === "object") {
          for (const [k, v] of Object.entries(body.routeOverrides)) {
            if (typeof k !== "string" || !k.includes("|")) continue;
            if (v === null || v === void 0) {
              delete uiState.routeOverrides[k];
              continue;
            }
            const o = {};
            if (v && typeof v === "object") {
              if (v.proxy === true || v.proxy === false) o.proxy = v.proxy;
              const u = asUrl(v.url);
              if (u) o.url = u;
              if (v.enabled === false) o.enabled = false;
            }
            if (Object.keys(o).length) uiState.routeOverrides[k] = o;
            else delete uiState.routeOverrides[k];
          }
        }
        if (body.routeExtras && typeof body.routeExtras === "object") {
          for (const [engId, list] of Object.entries(body.routeExtras)) {
            if (typeof engId !== "string" || engId.startsWith("custom-") || !Array.isArray(list)) continue;
            uiState.routeExtras[engId] = list.map((x) => ({ url: asUrl(x?.url), enabled: x && typeof x === "object" && x.enabled === false })).filter((x) => x.url).slice(0, UI_CUSTOM_MAX).map((x) => ({ url: x.url, ...x.enabled ? { enabled: false } : {} }));
          }
        }
        if (body.custom && typeof body.custom === "object") {
          for (const cat of UI_CATEGORY_DEFS) {
            const list = body.custom[cat.id];
            if (!Array.isArray(list)) continue;
            uiState.custom[cat.id] = list.slice(0, UI_CUSTOM_MAX).map((x) => ({
              name: String(x?.name ?? "").trim().slice(0, 40),
              url: asUrl(x?.url),
              proxies: Array.isArray(x?.proxies) ? x.proxies.map((p) => ({
                url: asUrl(p?.url ?? p),
                ...p && typeof p === "object" && p.enabled === false ? { enabled: false } : {}
              })).filter((p) => p.url).slice(0, UI_CUSTOM_MAX) : []
            })).filter((x) => x.url);
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
        }
        installCustomEngines(uiState);
      };
      const d1 = wctx.webServer.register({
        kind: "exact",
        path: "/dsh-websearch-direct/api/config",
        handler: async (req, res) => {
          try {
            if (req.method === "GET") return json(res, 200, uiSnapshot(uiState));
            if (req.method === "POST") {
              const body = await readBody(req);
              applyUiUpdate(body);
              return json(res, 200, { ok: true, ...uiSnapshot(uiState) });
            }
            return json(res, 405, { error: "method not allowed" });
          } catch (err) {
            return json(res, 400, { error: err.message });
          }
        }
      });
      const d2 = wctx.webServer.register({
        kind: "exact",
        path: "/dsh-websearch-direct/api/reset",
        handler: async (req, res) => {
          try {
            if (req.method !== "POST") return json(res, 405, { error: "method not allowed" });
            resetUi();
            return json(res, 200, { ok: true, ...uiSnapshot(uiState) });
          } catch (err) {
            return json(res, 400, { error: err.message });
          }
        }
      });
      return () => {
        d1();
        d2();
      };
    }, "websearch-direct: settings card routes");
  });
}
export {
  Config,
  SETTINGS_NAMESPACE,
  apply,
  inject,
  name
};
