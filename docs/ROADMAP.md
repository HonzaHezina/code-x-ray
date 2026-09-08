# Roadmap with acceptance criteria

## Delivered in 0.1

File-level TypeScript/JavaScript map, import kinds and evidence, cycles, explicit directory boundaries, fan-out/size signals, read-only Git comparison, overlay, Problems integration, local JSON CLI, bounded worker execution, test fixtures, packaging and CI.

**2026-09-08 UI/ergonomics addendum** (no new dependency): summary stat cards + clean/warning/error status badge derived from existing finding counts; per-rule icons in the findings list; fade-in animation for newly rendered nodes; hover highlight on nodes/edges; a real focus mode that dims unrelated elements on selection; flexible canvas height; simplified toolbar (advanced filters collapsed behind "More filters"); a `node.modified` color change (blue, was amber) to stop colliding with the finding/risk amber; file isolation (ego-graph: show only the selected file and its direct neighbors); status bar item with live finding counts; "Copy summary" (Markdown) and "Copy as Mermaid" (bounded flowchart, ≤30 nodes) clipboard export for pasting into PR descriptions; "Export PNG" of the current canvas. All covered by `npm run check` including a new smoke assertion for the PNG export message path.

## P0 — validate on the actual developer workstation

- Run F5 demo and packaged VSIX in VS Code.
- Verify 4 nodes / 5 edges / 2 findings and each source link.
- Test fresh empty folder, multi-root selection, reload/disposal and untrusted workspace.
- Edit/save source, delete a file, introduce a syntax error, then recover. Previous report must never look current after an error.
- Create a real baseline commit; modify, delete and add dependencies; verify all three map modes against Git diff.
- Verify cancellation when several saves occur and close the panel while scanning.
- Check dark/light themes and keyboard alternative. Record host/OS versions and results in VALIDATION.md.

## P1 — historical evidence

Implement a read-only virtual document provider backed by validated Git object IDs. Acceptance: a deleted baseline file opens at the exact historical line; current file is not substituted; text is read without checkout or arbitrary rev/path interpolation; caches are bounded.

## P1 — compiler project fidelity

Map files to nearest owning tsconfig, handle project references and explicitly represent workspace package edges. Acceptance: fixtures with conflicting aliases, nested configs and pnpm-style packages; current/baseline resolution policy documented and verified; missing package config does not silently look equivalent.

## P1 — incremental analysis

Cache file AST-derived facts and resolution context. Invalidate on rename, config edits, package metadata changes and dependency disappearance. Acceptance: graph byte-equivalent (except diagnostic timing) to a fresh full scan after scripted edits; measure first scan and incremental p50/p95 on a real 1000-file repo; UI remains responsive; stale results never replace new ones.

## P1 — visual review ergonomics

Persist layout by workspace + graph schema. Add clear directory group boundaries, selection-aware filtering and search that retains relevant neighbors. Acceptance: unchanged nodes do not jump across refresh/restart; new nodes never overlap; keyboard users can inspect all evidence; large-map filtering explicitly indicates hidden nodes/edges.

Partially delivered 2026-09-08: selection-aware filtering exists as file isolation (ego-graph) and focus/dim highlighting. Still open: cross-**restart** layout persistence (today positions only survive within one open webview session), directory group boundary lines on canvas (lanes exist but aren't visually bounded), a hierarchical/dagre layout alternative to the fixed directory grid, and directory collapse into meta-nodes for large graphs.

## P2 — better architecture signals

Lower priority than previously scoped — competitive research (2026-09-08, see docs/ARCHITECTURE.md "Positioning relative to existing tools") found dependency-cruiser + eslint-plugin-boundaries already cover most of this ground for free and better for multi-language/monorepo cases. Effort is better spent on the P1 items above and the Product experiment below, which are the actually differentiated half of this project.

- Scope-aware CommonJS resolution to eliminate shadowed require false positives.
- Token-based duplicate candidates with side-by-side evidence; never assert semantic equivalence.
- Change coupling from bounded Git history with minimum sample sizes and rename handling.
- Domain grouping as explicit configuration, not AI-invented certainty.
- CI policy for only newly introduced errors relative to a specified baseline, plus SARIF output.

## P3 — optional semantic and runtime layers

Function-level call graph with labeled confidence/limitations, OpenTelemetry trace overlay, optional local or opt-in LLM explanations grounded in cited graph evidence. Each needs a real user case and measured review benefit first.

## Product experiment

**This is now the critical-path item, not an optional nice-to-have — see docs/ARCHITECTURE.md "Positioning relative to existing tools".** Being technically solid is not sufficient: this has to beat "run dependency-cruiser and eyeball the dot file" on a real developer's actual workflow, not just look better on paper. If it doesn't measurably win that comparison, the differentiated half of this project (live local panel + Git overlay + evidence-first UX) isn't earning its cost, and that's more informative than any amount of further feature work.

Use 5–10 actual AI changes. Record review time, architectural issues correctly found and false positives with and without the map. Do not use the graph's appearance or a synthetic quality score as the success criterion.
