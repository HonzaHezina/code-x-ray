import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyze, isSource } from './analyzer';
import { excluded, isInside, readConfig, slash } from './config';
import { diffGraphs } from './diff';
import type { AnalysisRequest, Report } from './model';

export function git(root: string, args: string[], input?: string, limit = 16 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = execFile('git', ['-C', root, ...args], { encoding: 'buffer', maxBuffer: limit, timeout: 60000, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' } }, (error, stdout, stderr) => {
      if (error) reject(new Error(`Git operation failed: ${stderr.toString('utf8').trim() || error.message}`));
      else resolve(stdout);
    });
    child.stdin?.on('error', () => { /* Early process exit is handled by callback. */ });
    child.stdin?.end(input);
  });
}
export async function analyzeRequest(request: AnalysisRequest): Promise<Report> {
  const root = fs.realpathSync(request.root); const current = analyze(root);
  if (!request.revision) return { current };
  const revision = request.revision.trim();
  if (!revision || revision.length > 256 || /[\0\r\n]/.test(revision)) throw new Error('Invalid Git revision.');
  const repo = (await git(root, ['rev-parse', '--show-toplevel'])).toString('utf8').trim();
  const hash = (await git(root, ['rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`])).toString('utf8').trim();
  if (!/^[a-f0-9]{40,64}$/.test(hash)) throw new Error('Git did not return a valid commit ID.');
  const prefix = slash(path.relative(repo, root));
  const list = (await git(repo, ['ls-tree', '-r', '-z', '--full-tree', hash, '--', ...(prefix ? [prefix] : [])])).toString('utf8');
  const config = readConfig(root); let total = 0;
  const entries: { id: string; relative: string }[] = [];
  for (const record of list.split('\0')) {
    if (!record) continue;
    const tab = record.indexOf('\t');
    const [mode, type, id] = record.slice(0, tab).split(' ');
    const name = record.slice(tab + 1);
    if (type !== 'blob' || !['100644', '100755'].includes(mode)) continue;
    const relative = prefix ? name.slice(prefix.length + 1) : name;
    if (prefix && !name.startsWith(`${prefix}/`)) continue;
    if (excluded(relative, config) || !(isSource(relative) || /\.json$/.test(relative))) continue;
    if (path.isAbsolute(relative) || relative.split('/').some(part => part === '..' || part === '.git') || relative.includes('\\')) throw new Error('Unsafe path in Git snapshot.');
    if (!/^[a-f0-9]{40,64}$/.test(id)) throw new Error('Unexpected Git object ID.');
    entries.push({ id, relative });
    if (entries.length > config.maxFiles + 1000) throw new Error('Git snapshot exceeds file limit.');
  }
  // Check blob sizes before requesting contents; no checkout, hooks, filters or project scripts.
  const checks = (await git(repo, ['cat-file', '--batch-check'], entries.map(entry => entry.id).join('\n') + '\n')).toString('utf8').trim().split('\n');
  if (entries.length && checks.length !== entries.length) throw new Error('Unexpected Git batch metadata.');
  for (let i = 0; i < entries.length; i++) {
    const [id, type, rawSize] = checks[i].split(' '); const size = Number(rawSize);
    if (id !== entries[i].id || type !== 'blob' || !Number.isSafeInteger(size) || size < 0 || size > config.maxFileBytes) throw new Error(`Git snapshot contains an unsupported or oversized blob: ${entries[i].relative}`);
    total += size;
    if (total > config.maxTotalBytes) throw new Error('Git snapshot exceeds byte limit.');
  }
  const temporary = fs.mkdtempSync(path.join(request.temporaryParent ?? os.tmpdir(), 'code-x-ray-'));
  try {
    if (entries.length) {
      const data = await git(repo, ['cat-file', '--batch'], entries.map(entry => entry.id).join('\n') + '\n', total + entries.length * 200 + 1024);
      let offset = 0;
      for (const entry of entries) {
        const end = data.indexOf(10, offset);
        const [id, type, sizeText] = data.subarray(offset, end).toString('utf8').split(' '); const size = Number(sizeText);
        if (end < 0 || id !== entry.id || type !== 'blob' || !Number.isSafeInteger(size) || size < 0 || end + 1 + size >= data.length || data[end + 1 + size] !== 10) throw new Error('Malformed Git batch content.');
        const destination = path.resolve(temporary, entry.relative);
        if (!isInside(temporary, destination)) throw new Error('Git snapshot path escapes temporary directory.');
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, data.subarray(end + 1, end + 1 + size)); offset = end + 1 + size + 1;
      }
    }
    // Apply CURRENT architecture policy to both versions: no false drift caused by rule edits.
    fs.writeFileSync(path.join(temporary, 'code-x-ray.config.json'), JSON.stringify(config));
    const baseline = analyze(temporary);
    baseline.warnings.push('Git snapshot has no installed dependencies. Package-based resolution and tsconfig extends may differ from the working tree; inspect unresolved imports.');
    return { current, baseline, diff: diffGraphs(baseline, current), revision: hash };
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
