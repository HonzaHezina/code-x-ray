import type { Analysis, GraphDiff } from './model';
export function diffGraphs(baseline: Analysis, current: Analysis): GraphDiff {
  const before = new Map(baseline.files.map(file => [file.id, file]));
  const after = new Map(current.files.map(file => [file.id, file]));
  const difference = (a: string[], b: string[]) => { const other = new Set(b); return a.filter(value => !other.has(value)).sort(); };
  return {
    addedFiles: difference([...after.keys()], [...before.keys()]), removedFiles: difference([...before.keys()], [...after.keys()]),
    modifiedFiles: current.files.filter(file => before.has(file.id) && before.get(file.id)!.hash !== file.hash).map(file => file.id).sort(),
    addedEdges: difference(current.edges.map(edge => edge.id), baseline.edges.map(edge => edge.id)),
    removedEdges: difference(baseline.edges.map(edge => edge.id), current.edges.map(edge => edge.id)),
    newFindings: difference(current.findings.map(finding => finding.id), baseline.findings.map(finding => finding.id)),
    resolvedFindings: difference(baseline.findings.map(finding => finding.id), current.findings.map(finding => finding.id))
  };
}
