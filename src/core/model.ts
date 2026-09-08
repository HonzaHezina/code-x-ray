export type EdgeKind = 'import' | 'export' | 'dynamic-import' | 'require' | 'import-equals';
export interface Evidence { file: string; line: number; column: number; specifier: string }
export interface Dependency { id: string; source: string; target: string; typeOnly: boolean; kind: EdgeKind; evidence: Evidence[] }
export interface FileNode {
  id: string; label: string; group: string; hash: string;
  lines: number; functions: number; branches: number; fanIn: number; fanOut: number;
}
export interface Finding {
  id: string; rule: 'cycle' | 'boundary' | 'fan-out' | 'large-file';
  severity: 'warning' | 'error'; message: string; nodes: string[]; evidence: Evidence[];
}
export interface Analysis {
  schemaVersion: 1; files: FileNode[]; edges: Dependency[]; findings: Finding[];
  warnings: string[]; externalImports: number; unresolvedImports: number; dynamicUnknown: number;
}
export interface BoundaryRule { name: string; from: string; disallow: string[] }
export interface Config {
  exclude: string[]; maxFiles: number; maxFileBytes: number; maxTotalBytes: number;
  fanOutWarning: number; largeFileLines: number; includeTypeOnlyInCycles: boolean;
  boundaries: BoundaryRule[];
}
export interface GraphDiff {
  addedFiles: string[]; removedFiles: string[]; modifiedFiles: string[];
  addedEdges: string[]; removedEdges: string[]; newFindings: string[]; resolvedFindings: string[];
}
export interface Report { current: Analysis; baseline?: Analysis; diff?: GraphDiff; revision?: string }
export interface AnalysisRequest { root: string; revision?: string; temporaryParent?: string }
