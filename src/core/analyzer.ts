import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { excluded, isInside, readConfig, slash } from './config';
import { evaluateRules } from './rules';
import type { Analysis, Dependency, EdgeKind, FileNode } from './model';

export const isSource = (file: string): boolean => /\.[cm]?[jt]sx?$/.test(file) && !/\.d\.[cm]?ts$/.test(file);
export function analyze(rootInput: string): Analysis {
  const root = fs.realpathSync(rootInput); const config = readConfig(root);
  const warnings: string[] = []; const sources: string[] = []; let total = 0;
  function walk(directory: string): void {
    for (const item of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(directory, item.name); const rel = slash(path.relative(root, full));
      if (excluded(rel, config)) continue;
      if (item.isSymbolicLink()) { warnings.push(`Skipped symlink: ${rel}`); continue; }
      if (item.isDirectory()) walk(full);
      else if (item.isFile() && isSource(full)) {
        const bytes = fs.statSync(full).size;
        if (bytes > config.maxFileBytes) { warnings.push(`Skipped oversized file: ${rel}`); continue; }
        total += bytes;
        if (sources.length >= config.maxFiles || total > config.maxTotalBytes) throw new Error('Project exceeds configured analysis limits. Narrow the workspace or add exclude prefixes.');
        sources.push(full);
      }
    }
  }
  walk(root);
  const configFile = ['tsconfig.json', 'jsconfig.json'].map(name => path.join(root, name)).find(file => fs.existsSync(file));
  let options: ts.CompilerOptions = { allowJs: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, noEmit: true };
  if (configFile) {
    const read = ts.readConfigFile(configFile, ts.sys.readFile);
    if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'));
    const parsed = ts.parseJsonConfigFileContent(read.config, { ...ts.sys, readDirectory: () => [] }, root, undefined, configFile);
    options = { ...options, ...parsed.options };
    for (const diagnostic of parsed.errors) if (diagnostic.code !== 18003 && diagnostic.code !== 18002) warnings.push(`Compiler configuration: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
  } else warnings.push('No root tsconfig.json/jsconfig.json: using Bundler module resolution defaults.');
  const known = new Set(sources.map(file => path.resolve(file)));
  const resolutionCache = ts.createModuleResolutionCache(root, file => file, options);
  const edgeMap = new Map<string, Dependency>(); const files: FileNode[] = [];
  let externalImports = 0; let unresolvedImports = 0; let dynamicUnknown = 0;
  for (const full of sources) {
    const id = slash(path.relative(root, full)); const text = fs.readFileSync(full, 'utf8');
    const source = ts.createSourceFile(full, text, ts.ScriptTarget.Latest, true);
    let functions = 0; let branches = 0;
    // Syntactic imports are facts; require() is only a syntactic candidate (it can be shadowed).
    function record(specifier: ts.Expression | ts.TypeNode | undefined, kind: EdgeKind, typeOnly: boolean): void {
      if (!specifier || !ts.isStringLiteralLike(specifier)) { dynamicUnknown++; return; }
      const name = specifier.text;
      const resolved = ts.resolveModuleName(name, full, options, ts.sys, resolutionCache).resolvedModule;
      const at = source.getLineAndCharacterOfPosition(specifier.getStart(source));
      if (!resolved) {
        if (name.startsWith('node:')) { externalImports++; return; }
        unresolvedImports++; warnings.push(`Unresolved ${kind}: ${id}:${at.line + 1} → ${name}`); return;
      }
      const targetFull = path.resolve(resolved.resolvedFileName);
      if (resolved.isExternalLibraryImport || !isInside(root, targetFull) || targetFull.includes(`${path.sep}node_modules${path.sep}`)) { externalImports++; return; }
      if (!known.has(targetFull)) { warnings.push(`Dependency outside analyzed source set: ${id}:${at.line + 1} → ${name}`); return; }
      const target = slash(path.relative(root, targetFull)); const edgeId = JSON.stringify([id, target, kind, typeOnly]);
      const evidence = { file: id, line: at.line + 1, column: at.character + 1, specifier: name };
      const existing = edgeMap.get(edgeId);
      if (existing) existing.evidence.push(evidence);
      else edgeMap.set(edgeId, { id: edgeId, source: id, target, kind, typeOnly, evidence: [evidence] });
    }
    function visit(node: ts.Node): void {
      if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) functions++;
      if (ts.isIfStatement(node) || ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node) || ts.isCaseClause(node) || ts.isCatchClause(node) || ts.isConditionalExpression(node) || (ts.isBinaryExpression(node) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind))) branches++;
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        const named = clause?.namedBindings;
        const only = !!clause?.isTypeOnly || (!!named && ts.isNamedImports(named) && named.elements.length > 0 && named.elements.every(element => element.isTypeOnly) && !clause?.name);
        record(node.moduleSpecifier, 'import', only);
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        const named = node.exportClause;
        record(node.moduleSpecifier, 'export', node.isTypeOnly || (!!named && ts.isNamedExports(named) && named.elements.length > 0 && named.elements.every(element => element.isTypeOnly)));
      } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) record(node.moduleReference.expression, 'import-equals', node.isTypeOnly);
      else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) record(node.argument.literal, 'import', true);
      else if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) record(node.arguments[0], 'dynamic-import', false);
        else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') record(node.arguments[0], 'require', false);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    const parseErrors = (source as ts.SourceFile & { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? [];
    for (const diagnostic of parseErrors) warnings.push(`Parse issue in ${id}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
    files.push({ id, label: path.basename(full), group: path.posix.dirname(id), hash: createHash('sha256').update(text).digest('hex'), lines: text === '' ? 0 : text.split(/\r?\n/).length - (text.endsWith('\n') ? 1 : 0), functions, branches, fanIn: 0, fanOut: 0 });
  }
  const edges = [...edgeMap.values()].sort((a, b) => a.id.localeCompare(b.id));
  const outgoing = new Map<string, Set<string>>(); const incoming = new Map<string, Set<string>>();
  for (const edge of edges) { if (!outgoing.has(edge.source)) outgoing.set(edge.source, new Set()); if (!incoming.has(edge.target)) incoming.set(edge.target, new Set()); outgoing.get(edge.source)!.add(edge.target); incoming.get(edge.target)!.add(edge.source); }
  for (const file of files) { file.fanIn = incoming.get(file.id)?.size ?? 0; file.fanOut = outgoing.get(file.id)?.size ?? 0; }
  if (dynamicUnknown) warnings.push(`${dynamicUnknown} non-literal dynamic import/require call(s) cannot be resolved statically.`);
  if (edges.some(edge => edge.kind === 'require')) warnings.push('require() edges are syntactic candidates; shadowed require identifiers are not distinguished.');
  return { schemaVersion: 1, files, edges, findings: evaluateRules(files, edges, config), warnings, externalImports, unresolvedImports, dynamicUnknown };
}
