import * as vscode from 'vscode';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import type { Report } from '../core/model';
import { isInside } from '../core/config';

class Launcher implements vscode.TreeDataProvider<vscode.TreeItem> {
  getTreeItem(item: vscode.TreeItem): vscode.TreeItem { return item; }
  getChildren(): vscode.TreeItem[] {
    return [['Open architecture map', 'codeXRay.open'], ['Compare with Git revision', 'codeXRay.compare'], ['Export JSON report', 'codeXRay.export']].map(([label, command]) => {
      const item = new vscode.TreeItem(label); item.command = { command, title: label }; return item;
    });
  }
}
export function activate(context: vscode.ExtensionContext): void {
  let panel: vscode.WebviewPanel | undefined;
  let root: vscode.WorkspaceFolder | undefined;
  let report: Report | undefined;
  let revision: string | undefined;
  let worker: Worker | undefined;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const output = vscode.window.createOutputChannel('Code X-Ray');
  const diagnostics = vscode.languages.createDiagnosticCollection('code-x-ray');
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = 'codeXRay.open'; statusBar.text = '$(circuit-board) Code X-Ray'; statusBar.tooltip = 'Open Code X-Ray architecture map'; statusBar.show();
  context.subscriptions.push(output, diagnostics, statusBar, vscode.window.registerTreeDataProvider('codeXRay.launcher', new Launcher()));
  const send = (message: unknown) => { void panel?.webview.postMessage(message); };
  function updateStatusBar(result: Report | undefined): void {
    if (!result) { statusBar.text = '$(circuit-board) Code X-Ray'; statusBar.backgroundColor = undefined; return; }
    const errors = result.current.findings.filter(item => item.severity === 'error').length;
    const warnings = result.current.findings.length - errors;
    statusBar.text = errors ? `$(error) X-Ray: ${errors} error${errors === 1 ? '' : 's'}` : warnings ? `$(warning) X-Ray: ${warnings} warning${warnings === 1 ? '' : 's'}` : '$(check) X-Ray: clean';
    statusBar.backgroundColor = errors ? new vscode.ThemeColor('statusBarItem.errorBackground') : warnings ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
  }

  async function chooseRoot(): Promise<boolean> {
    if (!vscode.workspace.isTrusted) { void vscode.window.showWarningMessage('Code X-Ray requires a trusted workspace.'); return false; }
    const folders = vscode.workspace.workspaceFolders?.filter(folder => folder.uri.scheme === 'file') ?? [];
    if (!folders.length) { void vscode.window.showInformationMessage('Open a local folder first. Remote SSH/WSL works when the extension runs on the remote host.'); return false; }
    if (root && folders.some(folder => folder.uri.toString() === root!.uri.toString())) return true;
    root = folders.length === 1 ? folders[0] : await vscode.window.showWorkspaceFolderPick();
    return !!root;
  }
  function publishDiagnostics(result: Report): void {
    diagnostics.clear(); if (!root) return;
    const groups = new Map<string, vscode.Diagnostic[]>();
    for (const finding of result.current.findings) for (const evidence of finding.evidence.slice(0, 100)) {
      const items = groups.get(evidence.file) ?? [];
      const range = new vscode.Range(Math.max(0, evidence.line - 1), Math.max(0, evidence.column - 1), Math.max(0, evidence.line - 1), Math.max(1, evidence.column));
      const diagnostic = new vscode.Diagnostic(range, finding.message, finding.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning);
      diagnostic.source = 'Code X-Ray'; diagnostic.code = finding.rule; items.push(diagnostic); groups.set(evidence.file, items);
    }
    for (const [file, items] of groups) diagnostics.set(vscode.Uri.joinPath(root.uri, file), items);
  }
  async function refresh(): Promise<void> {
    if (!await chooseRoot()) return;
    clearTimeout(timer);
    const token = ++generation;
    const previousWorker = worker; worker = undefined; if (previousWorker) void previousWorker.terminate();
    send({ type: 'status', busy: true, message: 'Analyzing saved files…' });
    // Parent owns snapshot lifetime too: worker.terminate() does not run its finally blocks.
    const temporaryParent = fs.mkdtempSync(path.join(os.tmpdir(), 'code-x-ray-worker-'));
    let active: Worker;
    try {
      active = new Worker(path.join(context.extensionPath, 'dist', 'worker.cjs'), { workerData: { root: root!.uri.fsPath, revision, temporaryParent }, resourceLimits: { maxOldGenerationSizeMb: 512 } });
    } catch (error) { fs.rmSync(temporaryParent, { recursive: true, force: true }); throw error; }
    active.on('exit', () => { try { fs.rmSync(temporaryParent, { recursive: true, force: true }); } catch (error) { output.appendLine(`Temporary cleanup failed: ${String(error)}`); } });
    worker = active;
    const timeout = setTimeout(() => { if (token === generation) { void active.terminate(); fail('Analysis timed out after 120 seconds. Narrow the workspace.'); } }, 120000);
    function fail(message: string): void {
      if (token !== generation) return;
      clearTimeout(timeout); worker = undefined; report = undefined; diagnostics.clear(); updateStatusBar(undefined);
      output.appendLine(message); send({ type: 'error', message }); void vscode.window.showErrorMessage(`Code X-Ray: ${message}`);
    }
    let responded = false;
    active.on('message', (message: { ok: boolean; report?: Report; error?: string }) => {
      responded = true; clearTimeout(timeout);
      if (token !== generation) return;
      worker = undefined;
      if (!message.ok || !message.report) { fail(message.error ?? 'Analysis failed.'); return; }
      report = message.report; publishDiagnostics(report); updateStatusBar(report); send({ type: 'report', report, workspace: root!.name });
      output.appendLine(`${new Date().toISOString()} ${report.current.files.length} files, ${report.current.edges.length} dependencies, ${report.current.findings.length} findings.`);
    });
    active.on('error', error => fail(error.message));
    active.on('exit', code => { clearTimeout(timeout); if (!responded && token === generation && worker === active) fail(`Analysis worker exited (${code}).`); });
  }
  async function exportReport(): Promise<void> {
    if (!report) { void vscode.window.showInformationMessage('Analyze the project before exporting.'); return; }
    const uri = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.joinPath(root!.uri, 'code-x-ray-report.json'), filters: { JSON: ['json'] } });
    if (uri) await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(report, null, 2) + '\n'));
  }
  async function exportImage(dataUrl: unknown): Promise<void> {
    const prefix = 'data:image/png;base64,';
    if (!root || !report || typeof dataUrl !== 'string' || !dataUrl.startsWith(prefix) || dataUrl.length > 25 * 1024 * 1024) return;
    const uri = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.joinPath(root.uri, 'code-x-ray-map.png'), filters: { PNG: ['png'] } });
    if (uri) await vscode.workspace.fs.writeFile(uri, Buffer.from(dataUrl.slice(prefix.length), 'base64'));
  }
  async function openEvidence(file: unknown, line: unknown, baseline: unknown): Promise<void> {
    if (!root || !report || typeof file !== 'string' || typeof line !== 'number' || !Number.isSafeInteger(line) || line < 1) return;
    if (baseline) { void vscode.window.showInformationMessage('Historical evidence: line numbers refer to the baseline. Use Git history to inspect deleted or changed code.'); return; }
    if (!report.current.files.some(node => node.id === file)) return;
    const rootPath = fs.realpathSync(root.uri.fsPath); const candidate = path.resolve(rootPath, file);
    if (!isInside(rootPath, candidate) || !fs.existsSync(candidate) || !isInside(rootPath, fs.realpathSync(candidate))) return;
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(candidate)); const target = Math.min(line - 1, doc.lineCount - 1);
    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, selection: new vscode.Range(target, 0, target, 0), preview: true });
  }
  async function compare(): Promise<void> {
    if (!await chooseRoot()) return;
    const value = await vscode.window.showInputBox({ title: 'Compare working tree with Git revision', value: revision ?? 'HEAD', prompt: 'Examples: HEAD, main, HEAD~1 or a commit hash. Empty = current only.' });
    if (value === undefined) return;
    revision = value.trim() || undefined;
    if (!panel) await open(); else await refresh();
  }
  async function open(): Promise<void> {
    if (!await chooseRoot()) return;
    if (panel) { panel.reveal(vscode.ViewColumn.Beside); return; }
    panel = vscode.window.createWebviewPanel('codeXRay.map', 'Code X-Ray', vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')] });
    const webview = panel.webview; const nonce = randomBytes(24).toString('hex');
    const script = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview.js'));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview.css'));
    webview.onDidReceiveMessage((message: unknown) => {
      if (!message || typeof message !== 'object') return;
      const data = message as Record<string, unknown>;
      const task = async () => {
        if (data.type === 'ready') { if (report) send({ type: 'report', report, workspace: root!.name }); else await refresh(); }
        if (data.type === 'refresh') await refresh();
        if (data.type === 'compare') await compare();
        if (data.type === 'export') await exportReport();
        if (data.type === 'export-image') await exportImage(data.dataUrl);
        if (data.type === 'open') await openEvidence(data.file, data.line, data.baseline);
      };
      void task().catch(error => { output.appendLine(String(error)); send({ type: 'error', message: String(error) }); });
    }, undefined, context.subscriptions);
    webview.html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'none'; font-src ${webview.cspSource};"><link rel="stylesheet" href="${style}"></head><body><div id="root"></div><script nonce="${nonce}" src="${script}"></script></body></html>`;
    panel.onDidDispose(() => { panel = undefined; ++generation; clearTimeout(timer); if (worker) void worker.terminate(); worker = undefined; }, undefined, context.subscriptions);
  }
  for (const [command, handler] of [['codeXRay.open', open], ['codeXRay.refresh', refresh], ['codeXRay.compare', compare], ['codeXRay.export', exportReport]] as const) context.subscriptions.push(vscode.commands.registerCommand(command, handler));
  const watcher = vscode.workspace.createFileSystemWatcher('**/*');
  const schedule = (uri: vscode.Uri) => {
    if (!panel || !root || !isInside(root.uri.fsPath, uri.fsPath) || !vscode.workspace.getConfiguration('codeXRay').get('autoRefresh', true)) return;
    const relative = path.relative(root.uri.fsPath, uri.fsPath);
    if (relative.split(path.sep).some(part => ['node_modules', '.git', 'dist', 'build', '.next', '.test-build', 'coverage'].includes(part))) return;
    if (!/\.[cm]?[jt]sx?$|(?:^|[/\\])(?:tsconfig[^/\\]*|jsconfig|package|code-x-ray.config)\.json$/.test(relative)) return;
    clearTimeout(timer); timer = setTimeout(() => { void refresh(); }, Math.max(300, vscode.workspace.getConfiguration('codeXRay').get('debounceMs', 1200)));
  };
  context.subscriptions.push(watcher, watcher.onDidChange(schedule), watcher.onDidCreate(schedule), watcher.onDidDelete(schedule), { dispose() { ++generation; clearTimeout(timer); if (worker) void worker.terminate(); panel?.dispose(); } });
}
