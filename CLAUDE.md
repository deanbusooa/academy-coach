# Academy Coach

Browser-only app for a football coach: roster, group sessions + attendance, 1-1 bookings, skill progress, drill library.
Plain HTML/CSS/vanilla JS (ES modules). **No frameworks, no dependencies, no build step, no backend.** Data lives in `localStorage`; JSON export/import is the backup story. Installable PWA that works offline (coaches use it on the pitch, on phones).

## Run & test

- Serve over HTTP (ES modules and the service worker don't work from `file://`):
  `npm start` (= `npx serve -l 8080 .`) or `python -m http.server 8080`, then open http://localhost:8080
- Unit tests: `npm test` (Node, no deps) or open `/tests/index.html` in the browser. Tests use in-memory storage.
- Settings → "Load demo data" seeds a sample squad when the roster is empty. Handy for manual checks.

## Architecture

```
index.html ─▶ js/app.js ─▶ router.js ─▶ views/*.js ─▶ models/*.js   (pure logic)
                                          │          └▶ actions.js  (multi-collection writes)
                                          └────────────▶ store.js   (only module touching localStorage)
```

| Path | Role |
|---|---|
| `js/store.js` | Single state object under key `academyCoach.v1`. `getAll/get/upsert/remove/removeWhere/batch/updateSettings/subscribe/snapshot/replaceAll`. Every write persists, then notifies subscribers. Has `schemaVersion` + `migrate()`. |
| `js/router.js` | Hash router. Routes `{ path: '/x/:id', view, section }`. Calls `view.render(container, params, query)`. `href(path, query)` builds links. |
| `js/app.js` | Route table, nav, `store.subscribe(() => router.refresh())`, SW registration. |
| `js/models/*.js` | **Pure** domain functions: `normalizeX`, `validateX` (returns `{field: message}`), filters, derived stats. No DOM, no store. |
| `js/actions.js` | Cascading writes (delete player → ratings/bookings/attendance; delete drill → session plans; rename age group). |
| `js/backup.js` | `validateBackup` (pure), `downloadBackup`, `readBackupFile`. |
| `js/ui/` | `form.js` (config-driven forms + `openFormModal`), `modal.js` (bottom sheet / dialog + `confirmDialog`), `toast.js`, `chart.js` (SVG line chart), `icons.js`. |
| `js/views/` | One module per screen. `shared.js` holds common bits (page head, chips, search, FAB, empty state). |
| `js/utils/` | `dom.js` (`h()`, `add()`, `setTitle`), `date.js`, `format.js`. |
| `css/` | `base.css` (tokens + layout), `components.css` (reusable), `views.css` (screen-specific). |
| `sw.js` | Precaches the app shell, stale-while-revalidate. |

### Data model (collections in the store)

```
players   { id, name, ageGroup, position, parentName, parentPhone, parentEmail, notes }
drills    { id, name, durationMin, equipment[], coachingPoints[], ageGroups[] (empty = all), notes }
sessions  { id, date, time, ageGroup, location, title, drillIds[] (ordered), attendance{ playerId: 'present'|'late'|'absent' }, notes }
bookings  { id, playerId, date, startTime, durationMin, focusArea, price, paid, location, notes }
ratings   { id, playerId, date, scores{ dribbling, passing, firstTouch, shooting, defending, fitness: 1..5 (each optional) }, notes }
settings  { ageGroups[], currency, defaultPrice, defaultDuration }
meta      { lastExportAt, createdAt }
```
All records also get `createdAt`/`updatedAt` from `store.upsert`. IDs come from `crypto.randomUUID()`.

### Render cycle

Any store write re-renders the **whole current view** (scroll position kept). So:
- View-local UI state (search text, filters, tabs) lives in a module-level `ui` object, never in the DOM.
- Typing in a search box must not write to the store. Re-render only the list part (see `views/players.js`).
- Modals live outside `#view`, so they survive re-renders. Read fresh data with `store.get()` inside handlers rather than closing over stale records.

## Conventions

- **ES modules, named exports, kebab-case filenames.** Views export `render(container, params, query)`.
- **No `innerHTML` with user data.** Build DOM with `h(tag, props, ...children)`. Strings become text nodes. (Exception: static SVG paths in `ui/icons.js`.)
- Native `el.append(x)` / `replaceChildren(x)` turn `null` into the text "null" and arrays into "[object …]". Use `add(el, ...)` from `dom.js` when a child can be null, and spread arrays: `replaceChildren(...list)`.
- **Dates:** store ISO `YYYY-MM-DD` strings and `HH:MM` times. Parse with `date.parseISO` (local), never `new Date('YYYY-MM-DD')` (UTC, so the day shifts). Weeks start Monday.
- **Money:** stored as numbers; display only via `formatMoney(amount, settings.currency)`.
- **Validation:** `normalizeX()` then `validateX()` in the model. Forms show the returned `{field: message}` inline.
- **Cross-collection changes** go in `actions.js`, wrapped in `store.batch()` (one save, one re-render).
- **CSS:** mobile-first; breakpoints 560/640/768/1024px. Use tokens from `base.css` (`--c-*`, `--s-*`, `--r-*`), with no hard-coded colours in components. Dark mode is automatic via `prefers-color-scheme` and the tokens. Tap targets ≥ 44px (`--tap`). Inputs use 16px font (prevents iOS zoom).
- Inline custom properties must go through `h(..., { style: { '--dot': c } })`. `h()` uses `setProperty` for `--*` keys, because plain assignment silently drops them.
- Accessibility: buttons for actions and links for navigation; `aria-pressed` on toggles; `aria-label` on icon-only buttons.

## How to…

- **Add a screen:** create `js/views/foo.js` exporting `render`, add `{ path, view, section }` to `routes` in `app.js` (and to `NAV` if it needs a tab), add the file to `ASSETS` in `sw.js`.
- **Add a stored field:** default it in the model's `normalizeX`; validate in `validateX`; add it to the form config in the view. If old data needs transforming, bump `SCHEMA_VERSION` in `store.js`, add a step in `migrate()`, and add a test.
- **Add/rename any static file:** update `ASSETS` in `sw.js` **and bump `CACHE_VERSION`**, or installed clients keep the old shell. `addAll` is all-or-nothing, so a missing file means no offline support.
- **Add a skill:** append to `SKILLS` in `models/ratings.js` (key, label, colour token) and add a `--c-skill-N` token in both themes.

## Testing checklist (manual, phone-sized viewport)

Load demo data → add a player (validation shows) → plan a session, add drills, reorder → tap attendance tiles → add/toggle-paid a 1-1 booking, change weeks → rate a player and check the chart → export, reset, import → reload (data persists) → go offline and reload (app still loads).
