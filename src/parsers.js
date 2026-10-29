// SPDX-License-Identifier: GPL-3.0-or-later
// 网页结果解析器（parsers）：Bing / Baidu / DuckDuckGo HTML
//
// This file is part of dsh-websearch-local
// Copyright (C) 2026 MYCF711 (original author)
// Copyright (C) 2026 Local modifications

import { decodeEntities, stripTags } from './utils.js';
/* ------------------------------------------------------- web/html 解析器 */

/**
 * 这三个只负责「把 HTML 变成结果」，URL 拼接交给路由表。
 * 拆开是因为同一个搜索引擎可能有多个入口（cn.bing.com / www.bing.com、
 * html.duckduckgo.com / lite.duckduckgo.com），解析逻辑却是同一套。
 */

/** Bing 结果页：每条是 <li class="b_algo"> 块。 */
function parseBing(html, opts) {
  const out = [];
  for (const block of html.split(/<li class="b_algo"/).slice(1)) {
    const m = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!m) continue;
    const url = decodeEntities(m[1]);
    if (!/^https?:\/\//i.test(url)) continue;
    const p = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    out.push({ url, title: stripTags(m[2]), snippet: p ? stripTags(p[1]) : '' });
    if (out.length >= opts.maxResults) break;
  }
  return out;
}

/** 百度结果页：标题在 <h3 class="t"> 里，摘要散落在正文，靠 URL 位置回捞。 */
function parseBaidu(html, opts) {
  if (/百度安全验证|verify\.baidu|wappass\.baidu/i.test(html)) {
    throw new Error('百度返回了反爬验证页，该入口本轮不可用');
  }
  const out = [];
  const re = /<h3[^>]*class="[^"]*t[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null && out.length < opts.maxResults) {
    const raw = decodeEntities(m[1]);
    if (!/^https?:\/\//i.test(raw)) continue;
    out.push({ url: raw, title: stripTags(m[2]), snippet: '' });
  }
  for (const item of out) {
    const idx = html.indexOf(item.url);
    if (idx === -1) continue;
    const tail = html.slice(idx, idx + 3000);
    const s = tail.match(/<span[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    if (s) item.snippet = stripTags(s[1]);
  }
  return out;
}

/**
 * DuckDuckGo 两个入口的标记不同：
 *   html.duckduckgo.com → a.result__a / a.result__snippet
 *   lite.duckduckgo.com → a.result-link
 * 用一套宽松解析同时覆盖，链接都要解 uddg= 跳转参数。
 */
function parseDdg(html, opts) {
  const out = [];
  const re =
    /<a[^>]+class="(?:result__a|result-link)"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<a[^>]+class="(?:result__a|result-link)"|$)/gi;
  let m;
  while ((m = re.exec(html)) !== null && out.length < opts.maxResults) {
    let url = decodeEntities(m[1]);
    const uddg = url.match(/uddg=([^&]+)/);
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (!/^https?:\/\//i.test(url)) continue;
    const snip = m[3].match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
    out.push({ url, title: stripTags(m[2] || ''), snippet: snip ? stripTags(snip[1]) : '' });
  }
  return out;
}

export {
parseBing,
parseBaidu,
parseDdg
};
