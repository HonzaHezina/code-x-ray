import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { analyze } from '../src/core/analyzer';
import { analyzeRequest } from '../src/core/git';
import { diffGraphs } from '../src/core/diff';
import { isInside, readConfig } from '../src/core/config';
import { components } from '../src/core/rules';

function fixture(files: Record<string, string>): { root: string; write(name: string, content: string): void; cleanup(): void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xray-test-'));
  const write = (name: string, content: string) => { const target = path.join(root, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); };
  for (const [name, content] of Object.entries(files)) write(name, content);
  return { root, write, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
const configure = (value: unknown) => JSON.stringify(value);
test('resolves path aliases and supplies exact source evidence', t => {
  const f = fixture({ 'tsconfig.json': configure({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } }), 'src/ui/page.ts': "import { load } from '@/data/store';\nload();\n", 'src/data/store.ts': 'export const load = () => 1;' }); t.after(f.cleanup);
  const result = analyze(f.root);
  assert.equal(result.edges.length, 1); assert.equal(result.edges[0].target, 'src/data/store.ts');
  assert.deepEqual(result.edges[0].evidence[0], { file: 'src/ui/page.ts', line: 1, column: 22, specifier: '@/data/store' });
});
test('detects multi-node cycles and honors explicit boundary rules', t => {
  const f = fixture({ 'ui/a.ts': "import '../data/b';", 'data/b.ts': "import '../ui/a';", 'code-x-ray.config.json': configure({ boundaries: [{ name: 'UI isolation', from: 'ui', disallow: ['data'] }] }) }); t.after(f.cleanup);
  const result = analyze(f.root);
  assert.equal(result.findings.filter(finding => finding.rule === 'cycle').length, 1);
  assert.equal(result.findings.filter(finding => finding.rule === 'boundary').length, 1);
  assert.equal(result.findings.find(finding => finding.rule === 'boundary')!.severity, 'error');
});
test('type-only edges do not create runtime cycle findings by default', t => {
  const f = fixture({ 'a.ts': "import type { B } from './b'; export interface A {}", 'b.ts': "import { type A } from './a'; export interface B {}" }); t.after(f.cleanup);
  assert.ok(analyze(f.root).edges.every(edge => edge.typeOnly));
  assert.equal(analyze(f.root).findings.length, 0);
  f.write('code-x-ray.config.json', configure({ includeTypeOnlyInCycles: true }));
  assert.equal(analyze(f.root).findings[0].rule, 'cycle');
});
test('mixed type/value imports remain runtime edges and re-exports are recorded', t => {
  const f = fixture({ 'a.ts': "import { type B, value } from './b'; export { value } from './b';", 'b.ts': 'export interface B {}; export const value = 1;' }); t.after(f.cleanup);
  const result = analyze(f.root); assert.equal(result.edges.length, 2); assert.ok(result.edges.every(edge => !edge.typeOnly)); assert.equal(result.files.find(file => file.id === 'a.ts')!.fanOut, 1);
});
test('tracks literal dynamic imports and flags non-literal imports without inventing edges', t => {
  const f = fixture({ 'a.ts': "import('./b'); import(name); require('./b'); require(name);", 'b.ts': 'export {}' }); t.after(f.cleanup);
  const result = analyze(f.root); assert.equal(result.edges.length, 2); assert.equal(result.dynamicUnknown, 2); assert.ok(result.warnings.some(warning => warning.includes('shadowed')));
});
test('unresolved aliases are disclosed; node builtins are classified separately', t => {
  const f = fixture({ 'a.ts': "import 'node:fs'; import '@/missing';" }); t.after(f.cleanup);
  const result = analyze(f.root); assert.equal(result.externalImports, 1); assert.equal(result.unresolvedImports, 1); assert.equal(result.edges.length, 0);
});
test('default ignored directories and symbolic links are not scanned', t => {
  const f = fixture({ 'a.ts': 'export {}', 'node_modules/pkg/main.ts': 'export {}', 'dist/generated.ts': 'export {}' }); t.after(f.cleanup);
  if (process.platform !== 'win32') fs.symlinkSync(path.join(f.root, 'a.ts'), path.join(f.root, 'link.ts'));
  assert.deepEqual(analyze(f.root).files.map(file => file.id), ['a.ts']);
});
test('config rejects typoed keys, path escapes, invalid thresholds and ambiguous rule names', t => {
  const f = fixture({}); t.after(f.cleanup);
  for (const raw of [{ maxFile: 10 }, { exclude: ['../secret'] }, { exclude: ['**/test'] }, { maxFiles: 0 }, { boundaries: [{ name: 'x', from: 'ui', disallow: ['db'] }, { name: 'x', from: 'ui', disallow: ['db'] }] }]) {
    f.write('code-x-ray.config.json', configure(raw)); assert.throws(() => readConfig(f.root));
  }
});
test('file limit fails explicitly instead of returning an apparently complete graph', t => {
  const f = fixture({ 'a.ts': '', 'b.ts': '', 'code-x-ray.config.json': configure({ maxFiles: 1 }) }); t.after(f.cleanup); assert.throws(() => analyze(f.root), /limits/);
});
test('oversized files and syntax errors produce coverage notices', t => {
  const f = fixture({ 'a.ts': 'x'.repeat(50), 'b.ts': 'const = ;', 'code-x-ray.config.json': configure({ maxFileBytes: 20 }) }); t.after(f.cleanup);
  const result = analyze(f.root); assert.ok(result.warnings.some(warning => warning.includes('oversized'))); assert.ok(result.warnings.some(warning => warning.includes('Parse issue')));
});
test('diff identifies removed dependencies and stable edge identity ignores line shifts', t => {
  const f = fixture({ 'a.ts': "import './b';", 'b.ts': '' }); t.after(f.cleanup);
  const before = analyze(f.root); f.write('a.ts', "\n\nimport './b';");
  let diff = diffGraphs(before, analyze(f.root)); assert.deepEqual(diff.modifiedFiles, ['a.ts']); assert.equal(diff.addedEdges.length, 0);
  f.write('a.ts', ''); diff = diffGraphs(before, analyze(f.root)); assert.equal(diff.removedEdges.length, 1);
});
test('path containment rejects sibling-prefix and parent traversal', () => {
  const root = path.resolve('/tmp/project'); assert.ok(isInside(root, path.join(root, 'a.ts'))); assert.ok(!isInside(root, path.resolve('/tmp/project-other/a.ts'))); assert.ok(!isInside(root, path.resolve(root, '../a.ts')));
});
test('SCC traversal handles a long chain without recursion overflow', () => {
  const ids = Array.from({ length: 10000 }, (_, i) => String(i));
  const edges = ids.slice(1).map((id, i) => ({ id, source: String(i), target: id, kind: 'import' as const, typeOnly: false, evidence: [] }));
  assert.equal(components(ids, edges).length, ids.length);
});
function initGit(root: string): void {
  const run = (args: string[]) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' });
  run(['init']); run(['add', '.']); run(['-c', 'user.name=Xray Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'baseline']);
}
test('Git comparison includes historical deleted files, preserves working tree, and uses current policy', async t => {
  const f = fixture({ 'a.ts': "import './b';", 'b.ts': "import './a';" }); t.after(f.cleanup); initGit(f.root);
  f.write('a.ts', 'export {};'); fs.unlinkSync(path.join(f.root, 'b.ts')); f.write('untracked.ts', 'export const n = 3;');
  const result = await analyzeRequest({ root: f.root, revision: 'HEAD' });
  assert.deepEqual(result.diff!.removedFiles, ['b.ts']); assert.deepEqual(result.diff!.addedFiles, ['untracked.ts']); assert.equal(result.diff!.removedEdges.length, 2); assert.equal(result.diff!.resolvedFindings.length, 1);
  assert.equal(fs.readFileSync(path.join(f.root, 'a.ts'), 'utf8'), 'export {};'); assert.ok(!fs.existsSync(path.join(f.root, 'b.ts')));
});
test('Git comparison handles workspace subdirectories and spaces in paths', async t => {
  const f = fixture({ 'app folder/src/a file.ts': "import './b';", 'app folder/src/b.ts': '', 'other/c.ts': '' }); t.after(f.cleanup); initGit(f.root);
  const result = await analyzeRequest({ root: path.join(f.root, 'app folder'), revision: 'HEAD' }); assert.equal(result.baseline!.files.length, 2); assert.equal(result.baseline!.edges.length, 1); assert.deepEqual(result.diff!.addedFiles, []);
});
test('Git revision option injection is rejected, not executed', async t => {
  const f = fixture({ 'a.ts': '' }); t.after(f.cleanup); initGit(f.root);
  await assert.rejects(analyzeRequest({ root: f.root, revision: '--help' }), /Git operation failed/);
});
test('Git snapshots evaluate both versions against current boundary policy', async t => {
  const f = fixture({ 'ui/a.ts': "import '../data/b';", 'data/b.ts': '' }); t.after(f.cleanup); initGit(f.root);
  f.write('code-x-ray.config.json', configure({ boundaries: [{ name: 'Current policy', from: 'ui', disallow: ['data'] }] }));
  const result = await analyzeRequest({ root: f.root, revision: 'HEAD' });
  assert.equal(result.current.findings.length, 1); assert.equal(result.baseline!.findings.length, 1); assert.deepEqual(result.diff!.newFindings, []);
});
test('snapshot files are cleaned inside a caller-owned temporary parent', async t => {
  const f = fixture({ 'a.ts': '' }); const temporary = fixture({}); t.after(f.cleanup); t.after(temporary.cleanup); initGit(f.root);
  await analyzeRequest({ root: f.root, revision: 'HEAD', temporaryParent: temporary.root });
  assert.deepEqual(fs.readdirSync(temporary.root), []);
});
