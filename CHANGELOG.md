# Changelog

## Unreleased

Webview UI/ergonomics pass on top of 0.1.0 (no new dependency): summary stat cards and a clean/warning/error status badge, per-rule finding icons, node fade-in animation and hover highlight, a real focus/dim mode on selection, flexible canvas height, simplified toolbar with collapsed advanced filters, a `modified` node color change to stop colliding with the finding/risk color, file isolation (ego-graph view), a VS Code status bar finding-count indicator, "Copy summary" (Markdown) and "Copy as Mermaid" (bounded flowchart) clipboard export, and "Export PNG" of the map canvas. First recorded Windows validation pass (see docs/VALIDATION.md). Added docs/ARCHITECTURE.md "Positioning relative to existing tools" after competitive research into dependency-cruiser, Madge, CodeSee, Sourcetrail, CodeViz.ai and Revieko; reprioritized docs/ROADMAP.md P2 accordingly.

## 0.1.0 — 2026-09-08

Initial working development release: local TS/JS dependency analyzer, cycle and boundary findings, read-only Git graph comparison, VS Code map/diagnostics, CLI, tests, packaging and AI contributor guidance. See README for explicit limitations and docs/VALIDATION.md for test coverage.
