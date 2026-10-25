# Tensie

Personal blood pressure PWA for one user (the owner). Dutch-only interface. Full requirements: `docs/requirements.md` (requirement IDs like C1, H4, T3 refer to it). Reviewers and test checklist: `docs/expert-profiles.md`.

## Stack

- SvelteKit + TypeScript, static adapter (deployed to Cloudflare Pages or Netlify)
- `vite-plugin-pwa` (Workbox) for manifest and service worker
- Dexie (IndexedDB) as the primary data store on the device
- Supabase (EU region, free plan): Postgres, Auth (email magic link), row-level security
- SheetJS (`xlsx`) for Excel import/export in the browser
- Charts drawn as plain SVG in Svelte (`TrendChart.svelte`), no chart library: the design's category bands, per-point colours and the table view are simplest that way, and a year of readings renders in ~50 ms
- Vitest for unit tests, Playwright for end-to-end

## Architecture rules

- **Local-first.** Every write goes to Dexie first; the UI reads only from Dexie. Sync with Supabase runs in the background and must never block entry.
- **Sync model.** Every row has a UUID (generated on the client), `updated_at` and a `deleted` flag (soft delete). Push local changes, pull server changes since the last sync; last `updated_at` wins. A reading must never be silently lost or duplicated.
- **Categories are calculated, never stored** (T4). Changing a threshold reclassifies everything.
- **Sync implementation.** Local rows carry `syncPending` (set by Dexie hooks, cleared by `src/lib/sync/engine.ts`); the server decides last-change-wins and stamps `synced_at` (`supabase/migrations/`). Writes applied from the server go through `fromSync()` so they are not sent back. Setup: `docs/supabase-setup.md`.
- **Supabase security.** RLS on every table, rows owned by `auth.uid()`. Only the public (anon/publishable) key may appear in client code. Never commit a service-role key or `.env`.

## Domain rules

- Units: store and show mmHg as integers.
- Categories (code → label): `normal` Normaal, `mild` Licht verhoogd, `moderate` Gemiddeld verhoogd, `severe` Ernstig verhoogd.
- Default lower limits (inclusive): systolic 135 / 160 / 180, diastolic 85 / 100 / 110. A value equal to a limit belongs to that category.
- Systolic (bovendruk) and diastolic (onderdruk) are classified separately and both shown; the reading's overall category is the higher of the two.
- Day parts (code → label): `morning` ochtend 04:00–11:59, `evening` avond 18:00–23:59, otherwise `other` (andere). Store the time zone with each reading.
- Monthly average uses every reading in the month; fewer than 6 readings = "beperkte gegevens".
- The app never diagnoses or advises. Keep the fixed note about contacting a doctor or 112.

## Excel import (C9)

The owner's existing file has this layout; the importer must read it as is:

- Sheet `Blad1`; headers on row 2 starting in column B: `Maand | Datum | Uur | Onder | Boven`, plus an untitled column G with notes.
- Values are in **cmHg** (e.g. Onder 9.8, Boven 16.0) → multiply by 10 for mmHg. Detect cmHg when values are below ~30.
- Some numbers are stored as text, with a decimal point.
- `Maand` is only filled on the first row of each month: ignore it. Ignore `Blad2` (averages).
- Dates out of sequence or in the future are flagged for confirmation, never imported silently.
- Re-importing must not create duplicates (match on date + time); a whole import can be undone.

Use `tests/fixtures/sample-import.xlsx` (synthetic data, same layout) in tests. The real file contains health data and must never be committed.

## UI

- Mobile-first from 360 px, tap targets ≥ 44 px, body text ≥ 16 px, WCAG 2.2 AA.
- Belgian formats: dd/mm/jjjj, 24-hour time, decimal comma.
- Category always shown as colour **and** text label.
- Screens (designs on the Tensie design canvas) and routes: Home `/`, Nieuwe meting `/new`, Lijst `/list`, Grafiek `/chart`, Maandoverzicht `/monthly`, Instellingen `/settings`, Importeren `/import`; editing a reading (no design board, reuses the Nieuwe meting form) `/reading/[id]`.
- Colours: accent #1F6F66, ground #F6F7F5, ink #1B2421. Category badges: normaal #E3F1EE/#1D5E53, licht #FBEFD2/#6B4700, gemiddeld #FBE1D3/#8A2E0B, ernstig #9F1239/#FFFFFF. Font: Atkinson Hyperlegible.

## Working agreements

- Write unit tests for classification, averages and import before or with the code; test every threshold boundary.
- Keep domain logic (classification, averages, import parsing) in plain TypeScript modules under `src/lib/domain/`, free of Svelte and Dexie, so it is easy to test.
- Everything in code is English: identifiers, stored values, routes, comments and commits. Only text the user sees is Dutch, kept in label maps such as `src/lib/texts.ts`. Data that must match Dutch input (Excel header names) stays as it is.
- Imports from `src/lib` use SvelteKit 3 subpath imports: `#lib/…/file.js`.
