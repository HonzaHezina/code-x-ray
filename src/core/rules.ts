import { createHash } from 'node:crypto';
import { matchesPrefix } from './config';
import type { Config, Dependency, FileNode, Finding } from './model';
const identity = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 20);

// Iterative Kosaraju: bounded stack usage even for long dependency chains.
export function components(ids: string[], edges: Dependency[]): string[][] {
  const forward = new Map(ids.map(id => [id, [] as string[]]));
  const reverse = new Map(ids.map(id => [id, [] as string[]]));
  for (const edge of edges) { forward.get(edge.source)?.push(edge.target); reverse.get(edge.target)?.push(edge.source); }
  const seen = new Set<string>(); const order: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const stack: [string, boolean][] = [[id, false]];
    while (stack.length) {
      const [node, done] = stack.pop()!;
      if (done) { order.push(node); continue; }
      if (seen.has(node)) continue;
      seen.add(node); stack.push([node, true]);
      for (const next of forward.get(node) ?? []) if (!seen.has(next)) stack.push([next, false]);
    }
  }
  seen.clear(); const result: string[][] = [];
  for (const id of order.reverse()) {
    if (seen.has(id)) continue;
    const group: string[] = []; const stack = [id]; seen.add(id);
    while (stack.length) {
      const node = stack.pop()!; group.push(node);
      for (const next of reverse.get(node) ?? []) if (!seen.has(next)) { seen.add(next); stack.push(next); }
    }
    result.push(group.sort());
  }
  return result;
}
export function evaluateRules(files: FileNode[], edges: Dependency[], config: Config): Finding[] {
  const findings: Finding[] = [];
  const cycleEdges = edges.filter(edge => config.includeTypeOnlyInCycles || !edge.typeOnly);
  for (const group of components(files.map(file => file.id), cycleEdges)) {
    if (group.length === 1 && !cycleEdges.some(edge => edge.source === group[0] && edge.target === group[0])) continue;
    const members = new Set(group);
    findings.push({ id: `cycle:${identity(group)}`, rule: 'cycle', severity: 'warning', message: `Dependency cycle involving ${group.length} file(s).`, nodes: group,
      evidence: cycleEdges.filter(edge => members.has(edge.source) && members.has(edge.target)).flatMap(edge => edge.evidence) });
  }
  for (const rule of config.boundaries) for (const edge of edges) {
    if (matchesPrefix(edge.source, rule.from) && rule.disallow.some(prefix => matchesPrefix(edge.target, prefix))) {
      findings.push({ id: `boundary:${identity([rule.name, edge.id])}`, rule: 'boundary', severity: 'error', message: `${rule.name}: ${edge.source} must not depend on ${edge.target}.`, nodes: [edge.source, edge.target], evidence: edge.evidence });
    }
  }
  for (const file of files) {
    if (file.fanOut > config.fanOutWarning) findings.push({ id: `fan-out:${file.id}`, rule: 'fan-out', severity: 'warning', message: `${file.id} depends on ${file.fanOut} internal files (threshold ${config.fanOutWarning}).`, nodes: [file.id], evidence: edges.filter(edge => edge.source === file.id).flatMap(edge => edge.evidence) });
    if (file.lines > config.largeFileLines) findings.push({ id: `large-file:${file.id}`, rule: 'large-file', severity: 'warning', message: `${file.id} has ${file.lines} physical lines (threshold ${config.largeFileLines}); inspect its responsibilities.`, nodes: [file.id], evidence: [{ file: file.id, line: 1, column: 1, specifier: '' }] });
  }
  return findings.sort((a, b) => a.id.localeCompare(b.id));
}
