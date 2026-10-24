#!/usr/bin/env node
/**
 * scripts/check-parity.mjs — 离线/联网 回归对比 dist/index.js 与 src/index.js。
 * 用法：node scripts/check-parity.mjs [--live]
 *  - 默认只做离线行为对比（假 ctx，不依赖真实网络）。
 *  - --live 追加真实联网搜索，对比两者的搜索结果是否一致。
 * 任一检查不通过则非零退出。
 */
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dshHome = join(tmpdir(), 'wsd-parity-' + process.pid);
process.env.DSH_HOME = dshHome; // 隔离：不读/不写真实 ui-config.json

const A = await import(join(ROOT, 'dist/index.js'));
const B = await import(join(ROOT, 'src/index.js'));

let failures = 0;
const check = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) failures++; };

console.log('[1] 公共形状');
check(A.name === B.name, `name 一致 (=${B.name})`);
check(JSON.stringify(A.inject) === JSON.stringify(B.inject), `inject 一致 (=${JSON.stringify(B.inject)})`);
check(A.SETTINGS_NAMESPACE === B.SETTINGS_NAMESPACE, `SETTINGS_NAMESPACE 一致`);
check(String(A.Config) === String(B.Config), `Config 一致 (typeof=${typeof B.Config})`);
check(A.apply.length === B.apply.length, `apply 参数个数一致 (${B.apply.length})`);

console.log('[2] 离线行为（假 ctx）');
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
async function run(mod, query, engine) {
  const { ctx, p } = makeCtx();
  mod.apply(ctx, {});
  try {
    const r = await p.search.search({ query, engine });
    return { ok: true, used: r.usedEngines || [r.engine], sources: (r.sources || []).map((s) => ({ u: s.url, t: s.title })) };
  } catch (e) {
    return { ok: false, err: e.message };
  }
}
const e1 = await run(B, '', '');
const e1b = await run(A, '', '');
check((e1.err || '') === 'query is required' && (e1.err || '') === (e1b.err || ''), `空 query 报错一致 (${e1.err || ''})`);
if ((B.Config ? true : true)) { /* Config 存在性已在上面比对 */ }
const unknown = await run(B, 'not-a-real-query-for-parity', 'no-such-engine');
const unknownB = await run(A, 'not-a-real-query-for-parity', 'no-such-engine');
check(unknown.ok === unknownB.ok && (unknown.err || '') === (unknownB.err || ''),
  `未知引擎路径一致 ok=${unknown.ok} err=${(unknown.err || '').slice(0, 42)}`);

if (process.argv.includes('--live')) {
  console.log('[3] 联网搜索一致性（--live）');
  const qs = [['DeepSeek 最新模型', undefined], ['npm http client', undefined], ['react framework', 'github']];
  for (const [q, e] of qs) {
    const ra = await run(A, q, e);
    const rb = await run(B, q, e);
    const same = ra.ok === rb.ok && JSON.stringify((ra.sources || []).slice(0, 4)) === JSON.stringify((rb.sources || []).slice(0, 4));
    check(same, `联网[${q}${e ? '@' + e : ''}] dist/SRC 一致 ok=${rb.ok} 条数=${(rb.sources || []).length}`);
    if (!same) { console.log('   dist:', JSON.stringify((ra.sources || []).slice(0, 3))); console.log('   src :', JSON.stringify((rb.sources || []).slice(0, 3))); }
  }
}

console.log(failures ? `\nFAILURES: ${failures}` : '\nALL PARITY CHECKS PASSED');
process.exit(failures ? 1 : 0);
