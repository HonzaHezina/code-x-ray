import { build, context } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import './notices.mjs';
await mkdir('dist', { recursive: true });
const base = { bundle: true, sourcemap: true, logLevel: 'info' };
const builds = [
  { ...base, entryPoints: ['src/extension/extension.ts'], outfile: 'dist/extension.cjs', platform: 'node', format: 'cjs', target: 'node20', external: ['vscode'] },
  { ...base, entryPoints: ['src/extension/worker.ts'], outfile: 'dist/worker.cjs', platform: 'node', format: 'cjs', target: 'node20' },
  { ...base, entryPoints: ['src/cli.ts'], outfile: 'dist/cli.cjs', platform: 'node', format: 'cjs', target: 'node22' },
  { ...base, entryPoints: ['src/webview/App.tsx'], outfile: 'dist/webview.js', platform: 'browser', format: 'iife', target: 'es2022', minify: true }
];
if (process.argv.includes('--watch')) {
  for (const options of builds) await (await context(options)).watch();
  console.log('Watching Code X-Ray');
} else await Promise.all(builds.map(options => build(options)));
