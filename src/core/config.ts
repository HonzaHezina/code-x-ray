import fs from 'node:fs';
import path from 'node:path';
import type { Config } from './model';

export const DEFAULT_CONFIG: Config = {
  exclude: ['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.test-build'],
  maxFiles: 3000, maxFileBytes: 1024 * 1024, maxTotalBytes: 32 * 1024 * 1024,
  fanOutWarning: 15, largeFileLines: 500, includeTypeOnlyInCycles: false, boundaries: []
};
export const slash = (value: string): string => value.replaceAll('\\', '/');
export function isInside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}
export function matchesPrefix(file: string, prefix: string): boolean {
  const clean = prefix.replace(/\/$/, '');
  return file === clean || file.startsWith(`${clean}/`);
}
function validPrefix(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !value.startsWith('/') &&
    !value.includes('\\') && !value.includes(':') && !value.split('/').includes('..') && !/[?*]/.test(value);
}
export function readConfig(root: string): Config {
  const file = path.join(root, 'code-x-ray.config.json');
  if (!fs.existsSync(file)) return { ...DEFAULT_CONFIG, exclude: [...DEFAULT_CONFIG.exclude], boundaries: [] };
  if (fs.statSync(file).size > 256 * 1024) throw new Error('Code X-Ray configuration exceeds 256 KiB.');
  const input: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configuration must be a JSON object.');
  const raw = input as Record<string, unknown>;
  const allowed = new Set([...Object.keys(DEFAULT_CONFIG), '$schema']);
  for (const key of Object.keys(raw)) if (!allowed.has(key)) throw new Error(`Unknown configuration option: ${key}`);
  const result: Config = { ...DEFAULT_CONFIG, ...raw } as Config;
  for (const key of ['maxFiles', 'maxFileBytes', 'maxTotalBytes', 'fanOutWarning', 'largeFileLines'] as const) {
    if (!Number.isSafeInteger(result[key]) || result[key] < 1) throw new Error(`${key} must be a positive integer.`);
  }
  if (result.maxFiles > 10000 || result.maxFileBytes > 5 * 1024 * 1024 || result.maxTotalBytes > 128 * 1024 * 1024) throw new Error('Analysis limits exceed hard safety ceilings (10000 files / 5 MiB per file / 128 MiB total).');
  if (!Array.isArray(result.exclude) || !result.exclude.every(validPrefix)) throw new Error('exclude must contain relative directory prefixes; globs are not supported.');
  result.exclude = [...new Set([...DEFAULT_CONFIG.exclude, ...result.exclude])];
  if (typeof result.includeTypeOnlyInCycles !== 'boolean') throw new Error('includeTypeOnlyInCycles must be boolean.');
  if (!Array.isArray(result.boundaries) || !result.boundaries.every(rule => rule && typeof rule.name === 'string' && rule.name.length > 0 && validPrefix(rule.from) && Array.isArray(rule.disallow) && rule.disallow.every(validPrefix))) throw new Error('Each boundary requires name, from and disallow directory prefixes.');
  if (new Set(result.boundaries.map(rule => rule.name)).size !== result.boundaries.length) throw new Error('Boundary names must be unique.');
  return result;
}
export function excluded(relative: string, config: Config): boolean {
  return config.exclude.some(prefix => matchesPrefix(relative, prefix) || (!prefix.includes('/') && relative.split('/').includes(prefix)));
}
