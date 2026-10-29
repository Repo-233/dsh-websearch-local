// SPDX-License-Identifier: GPL-3.0-or-later
// GitHub 加速镜像（gh-mirrors）：fetchWithMirrors
//
// This file is part of dsh-websearch-local
// Copyright (C) 2026 MYCF711 (original author)
// Copyright (C) 2026 Local modifications

import { lookup } from 'node:dns/promises';
import { request } from './net.js';
import { isOff } from './utils.js';
/* ------------------------------------------------------------ GitHub 镜像 */

const GH_MIRRORS = ['https://ghproxy.net/', 'https://ghfast.top/', 'https://gh-proxy.com/'];
const GH_MIRRORABLE =
  /^https?:\/\/(raw\.githubusercontent\.com|github\.com|objects\.githubusercontent\.com|codeload\.github\.com|gist\.githubusercontent\.com|gist\.github\.com)\//i;

/** SSRF 防护：仅放行公网 http(s)。拒绝非 http(s)、回环/私网/链路本地/云元数据地址。 */
const PRIVATE_IP_RE = /^(?:10\.|127\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.|0\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|fe80:|fc00:|fd00:)/i;
function isPrivateIp(ip) {
  return PRIVATE_IP_RE.test(String(ip).replace(/^\[|\]$/g, '').toLowerCase());
}
async function assertPublicFetchUrl(rawUrl) {
  let u;
  try { u = new URL(String(rawUrl)); } catch { throw new Error(`非法 URL（SSRF 防护）：${rawUrl}`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(`仅允许 http(s)（SSRF 防护）：${rawUrl}`);
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|metadata|metadata\.google\.internal)$/i.test(host) || /(^|\.)(169\.254\.169\.254)$/.test(host)) {
    throw new Error(`已阻止抓取内网/云元数据地址（SSRF 防护）：${host}`);
  }
  let addrs = [];
  try { addrs = await lookup(host, { all: true, verbatim: true }); } catch { /* fail-closed 下面统一拒绝 */ }
  const v4 = addrs.filter((a) => a.family === 4).map((a) => a.address);
  if (!addrs.length) throw new Error(`无法解析或解析为空地址（SSRF 防护）：${host}`);
  if (v4.some((ip) => isPrivateIp(ip))) throw new Error(`已阻止抓取内网/链路本地地址（SSRF 防护）：${host}`);
  return rawUrl;
}

/**
 * Fetch a URL, falling back to a GitHub acceleration mirror when the direct
 * connection cannot reach it. Mainland networks frequently cannot open
 * raw.githubusercontent.com even though api.github.com works, so a mirror is
 * often the difference between "the agent can read the file" and not.
 *
 * v0.5：入口先做 SSRF 防护（仅公网 http(s)/host 非私网段），不把内网地址交给 fetch。
 */
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
        return { text, via: mirror.replace(/\/+$/, '') };
      } catch (e) {
        errors.push(`${mirror} → ${e.message}`);
      }
    }
    throw new Error(`直连失败（${err.message}），且 ${GH_MIRRORS.length} 个 GitHub 加速镜像均失败：${errors.slice(1).join(' | ')}`);
  }
}

export {
fetchWithMirrors,
GH_MIRRORS
};
