# Impressão 3D Pilot Implementation Plan

> **For agentic workers:** Use subagent-driven-development for the independent engine and viewport; the primary agent integrates and verifies the complete flow.

**Goal:** Deliver a local, reviewable 3D-printing pilot inside Ferramenta I.A.

**Architecture:** Pure validated project and geometry modules execute in a cancellable Worker. React owns the editing/persistence lifecycle; Three renders the returned meshes; exports require an exact current project signature. No server or production writes.

**Tech Stack:** React 18, Vite 5, Three 0.180.0, Manifold WASM 3.5.4, existing IndexedDB fabrication storage, Node tests, Playwright and independent Python STL validation.

**Spec:** docs/superpowers/specs/2026-10-28-impressao3d-piloto.md

## Global Constraints

All geometry in mm. 256 KiB input, 32 text characters, 128 contours, 8,000 vertices, 20-second Worker timeout. curveTolerance=0.025 and exportTolerance=0.0001. No silent repair, source substitution, scales, remote writes, G-code, 3MF or deployment. New libraries and fonts are local assets with license notices; preserve all existing tools. Use the current branch only and stage explicit task files.

### Task 1: model, engine and exports

Files: create src/lib/impressao3d/{model,input,kernel,engine,exports,client,calculation.worker}.mjs, vendor and matching *.test.mjs. Follow the spec's exact exported names and data contracts.

- [x] Write and run behavior tests for A/O holes, a narrow source, stale export and missing units; use the approved synthetic SVG/DXF fixtures only.

```js
const project=createPrintProject();
const result=await generatePrintProject(project);
assert.equal(result.parts.length,2);
assert.throws(()=>partSTL({...project,revision:project.revision+1},result,result.parts[0].id));
```

- [x] Preserve the proved solid construction; add strict bounded input parsing and schema validation, local WASM/font assets and base-relative loading.
- [x] Implement Worker cancellation/timeout with request identity; test with an injected worker factory so late messages and initialization failures are observable.
- [x] Verify current exports by rereading binary STL and preserving hole count/orientation; include the blocked Gentilis combinations and printer-volume boundaries.
- [x] Run `node --test src/lib/impressao3d/*.test.mjs`; inspect results before handing to root. Do not commit or publish independently.

### Task 2: 3D viewport

Files: src/components/impressao3d/PrintViewport.jsx, viewport CSS and focused helper tests if needed. Consumes result.parts and printer from the spec; produces presentation only, never mutating geometry.

- [x] Render actual positions/indices with mm units and consistent camera orientation.
- [x] Add mounted/exploded, front/perspective, zoom, fit and visibility; release controls/renderer/geometry on teardown and report context loss.
- [x] Exercise framing with wide and narrow examples and a 390 px viewport; check meshes are unchanged by visual controls.
- [x] Run syntax/lint/tests and hand over; independent root browser inspection follows.

### Task 3: page, persistence and navigation

Files: src/pages/Impressao3D.jsx and CSS, src/pages/FerramentaIA.jsx, src/review/preview.jsx, package.json test script, integration test under tests/.

- [x] Add lazy navigation `ferramenta=impressao-3d` using the existing permission and owner key.
- [x] Build editable project state with explicit generation, immediate result invalidation, manual cancel and bounded file import; show source errors without stale downloads.
- [x] Use `createFabricationStorage({product:'impressao-3d',validate:validatePrintProject})`; load owner draft, save with expectedVersion, block conflicting writes and preserve exportable local state. Persist source/parameters only.
- [x] Add project JSON open/export, geometry report, per-part STL and SVG. Distinguish front inspection STL from printable body and nominal bed capacity from actual qualification.
- [x] Add the test path to npm test, keep existing paths. Run focused tests, lint and build.

### Task 4: complete verification and local review

Files: tests/impressao3d-browser.mjs (synthetic review only), docs/impressao3d-piloto-validacao.md, VEZ.md completion note.

- [x] Test the real browser flow, downloads and reload in review mode; isolate test owner and use no production endpoints.
- [x] Exercise changing source/profile/dimensions during work, oversized pieces, blocked shapes, SVG/DXF/file errors, quota/conflict and current-signature export.
- [x] Build/serve official `/painel-impresilk/` and review `/dist-review/` paths; confirm Worker/WASM/font requests and no blank viewport or console errors.
- [x] Run root tests, npm test, access tests, lint, static checkers from Pages and class check after the official build. Use the current public vida-leo reference for the external checker.
- [x] Independently review source diff and delivery; record counts, limitations and local URL. Update the work record to locally verified/awaiting publication approval. No merge, push or deploy.

## Completion evidence

Local review delivered 28/10/2026. See docs/impressao3d-piloto-validacao.md. 41 focused tests, 1,880 root, 1,496 calculation, 7 access; 15 Pages checkers; builds and localhost assets passed. Browser: 29 flow checks and 4 delayed-save checks; desktop/mobile/dark inspected. Independent Python: 40/40 new STL, 30 topology, 2 analytical volumes. No deployment or physical print. Material remains not-informed.
