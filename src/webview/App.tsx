import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import cytoscape, { type Core, type ElementDefinition } from 'cytoscape';
import type { Analysis, Dependency, FileNode, Finding, Report } from '../core/model';
import './style.css';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
declare global { interface Window { __CODE_XRAY_DEMO__?: Report } }
const host = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : { postMessage: (_message: unknown) => {} };
type Mode = 'current' | 'baseline' | 'overlay';
const openFile = (file: string, line = 1, baseline = false) => host.postMessage({ type: 'open', file, line, baseline });

function App(): React.JSX.Element {
  const [report, setReport] = useState<Report | undefined>(window.__CODE_XRAY_DEMO__);
  const [workspace, setWorkspace] = useState('Workspace');
  const [busy, setBusy] = useState(!window.__CODE_XRAY_DEMO__);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<Mode>('current');
  const [query, setQuery] = useState('');
  const [showTypes, setShowTypes] = useState(true);
  const [selected, setSelected] = useState('');
  const [selectedFinding, setSelectedFinding] = useState('');
  const [selectedEdge, setSelectedEdge] = useState('');
  const [onlyChanges, setOnlyChanges] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  const graph = useRef<Core | null>(null);
  const positions = useRef(new Map<string, { x: number; y: number }>());
  const snapshot: Analysis | undefined = mode === 'baseline' ? report?.baseline : report?.current;
  const diff = report?.diff;
  const changed = useMemo(() => new Set([...(diff?.addedFiles ?? []), ...(diff?.modifiedFiles ?? []), ...(diff?.removedFiles ?? [])]), [diff]);
  const data = useMemo(() => {
    const files = new Map<string, FileNode>(); const edges = new Map<string, Dependency>();
    if (mode === 'overlay' && report?.baseline) { report.baseline.files.forEach(file => files.set(file.id, file)); report.baseline.edges.forEach(edge => edges.set(edge.id, edge)); }
    snapshot?.files.forEach(file => files.set(file.id, file)); snapshot?.edges.forEach(edge => edges.set(edge.id, edge));
    return { files: [...files.values()], edges: [...edges.values()] };
  }, [report, snapshot, mode]);
  const visibleFiles = useMemo(() => data.files.filter(file => file.id.toLowerCase().includes(query.toLowerCase()) && (!onlyChanges || !diff || changed.has(file.id))), [data.files, query, onlyChanges, diff, changed]);
  const selectedNode = data.files.find(file => file.id === selected);
  const finding = snapshot?.findings.find(item => item.id === selectedFinding);
  const edge = data.edges.find(item => item.id === selectedEdge);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const message = event.data;
      if (message?.type === 'report') { setReport(message.report); setWorkspace(message.workspace); setBusy(false); setError(''); setSelectedFinding(''); setSelectedEdge(''); }
      if (message?.type === 'status') { setBusy(message.busy); setError(''); }
      if (message?.type === 'error') { setError(message.message); setBusy(false); }
    };
    window.addEventListener('message', receive); host.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', receive);
  }, []);

  useEffect(() => {
    if (!canvas.current) return;
    const cy = cytoscape({ container: canvas.current, elements: [], minZoom: 0.15, maxZoom: 3, wheelSensitivity: 0.25,
      style: [
        { selector: 'node', style: { label: 'data(label)', 'font-size': 11, color: '#cdd8e7', 'text-valign': 'bottom', 'text-margin-y': 9, 'background-color': '#7195bc', width: 'data(size)', height: 'data(size)', 'border-width': 2, 'border-color': '#a1b8d0' } },
        { selector: 'edge', style: { width: 1.4, 'line-color': '#667b92', 'target-arrow-color': '#667b92', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', opacity: 0.6 } },
        { selector: '.typeOnly', style: { 'line-style': 'dashed', opacity: 0.4 } },
        { selector: 'node.risk', style: { 'border-color': '#ffb454', 'border-width': 4 } },
        { selector: '.added', style: { 'line-color': '#62ddb0', 'target-arrow-color': '#62ddb0', 'border-color': '#62ddb0', 'border-width': 4, width: 2.5 } },
        { selector: 'node.added', style: { width: 'data(size)' } },
        { selector: 'node.modified', style: { 'background-color': '#d5ad54' } },
        { selector: '.removed', style: { 'line-color': '#f48496', 'target-arrow-color': '#f48496', 'line-style': 'dashed', 'border-color': '#f48496', 'border-style': 'dashed', opacity: 0.65 } },
        { selector: '.focused', style: { 'border-color': '#e2e9f1', 'border-width': 5, 'line-color': '#e2e9f1', 'target-arrow-color': '#e2e9f1', opacity: 1 } },
        { selector: 'node:selected', style: { 'overlay-opacity': 0.12, 'overlay-color': '#ffffff' } }
      ] });
    graph.current = cy;
    cy.on('tap', 'node', event => { setSelected(event.target.id()); setSelectedFinding(''); setSelectedEdge(''); });
    cy.on('tap', 'edge', event => { setSelectedEdge(event.target.data('edgeId')); setSelectedFinding(''); setSelected(''); });
    cy.on('dragfree', 'node', event => positions.current.set(event.target.id(), { ...event.target.position() }));
    const resize = new ResizeObserver(() => cy.resize()); resize.observe(canvas.current);
    return () => { resize.disconnect(); cy.destroy(); graph.current = null; };
  }, []);

  useEffect(() => {
    const cy = graph.current; if (!cy) return;
    cy.nodes().forEach(node => { positions.current.set(node.id(), { ...node.position() }); });
    // Directory lanes, deterministic initial order, retained positions across analyses.
    const groups = [...new Set(data.files.map(file => file.group))].sort();
    const groupCounts = new Map<string, number>();
    for (const file of [...data.files].sort((a, b) => a.id.localeCompare(b.id))) {
      const row = groupCounts.get(file.group) ?? 0; groupCounts.set(file.group, row + 1);
      if (!positions.current.has(file.id)) {
        const point = { x: groups.indexOf(file.group) * 260 + (row % 2) * 115, y: Math.floor(row / 2) * 105 };
        const occupied = new Set([...positions.current.values()].map(value => `${value.x},${value.y}`));
        while (occupied.has(`${point.x},${point.y}`)) point.y += 105;
        positions.current.set(file.id, point);
      }
    }
    const visible = visibleFiles.slice(0, 800); const ids = new Set(visible.map(file => file.id));
    const addedFiles = new Set(diff?.addedFiles); const removedFiles = new Set(diff?.removedFiles); const modifiedFiles = new Set(diff?.modifiedFiles);
    const addedEdges = new Set(diff?.addedEdges); const removedEdges = new Set(diff?.removedEdges);
    const risks = new Set(snapshot?.findings.flatMap(item => item.nodes));
    const elements: ElementDefinition[] = visible.map(file => ({ data: { id: file.id, label: file.id, size: 22 + Math.min(32, Math.sqrt(file.lines) * 1.3) }, position: positions.current.get(file.id), classes: [risks.has(file.id) ? 'risk' : '', mode !== 'baseline' && addedFiles.has(file.id) ? 'added' : '', mode !== 'baseline' && modifiedFiles.has(file.id) ? 'modified' : '', mode === 'overlay' && removedFiles.has(file.id) ? 'removed' : ''].join(' ') }));
    for (const link of data.edges) if (ids.has(link.source) && ids.has(link.target) && (showTypes || !link.typeOnly)) elements.push({ data: { id: `edge:${link.id}`, edgeId: link.id, source: link.source, target: link.target }, classes: [link.typeOnly ? 'typeOnly' : '', mode !== 'baseline' && addedEdges.has(link.id) ? 'added' : '', mode === 'overlay' && removedEdges.has(link.id) ? 'removed' : ''].join(' ') });
    const wasEmpty = cy.nodes().length === 0;
    cy.batch(() => { cy.elements().remove(); cy.add(elements); });
    if (wasEmpty && elements.length) cy.fit(undefined, 55);
  }, [data, visibleFiles, snapshot, diff, mode, showTypes]);

  useEffect(() => {
    const cy = graph.current; if (!cy) return;
    cy.elements().removeClass('focused');
    if (finding) finding.nodes.forEach(id => cy.getElementById(id).addClass('focused'));
    if (selected) cy.getElementById(selected).closedNeighborhood().addClass('focused');
    if (edge) cy.getElementById(`edge:${edge.id}`).addClass('focused');
  }, [selected, finding, edge, data, visibleFiles]);

  const historical = mode === 'baseline';
  const related = data.edges.filter(link => link.source === selected || link.target === selected);
  function selectFinding(item: Finding): void { setSelectedFinding(item.id); setSelected(''); setSelectedEdge(''); }
  return <main>
    <header><div><div className="eyebrow">ARCHITECTURE OBSERVATORY</div><h1>Code X-Ray <span>0.1</span></h1><p>{workspace} · Saved files · Local analysis</p></div><div className="actions"><button onClick={() => host.postMessage({ type: 'refresh' })} disabled={busy}>Refresh</button><button onClick={() => host.postMessage({ type: 'compare' })}>Compare Git…</button><button disabled={!report || busy || !!error} onClick={() => host.postMessage({ type: 'export' })}>Export JSON</button></div></header>
    {error && <div className="error" role="alert">{error} {report && 'The map below is the previous successful result.'}</div>}
    <div className="summary" aria-live="polite">{busy ? 'Analyzing…' : snapshot ? `${snapshot.files.length} files · ${snapshot.edges.length} dependencies · ${snapshot.findings.length} findings` : 'Open a folder and run an analysis.'}<span>{report?.revision ? `Baseline ${report.revision.slice(0, 10)}` : 'No Git baseline selected'}</span></div>
    <div className="toolbar"><label>View <select value={mode} onChange={event => { setMode(event.target.value as Mode); setSelectedFinding(''); setSelectedEdge(''); }}><option value="current">Current</option><option value="baseline" disabled={!report?.baseline}>Baseline</option><option value="overlay" disabled={!report?.baseline}>Changes overlay</option></select></label><label className="search">Find file <input value={query} onChange={event => setQuery(event.target.value)} placeholder="src/services/…" /></label><label><input type="checkbox" checked={showTypes} onChange={event => setShowTypes(event.target.checked)} /> Type imports</label><label><input type="checkbox" checked={onlyChanges} disabled={!diff} onChange={event => setOnlyChanges(event.target.checked)} /> Changed files only</label><button onClick={() => graph.current?.fit(undefined, 55)}>Fit map</button></div>
    {diff && <div className="changes">Files: +{diff.addedFiles.length} / −{diff.removedFiles.length} / {diff.modifiedFiles.length} modified <span>Dependencies: +{diff.addedEdges.length} / −{diff.removedEdges.length}</span><span>Findings: {diff.newFindings.length} new / {diff.resolvedFindings.length} resolved</span></div>}
    <div className="workspace"><section className="map-section"><div ref={canvas} className="graph" role="img" aria-label="Interactive file dependency map. Arrows point from importing file to dependency. Use the file list below for keyboard navigation." /><div className="legend"><span>● File size = physical lines</span><span className="amber">◉ Finding</span>{diff && <><span className="green">+ Added</span><span className="amber">● Modified</span><span className="pink">− Removed (overlay)</span></>}<span>Dashed = type import / removed edge</span></div>{visibleFiles.length > 800 && <p className="warning">Map limited to 800 of {visibleFiles.length} matching files. Narrow the file filter. The report contains the full analysis.</p>}{snapshot?.files.length === 0 && <p className="warning">No supported source files found. Open a TypeScript or JavaScript project.</p>}</section>
    <aside><h2>{finding ? 'Finding evidence' : edge ? 'Dependency evidence' : selectedNode ? 'File detail' : 'Inspect the architecture'}</h2>
      {!finding && !edge && !selectedNode && <p>Select a file, dependency or finding. Inspect the source before deciding whether a pattern is harmful.</p>}
      {selectedNode && <><h3>{selectedNode.id}</h3><dl><dt>Physical lines</dt><dd>{selectedNode.lines}</dd><dt>Functions</dt><dd>{selectedNode.functions}</dd><dt>Branch constructs</dt><dd>{selectedNode.branches}</dd><dt>Internal fan-in / out</dt><dd>{selectedNode.fanIn} / {selectedNode.fanOut}</dd></dl><button onClick={() => openFile(selectedNode.id, 1, historical || !!diff?.removedFiles.includes(selectedNode.id))}>Open source</button><h3>Dependencies</h3>{related.slice(0, 100).map(link => <button className="text-button" key={link.id} onClick={() => { setSelectedEdge(link.id); setSelected(''); }}>{link.source === selected ? '→ ' + link.target : '← ' + link.source}{link.typeOnly ? ' (type)' : ''}</button>)}</>}
      {finding && <><p className={finding.severity === 'error' ? 'pink' : 'amber'}>{finding.message}</p><EvidenceList evidence={finding.evidence} historical={historical} /></>}
      {edge && <><h3>{edge.source} → {edge.target}</h3><p>{edge.kind}{edge.typeOnly ? ' · type only' : ''}</p><EvidenceList evidence={edge.evidence} historical={historical || !!diff?.removedEdges.includes(edge.id)} /></>}
    </aside></div>
    <section className="findings"><h2>Findings <span>{snapshot?.findings.length ?? 0}</span></h2><p className="muted">Structural signals for review. A large file or dependency cycle is not automatically a defect.</p><div className="finding-list">{snapshot?.findings.map(item => <button className="finding" key={item.id} onClick={() => selectFinding(item)}><span className={item.severity === 'error' ? 'pill error-pill' : 'pill'}>{item.rule}</span><span>{item.message}</span>{diff?.newFindings.includes(item.id) && !historical && <strong className="green">NEW</strong>}</button>)}{snapshot?.findings.length === 0 && <p>No findings under the configured rules. This is not a correctness guarantee.</p>}</div></section>
    <details><summary>Analysis coverage & limitations ({snapshot?.warnings.length ?? 0} notices)</summary><p>{snapshot?.externalImports ?? 0} resolved external imports omitted · {snapshot?.unresolvedImports ?? 0} unresolved imports · {snapshot?.dynamicUnknown ?? 0} computed imports</p><p>File-level dependency map, not a call graph. Only the root compiler configuration is used. No runtime tracing, duplicate-code detection or AI inference. Historical snapshots have no node_modules.</p><ul>{snapshot?.warnings.slice(0, 200).map((warning, i) => <li key={i}>{warning}</li>)}</ul>{(snapshot?.warnings.length ?? 0) > 200 && <p>More notices are available in the JSON report.</p>}</details>
    <details><summary>Files — keyboard-accessible map alternative ({visibleFiles.length})</summary><div className="file-list">{visibleFiles.map(file => <button key={file.id} className="text-button" onClick={() => { setSelected(file.id); setSelectedFinding(''); setSelectedEdge(''); }}>{file.id}</button>)}</div></details>
  </main>;
}
function EvidenceList({ evidence, historical }: { evidence: Dependency['evidence']; historical: boolean }): React.JSX.Element {
  return <div><p className="muted">{historical ? 'Historical line numbers; inspect using Git history.' : 'Click to open the saved source.'}</p>{evidence.slice(0, 100).map((item, index) => <button className="text-button" key={index} onClick={() => openFile(item.file, item.line, historical)}>{item.file}:{item.line} {item.specifier && `“${item.specifier}”`}</button>)}{evidence.length > 100 && <p>Showing 100 evidence items; export JSON for all.</p>}</div>;
}
createRoot(document.getElementById('root')!).render(<App />);
