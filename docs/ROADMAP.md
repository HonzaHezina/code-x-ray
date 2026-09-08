# Roadmap with acceptance criteria

## Delivered in 0.1

File-level TypeScript/JavaScript map, import kinds and evidence, cycles, explicit directory boundaries, fan-out/size signals, read-only Git comparison, overlay, Problems integration, local JSON CLI, bounded worker execution, test fixtures, packaging and CI.

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

## P2 — better architecture signals

- Scope-aware CommonJS resolution to eliminate shadowed require false positives.
- Token-based duplicate candidates with side-by-side evidence; never assert semantic equivalence.
- Change coupling from bounded Git history with minimum sample sizes and rename handling.
- Domain grouping as explicit configuration, not AI-invented certainty.
- CI policy for only newly introduced errors relative to a specified baseline, plus SARIF output.

## P3 — optional semantic and runtime layers

Function-level call graph with labeled confidence/limitations, OpenTelemetry trace overlay, optional local or opt-in LLM explanations grounded in cited graph evidence. Each needs a real user case and measured review benefit first.

## Product experiment

Use 5–10 actual AI changes. Record review time, architectural issues correctly found and false positives with and without the map. Do not use the graph's appearance or a synthetic quality score as the success criterion.
