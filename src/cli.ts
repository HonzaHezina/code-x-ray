import fs from 'node:fs';
import path from 'node:path';
import { analyzeRequest } from './core/git';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Code X-Ray\nUsage: node dist/cli.cjs [directory] [--base REV] [--out report.json] [--fail-on error|warning]\nExit: 0 success; 1 operational error; 2 findings meeting the selected threshold.\nOnly saved files are analyzed. JSON is written to stdout unless --out is used.'); return;
  }
  let root = process.cwd(); let revision: string | undefined; let output: string | undefined; let threshold: string | undefined; let gotRoot = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--base', '--out', '--fail-on'].includes(arg)) {
      const value = args[++i]; if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      if (arg === '--base') revision = value;
      if (arg === '--out') output = value;
      if (arg === '--fail-on') threshold = value;
    } else if (arg.startsWith('-') || gotRoot) throw new Error(`Unexpected argument: ${arg}`);
    else { root = path.resolve(arg); gotRoot = true; }
  }
  if (threshold && !['error', 'warning'].includes(threshold)) throw new Error('--fail-on must be error or warning.');
  const report = await analyzeRequest({ root, revision });
  const json = JSON.stringify(report, null, 2) + '\n';
  if (output) { fs.writeFileSync(output, json); console.error(`Report written to ${output}`); } else process.stdout.write(json);
  if (threshold && report.current.findings.some(finding => threshold === 'warning' || finding.severity === 'error')) process.exitCode = 2;
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
