# Architecture and decisions

## Data flow

1. VS Code chooses one trusted local filesystem workspace root. In SSH/WSL the extension must run on the workspace host.
2. A new Node worker receives `{ root, revision? }`; a newer scan terminates the older worker and uses a generation token to reject stale results.
3. Core loads declarative JSON config, enumerates supported saved source files, uses TypeScript ASTs and module resolution, and builds a versioned graph.
4. Rules evaluate the graph; evidence retains original source coordinates and import text.
5. When comparing, read-only Git commands materialize bounded blobs in a private temporary folder. No checkout, shell command concatenation, filters, hooks or install commands. The current X-Ray policy is applied to both graphs. The extension also owns the worker's temporary parent directory and removes it on worker exit, including forced cancellation (which cannot rely on worker finally blocks). A hard OS/host crash may still leave temporary files.
6. Core returns `Report`. Extension publishes current diagnostics and sends the report to a CSP-protected React/Cytoscape webview. The webview never gets filesystem authority.
7. Source-opening messages are checked against the current graph and realpath containment. JSON export uses an explicit Save dialog.

## Module contracts

`model.ts`: Analysis, FileNode, Dependency, Evidence, Finding, Config, Report, GraphDiff.

`analyzer.ts`: `analyze(root): Analysis`. Deterministic traversal, root compiler config, facts and coverage notices. Does not typecheck the user's application or construct an interprocedural call graph.

`rules.ts`: iterative strongly connected components + configured structural rules. Cycle IDs depend on sorted membership; a changed cycle membership can appear as resolved + new.

`diff.ts`: compares file content hashes and edge identities. Renames are remove/add; line-number movement alone does not change an edge identity. A finding with the same ID but a changed message is not considered new.

`git.ts`: `analyzeRequest({root, revision?}): Promise<Report>`. One real commit resolved with `rev-parse --verify --end-of-options`. `ls-tree` supplies object IDs, `cat-file --batch-check` bounds byte sizes, `cat-file --batch` reads content. Temporary snapshot is removed in finally.

## Deliberate choices

- TypeScript 5.9 Compiler API is pinned for reproducibility; upgraded APIs need extraction regression tests. A full TypeChecker is unnecessary for this first file-level import graph.
- React + Cytoscape for inspectable UI and canvas graph. All JS/CSS is bundled. The graph has a fixed dark canvas for a consistent semantic palette; other controls inherit VS Code theme variables.
- Imports are separated by kind/type-only status; parallel edges are allowed. Fan-in/out use unique internal target/source files.
- AST parses are per file. Root compiler options drive resolution; project references and nearest nested tsconfigs are explicitly deferred.
- Full scans happen in a worker, not incrementally. Accurate incremental invalidation (configs, renames, resolver changes, transitive impact) is a future bounded task.
- Map positions are cached only in the current webview session. Directory lanes provide the initial layout; filters do not continuously rerun a force-directed layout.
- All source text remains local. Exported JSON includes paths, import specifiers and hashes but no complete file content.
- `require()` detection is syntactic. Runtime edges may include false positives if the identifier is shadowed. Keep the notice until proper scope analysis is implemented.
- Source walks do not follow symlinks; compiler resolution may read declaration/config files to resolve modules. Workspace Trust and bounded source scans are required, not a general sandbox for adversarial filesystems.
- Historical snapshots do not share live node_modules. This avoids silently claiming historical dependency fidelity, but unresolved package config extensions may affect comparisons.

## Positioning relative to existing tools

Researched 2026-09-08 to check for redundant effort before investing further. None of the individual ideas here are novel; the combination is the differentiator, and it is narrower than the README's framing might suggest.

- **[dependency-cruiser](https://github.com/sverweij/dependency-cruiser)** is the closest functional overlap: mature, free, forbidden-dependency rules, cycle detection, CI gate, mermaid/dot/html output, better multi-language and monorepo support than this project. It is CLI-first — output is a static graph file, not a live interactive panel — and has no Git-baseline overlay in one view. A disciplined team could get most of the "rules + cycles + CI gate" value from dependency-cruiser + `eslint-plugin-boundaries` today with near-zero build effort.
- **[Madge](https://www.npmjs.com/package/madge)** — simpler JS/TS graph + cycle detection, no rule engine, no VS Code panel.
- **[CodeViz.ai](https://www.codeviz.ai/use-cases/code-review)** and **Revieko** are funded 2026 SaaS competitors targeting the identical stated use case ("review a PR with full architectural context, see what changed and its impact") — but as paid, partially cloud, LLM/embedding-based products, not local deterministic analysis.
- **[CodeSee](https://www.codesee.io/)** occupied this exact positioning (PR review + onboarding maps) as a cloud SaaS; development has slowed and folded partly into GitKraken.
- **[Sourcetrail](https://github.com/CoatiSoftware/Sourcetrail)** (discontinued) proved the "interactive cross-language graph inside a dev tool" concept had real users, but did not survive as a maintained product — a caution about scope creep and sustainability, not a signal the concept is wrong.
- Nx/Turborepo project graphs do live interactive click-through graphs too, but scoped to monorepo task orchestration, not general TS import architecture or boundary rules.
- `eslint-plugin-boundaries` / `eslint-plugin-import` (`no-cycle`) enforce the same boundary/cycle concepts as CI-time lint assertions with no visualization at all.

**Conclusion for roadmap priority:** the CI/rules half of this project (P2 items like SARIF output, more rule types) competes with mature free tooling and should not be where further effort concentrates. The differentiated, currently unmatched-for-free-and-local half is the live in-editor panel + Git overlay + evidence-first data model — that is where P1 "visual review ergonomics" and the "Product experiment" (see docs/ROADMAP.md) should keep priority.

## Out of scope for 0.1

Function-level calling relationships, runtime traces, duplicate detection, change coupling, AML, global language support, automatic refactoring, remote services, LLM explanations, marketplace publication.

## Dependency graph of this repository

The root `code-x-ray.config.json` prevents core → extension/webview and webview → extension imports. The rule engine validates internal directory edges; external package boundaries (e.g. core importing vscode) are additionally enforced by contributor review, not automatically by the current rule schema.
