// SPDX-License-Identifier: GPL-3.0-or-later
// 纯工具（utils）：HTML 清洗 / 布尔与数值解析
//
// This file is part of dsh-websearch-local
// Copyright (C) 2026 MYCF711 (original author)
// Copyright (C) 2026 Local modifications

/* ------------------------------------------------------------------ utils */



function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

function htmlToText(html) {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<(br|p|div|li|h[1-6]|tr)\b[^>]*>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  return s.replace(/[ \t\r\f\v]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/** Strict falsy parsing — `'false'`, `'0'`, `'no'`, `'off'` all count as off. */
function isOff(v) {
  if (v === false || v === 0) return true;
  if (typeof v === 'string') return ['false', '0', 'no', 'off', ''].includes(v.trim().toLowerCase());
  return false;
}

/** 数据保护脱敏：在日志/错误文本里掩掉访问令牌与代理凭据，避免泄露。 */
function redactSensitive(s) {
  return String(s ?? '')
    .replace(/([?&](?:access_token|token|key|api_key|apikey)=)[^&\s"'`]+/gi, '$1***')
    .replace(/(\/\/)([^@\/\s]+)@/g, '$1***@');
}

function clampInt(v, lo, hi, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return dflt;
  return Math.min(Math.max(Math.round(n), lo), hi);
}

export {
decodeEntities,
stripTags,
htmlToText,
isOff,
clampInt,
redactSensitive
};
