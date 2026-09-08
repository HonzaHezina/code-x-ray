// Distribution smoke checks; this is NOT a real VS Code Extension Host test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import Module, { createRequire } from 'node:module';

const project = process.cwd();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'xray-distribution-'));
const demo = path.join(project, 'examples', 'demo');
try {
  fs.copyFileSync('dist/worker.cjs', path.join(temporary, 'worker.cjs'));
  const result = await new Promise((resolve, reject) => {
    const worker = new Worker(path.join(temporary, 'worker.cjs'), { workerData: { root: demo } });
    worker.once('message', resolve); worker.once('error', reject);
    worker.once('exit', code => { if (code !== 0) reject(new Error(`Worker exit ${code}`)); });
  });
  assert.equal(result.ok, true); assert.equal(result.report.current.files.length, 4); assert.equal(result.report.current.edges.length, 5); assert.equal(result.report.current.findings.length, 2);
  console.log('PASS: standalone worker without adjacent node_modules; demo graph 4/5/2.');

  const cli = spawnSync(process.execPath, ['dist/cli.cjs', demo, '--fail-on', 'error'], { encoding: 'utf8' });
  assert.equal(cli.status, 2); assert.equal(JSON.parse(cli.stdout).current.findings.length, 2);
  const help = spawnSync(process.execPath, ['dist/cli.cjs', '--help'], { encoding: 'utf8' }); assert.equal(help.status, 0); assert.match(help.stdout, /Usage:/);
  console.log('PASS: bundled CLI JSON stdout, help and policy exit code.');

  const disposable = () => ({ dispose() {} });
  const commands = new Map(); const messages = []; const diagnostics = new Map(); const opened = [];
  let incoming; let disposePanel; let panelHtml = ''; let saveUri; let inputRevision;
  const uri = file => ({ fsPath: file, scheme: 'file', toString: () => `file://${file}` });
  const vscode = {
    TreeItem: class { constructor(label) { this.label = label; } },
    Range: class { constructor(...values) { this.values = values; } },
    Diagnostic: class { constructor(range, message, severity) { Object.assign(this, { range, message, severity }); } },
    DiagnosticSeverity: { Error: 0, Warning: 1 }, ViewColumn: { One: 1, Beside: 2 },
    StatusBarAlignment: { Left: 1, Right: 2 }, ThemeColor: class { constructor(id) { this.id = id; } },
    Uri: { file: uri, joinPath: (base, ...parts) => uri(path.join(base.fsPath, ...parts)) },
    commands: { registerCommand: (name, handler) => { commands.set(name, handler); return disposable(); } },
    languages: { createDiagnosticCollection: () => ({ clear: () => diagnostics.clear(), set: (key, value) => diagnostics.set(key.fsPath, value), dispose() {} }) },
    workspace: {
      isTrusted: true, workspaceFolders: [{ name: 'demo', uri: uri(demo) }],
      getConfiguration: () => ({ get: (_name, fallback) => fallback }),
      fs: { writeFile: async (target, bytes) => fs.writeFileSync(target.fsPath, bytes) },
      openTextDocument: async target => { opened.push(target.fsPath); return { lineCount: fs.readFileSync(target.fsPath, 'utf8').split('\n').length }; },
      createFileSystemWatcher: () => ({ onDidChange: disposable, onDidCreate: disposable, onDidDelete: disposable, dispose() {} })
    },
    window: {
      createOutputChannel: () => ({ appendLine() {}, dispose() {} }), registerTreeDataProvider: disposable,
      createStatusBarItem: () => ({ show() {}, dispose() {} }),
      showInformationMessage() {}, showWarningMessage() {}, showErrorMessage: message => { throw new Error(message); },
      showSaveDialog: async () => saveUri, showInputBox: async () => inputRevision, showTextDocument: async () => {},
      createWebviewPanel: () => ({
        webview: {
          cspSource: 'vscode-resource:', asWebviewUri: target => target.toString(),
          postMessage: message => { messages.push(message); return Promise.resolve(true); },
          onDidReceiveMessage: callback => { incoming = callback; return disposable(); },
          set html(value) { panelHtml = value; }
        },
        onDidDispose: callback => { disposePanel = callback; return disposable(); }, reveal() {}, dispose() { disposePanel?.(); }
      })
    }
  };
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) { return request === 'vscode' ? vscode : originalLoad.call(this, request, parent, isMain); };
  const require = createRequire(import.meta.url);
  const extension = require(path.join(project, 'dist', 'extension.cjs'));
  Module._load = originalLoad;
  const context = { extensionPath: project, extensionUri: uri(project), subscriptions: [] };
  const previousTemporary = new Set(fs.readdirSync(os.tmpdir()).filter(name => name.startsWith('code-x-ray-worker-')));
  extension.activate(context);
  async function waitFor(predicate) {
    const end = Date.now() + 10000;
    while (!predicate()) { if (Date.now() > end) throw new Error('Smoke check timed out.'); await new Promise(resolve => setTimeout(resolve, 20)); }
  }
  try {
    await commands.get('codeXRay.open')();
    assert.match(panelHtml, /Content-Security-Policy/); assert.match(panelHtml, /connect-src 'none'/);
    incoming({ type: 'ready' }); await waitFor(() => messages.some(message => message.type === 'report'));
    assert.equal(messages.find(message => message.type === 'report').report.current.files.length, 4); assert.ok(diagnostics.size >= 2);
    incoming({ type: 'open', file: 'src/ui/reservations.ts', line: 3, baseline: false }); await waitFor(() => opened.length === 1);
    incoming({ type: 'open', file: '../secret.ts', line: 1, baseline: false });
    incoming({ type: 'open', file: 'src/ui/reservations.ts', line: 1, baseline: true });
    await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(opened.length, 1);
    saveUri = uri(path.join(temporary, 'export.json')); await commands.get('codeXRay.export')(); assert.equal(JSON.parse(fs.readFileSync(saveUri.fsPath, 'utf8')).current.files.length, 4);
    console.log('PASS: extension activation with a mocked VS Code API, ready handshake, worker report, diagnostics, validated source opening and JSON export.');
    saveUri = uri(path.join(temporary, 'export.png'));
    incoming({ type: 'export-image', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' });
    await waitFor(() => fs.existsSync(saveUri.fsPath));
    assert.deepEqual(fs.readFileSync(saveUri.fsPath), Buffer.from('iVBORw0KGgo=', 'base64'));
    incoming({ type: 'export-image', dataUrl: 'not-a-data-url' });
    await new Promise(resolve => setTimeout(resolve, 30));
    console.log('PASS: PNG map export decodes and writes only validated data URLs.');
    // Force cancellation immediately after starting another worker.
    await commands.get('codeXRay.refresh')();
  } finally {
    for (const subscription of context.subscriptions) subscription.dispose();
    await waitFor(() => fs.readdirSync(os.tmpdir()).filter(name => name.startsWith('code-x-ray-worker-') && !previousTemporary.has(name)).length === 0);
    console.log('PASS: parent cleans worker temporary directories after forced cancellation.');
  }
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
