# Modular refactor — บ้านเจ้าหนู

The app used to be one 3,873-line `index.html` (inline CSS + ~3,200 lines of
JS). It is now a small **Vite** project (mirroring the sibling
`../little-hamster-home`) so it can be built, tested, and grown without editing
a monolith. **Firebase, Chart.js and XLSX stay as global CDN `<script>`s** and
the single-document Firestore sync (`hamster/mainData`) is unchanged — this was
a pure structural refactor, behaviour is identical.

## Layout

```
index.html            shell markup: login overlay, nav, 7 pages, CDN scripts
package.json          type:module — scripts: dev / build / preview / test:smoke
vite.config.js        base = DEPLOY_BASE || '/'  (Pages sets DEPLOY_BASE)
public/               served verbatim → manifest.json, sw.js, icon-192/512.png
src/
  main.js             entry — imports core/legacy.js (pulls in state + firebase)
  core/
    state.js          shared state S + seed constants + FIFO engine + load/save
    firebase.js       Firebase config + Firestore single-doc sync (hamster/mainData)
    legacy.js         the rest of the engine (stock/import/profit/sales/customers/
                      nav/auth) + the window-exposure shim for inline on* handlers
  modules/
    registry.js       page descriptors (id/name/icon/order) — drives showPage nav
  styles/
    base.css          the former inline <style>, byte-identical
test/
  smoke.mjs           Playwright smoke: boot, globals, all 7 pages, no JS errors
```

### Module graph (Phase 3)

`main.js → legacy.js`, which imports everything from `state.js`, `firebase.js`
and `modules/registry.js`. `state.js ↔ firebase.js` is circular by design
(`saveState()` calls `saveToFirebase()`; the sync writes back through
`setState()`) — safe because the cross-module refs are functions/live bindings
used at call time, not at module-eval time. Wholesale `S = …` reassignments go
through `setState()` in `state.js` so the live `export let S` binding stays
valid for every importer.

## Commands

```bash
npm install                              # first time (approves esbuild build)
npm run dev                              # dev server @ http://localhost:8091/
npm run build                            # production bundle → dist/
npm run preview                          # serve the built bundle
SMOKE_URL=http://localhost:8091/ npm run test:smoke
```

Deploy build for GitHub Pages (served under `/BaanJaoNoo-Profit/`):

```bash
DEPLOY_BASE=/BaanJaoNoo-Profit/ npm run build
```

## Why the `window` shim

The markup calls functions through inline `onclick=`/`oninput=`/`ondrop=` etc.
Moving the script into an ES module makes those top-level `function`s
module-scoped, so `core/legacy.js` ends with
`Object.assign(window, { …all 180 top-level functions… })` to re-expose them —
the same technique `../little-hamster-home` used in its Phase 2.

## Done

- **Phase 0** Vite scaffold; app served unchanged; PWA assets → `public/`.
- **Phase 1** CSS split into `src/styles/base.css` (byte-identical).
- **Phase 2** JS split into `src/core/legacy.js` as an ES module; globals
  re-exposed to `window`; Playwright smoke test added. Dev **and** production
  bundle both pass the smoke test.
- **Phase 3** Extracted `core/state.js` (`S` + seed constants + FIFO + load/save)
  and `core/firebase.js` (config + `hamster/mainData` sync) out of `legacy.js`;
  added `modules/registry.js` (page descriptors) and wired it into `showPage`.
  Dev and production both still pass the smoke test.

## Not done yet (optional)

Unlike `little-hamster-home` (whose modules were already independent, one
`localStorage` key each), บ้านเจ้าหนู shares one global state object `S` across
every page (FIFO cost, imports, and sales all read/write the same `S`). A true
`modules/<id>/` split therefore means untangling that shared state, which
carries real regression risk.

- **Phase 4** Move each page's engine + screen template into `src/modules/<id>/`
  behind the registry (switch `registry.js` to Vite glob auto-discovery, add
  per-descriptor `show` / `onRemote` / `dashboard` hooks), and drop the
  `window.*` shim one module at a time.
