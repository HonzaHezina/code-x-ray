# Validation of the delivered 0.1.0 source

Date: 2026-09-08. Local environment: Linux, Node.js 24.19.0, npm 11.9.0. Node 22 is the declared development minimum and configured CI version; the local run used Node 24.

## Automated checks

- `npm run typecheck`: strict TypeScript compilation of source and tests.
- `npm test`: 18 tests cover aliases and exact coordinates, cycles, type-only and mixed imports, re-exports, dynamic uncertainty, unresolved imports, exclusions/symlinks, invalid config, scan limits, parse warnings, stable diff identity, path containment, a 10000-node SCC chain, Git deletion/untracked changes, workspace subdirectories/spaces, revision option injection, policy equivalence and snapshot cleanup.
- `npm run build`: bundles extension, worker, browser JS/CSS and CLI; generates bundled dependency notices.
- `npm run smoke`: executes the bundled worker without adjacent node_modules, verifies the demo, bundled CLI JSON/exit codes and a **mocked VS Code API** activation/handshake/diagnostics/source opening/export flow. It also checks parent-owned temporary cleanup after forced cancellation.
- Self-analysis with `--fail-on error`: internal boundary rules pass; CSS import is reported as unsupported/unresolved rather than invented.
- Demo: 4 files, 5 dependency edges, 1 dependency-cycle finding, 1 UI-to-data boundary error, 0 coverage warnings.
- `npm run package`: creates a self-contained VSIX. Bundled worker/CLI include TypeScript; webview bundles React/Cytoscape. Package does not include node_modules, source maps or tests.
- `npm audit --omit=dev`: reported zero runtime dependency advisories at validation time. This is not a security certification or an audit of all development tooling.

## Not verified here

- A real graphical VS Code Extension Development Host, actual canvas rendering, mouse/touch layout and theme appearance. There was no usable VS Code GUI/browser automation session in this environment. A mocked API smoke check is not equivalent to the real host.
- Windows/macOS/remote VS Code. Linux + Windows GitHub Actions are supplied but have not run on GitHub yet.
- Performance on a large production monorepo or historical dependency fidelity across package versions.
- Marketplace installation/publication. Only the local VSIX is prepared.

## First manual acceptance pass in VS Code

1. `npm ci`, `npm run check`, F5. In the demo host verify 4 nodes and 2 findings.
2. Select the UI boundary finding and open its import line. Confirm Problems has the matching diagnostic.
3. Remove the direct database import/use from UI, save and confirm the boundary error disappears while the service cycle remains.
4. Reload the window. Verify activity-bar and command-palette entry points.
5. On a Git project, compare HEAD before/after adding and deleting imports. Check Current, Baseline and Changes overlay. Historical source links must warn instead of opening a misleading current line.
6. Rapidly save twice and close the map while scanning; no stale result or extension error should appear.
7. Verify empty folder, bad config, unsupported imports and Workspace Trust behavior.
8. Install the VSIX in normal VS Code and repeat open/evidence/export once.
9. Record host/OS versions and any fixes here. Add targeted regression tests for defects that can be tested without the UI.
