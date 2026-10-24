// ═══════════════════════════════════════════════════════════════════
// 可选依赖解析（deps）：resolutionBases / optionalImport / Schema / defineTool
// 由 scripts/split-src.mjs 从 dist/index.js 按行切片自动生成；逻辑与 dist 逐字一致，
// 只调整了 import/export 边界。改动请改本文件，或改 src/ 后重跑该脚本（--check 可验证）。
// dist L56-60 的三个 node 内建 import 移到这里；L110-117 的顶层可选导入块原样保留。
// ═══════════════════════════════════════════════════════════════════

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
/**
 * Where to look for our own optional dependencies.
 *
 * `import('@deepseek-ai/x')` resolves from the importing FILE's directory, which
 * is right for a normal install (`profiles/<p>/node_modules/<pkg>/`) but fails
 * for a linked, junctioned or mounted plugin — and a silent failure here
 * cascades, because a missing `schema` is not the same as a missing feature
 * (see `Config` below), and a missing `undici` silently kills `proxyUrl`.
 *
 * Order: the plugin's own location, then the working directory, then the
 * profile that is actually booting (read from argv) and its shared
 * `node_modules`. Every candidate is optional; the first one that resolves wins.
 */

function resolutionBases() {
  const bases = [import.meta.url];
  const push = (path) => {
    try {
      bases.push(pathToFileURL(path).href);
    } catch {
      /* ignore a candidate we cannot even turn into a URL */
    }
  };
  push(join(process.cwd(), '_'));

  const home = process.env.DSH_HOME;
  const argv = process.argv;
  const at = argv.indexOf('--profile');
  const profile = at >= 0 && argv[at + 1] && !argv[at + 1].startsWith('-') ? argv[at + 1] : null;
  if (home && profile) push(join(home, 'profiles', profile, '_'));
  if (home) push(join(home, 'profiles', 'node_modules', '_'));
  return bases;
}

const BASES = resolutionBases();

/** Import a peer we can live without. Returns null when no candidate resolves. */
async function optionalImport(spec) {
  for (const base of BASES) {
    try {
      const resolved = createRequire(base).resolve(spec);
      return await import(pathToFileURL(resolved).href);
    } catch {
      /* try the next base */
    }
  }
  return null;
}

let Schema = null;
let defineTool = null;
{
  const schemastery = await optionalImport('@deepseek-ai/schemastery');
  Schema = schemastery?.default ?? null;
  const tools = await optionalImport('@deepseek-ai/dsh-tools');
  defineTool = tools?.defineTool ?? null;
}

export {
resolutionBases,
BASES,
optionalImport,
Schema,
defineTool
};
