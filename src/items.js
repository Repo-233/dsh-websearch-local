// ═══════════════════════════════════════════════════════════════════
// 结果条目建构（items）：repoItem / giteaPick / pkgItem
// 由 scripts/split-src.mjs 从 dist/index.js 按行切片自动生成；逻辑与 dist 逐字一致，
// 只调整了 import/export 边界。改动请改本文件，或改 src/ 后重跑该脚本（--check 可验证）。
// ═══════════════════════════════════════════════════════════════════

/* ----------------------------------------------------------- repo engines */

function repoItem({ url, name, stars, desc, lang, updated, extra }) {
  return {
    url,
    title: `${name}  ★${stars ?? 0}`,
    score: Number(stars) || 0,
    snippet: [desc || '', lang ? `语言: ${lang}` : '', updated ? `最近更新: ${String(updated).slice(0, 10)}` : '', extra || '']
      .filter(Boolean)
      .join(' · '),
  };
}

/** Gitea / Forgejo / Codeberg 共用一套返回结构。 */
function giteaPick(data, label) {
  const arr = data?.data || data?.items || [];
  if (!Array.isArray(arr)) throw new Error(`${label} 返回结构异常`);
  return arr.map((it) =>
    repoItem({
      url: it.html_url,
      name: it.full_name,
      stars: it.stars_count,
      desc: it.description,
      lang: it.language,
      updated: it.updated_at,
    })
  );
}

/* -------------------------------------------------------- package engines */

function pkgItem({ url, name, version, downloads, desc, extra }) {
  return {
    url,
    title: `${name}${version ? `@${version}` : ''}${downloads != null ? `  ⤓${downloads}` : ''}`,
    score: Number(downloads) || 0,
    snippet: [desc || '', extra || ''].filter(Boolean).join(' · '),
  };
}

export {
repoItem,
giteaPick,
pkgItem
};
