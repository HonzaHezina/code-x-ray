# Instructions for contributors and AI coding assistants

## Product goal

Help humans inspect architectural changes quickly. Visual evidence must remain traceable to actual source. This is a local VS Code extension, not a hosted website. The initial audience is Czech-speaking; keep Czech onboarding and English code/API identifiers.

## Before edits

Read README.md, docs/ARCHITECTURE.md, docs/ROADMAP.md and docs/VALIDATION.md. Inspect git status; preserve unrelated user edits. Select one bounded goal and state its acceptance criteria. Do not silently expand scope.

## Boundaries

- `src/core`: deterministic analysis, rules, Git snapshots, graph diff. No VS Code, React, DOM, network or LLM dependency. Node filesystem and read-only Git access are intentional.
- `src/extension`: VS Code commands, worker lifecycle, diagnostics and validated webview messaging. No analysis on the extension UI/event thread.
- `src/webview`: React/Cytoscape presentation; import only types from `src/core/model.ts`. No filesystem, Git, Node internals or remote resources.
- `src/cli.ts`: thin interface to core; JSON stdout, messages stderr, documented exit codes.
- Stable file IDs are POSIX relative paths. Edge identities must not depend on source line number or UI state. Graph schema is versioned.

## Accuracy and security

- Never label guessed relationships as facts. A static file import is not a runtime call.
- Surface unsupported resolution, parse issues, exclusions and incomplete analyses. No invented health score or defect probability.
- Respect Workspace Trust. Never execute project scripts, custom analyzers, arbitrary shell strings or code loaded from the project.
- Use argument arrays and `--end-of-options` where appropriate for Git. Never checkout, stash, reset or mutate the user's Git state during analysis.
- Keep temporary snapshots private, bounded and cleaned in finally. Do not follow source symlinks outside the chosen root.
- Validate every webview message and source-opening request; keep CSP and nonce. No HTML interpolation of project-controlled text.
- No telemetry or network requests. New AI integrations require an explicit product decision and opt-in.
- Own findings are review signals. Do not claim absence of findings proves correctness.

## Engineering

Keep TypeScript strict. Prefer small focused modules; no new service, database or heavy framework without a concrete need. Pin dependencies and commit package-lock.json. Do not vendor node_modules or commit generated dist/VSIX files. Keep third-party notices up to date.

Use named configuration fields with validation and documented limits. Do not weaken tests or architectural boundaries just to pass CI. Retain cancellation, stale-result protection and bounded processing when optimizing.

## Verification and handoff

Run `npm run check`, `node dist/cli.cjs . --fail-on error --out code-x-ray-report.json`, and `npm run package` for changes affecting distribution. Add regression tests for meaningful changes to extraction, graph semantics, Git handling or security boundaries. UI changes require an actual Extension Development Host check; document what was not tested.

Update docs with user-visible behavior and limitations. Summarize what changed, how verified and remaining risks. Do not say “production-ready” based only on unit tests. Do not publish to GitHub/Marketplace unless requested.
