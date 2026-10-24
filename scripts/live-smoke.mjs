#!/usr/bin/env node
/**
 * scripts/live-smoke.mjs — 用真实网络跑一次搜索，验证某个插件模块可用。
 * 用法：node scripts/live-smoke.mjs <模块路径> <查询词> [engine]
 *   模块路径：'./src/index.js' 或 './dist/index.js'（相对工程根）
 * 成功退出码 0；失败退出码 1。
 */
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const [, , spec, query, engine] = process.argv;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (!spec || !query) { console.error('用法: node scripts/live-smoke.mjs <模块相对路径> <查询词> [engine]'); process.exit(2); }
process.env.DSH_HOME = join(tmpdir(), 'wsd-live-' + process.pid);

const resolved = spec.startsWith('.') ? join(ROOT, spec) : spec;
const mod = await import(resolved);

function makeCtx() {
  const p = {};
  return {
    ctx: {
      web: {
        registerSearchProvider(x) { p.search = x; return () => {}; },
        registerFetchProvider(x) { p.fetch = x; return () => {}; },
      },
      effect(fn) { const d = fn(); return typeof d === 'function' ? d : () => {}; },
      logger: () => ({ warn() {}, debug() {} }),
      inject() {},
    },
    p,
  };
}
const { ctx, p } = makeCtx();
try { mod.apply(ctx, {}); } catch (e) { console.log('APPLY FAILED: ' + e.message); process.exit(1); }
try {
  const r = await p.search.search({ query, engine });
  console.log(`OK 模块=${spec} engine=${r.engine} usedEngines=${(r.usedEngines || []).join(',')} sources=${(r.sources || []).length}`);
  for (const [i, s] of (r.sources || []).slice(0, 5).entries()) {
    console.log(`  [${i + 1}] ${s.title}\n      ${s.url}\n      ${(s.snippet || '').slice(0, 90)}`);
  }
  process.exit(0);
} catch (e) {
  console.log('FAIL: ' + e.message);
  process.exit(1);
}
