# Tensie — Requirements

Oct 25, 2026 · @Sven Claes

## Purpose and scope

The app lets a person record home blood pressure readings on their phone in under 30 seconds, see trends, and hand a clean report to their GP or cardiologist.

Working assumptions for this draft:

- Primary user is an adult measuring at home with an automatic upper-arm cuff, typing values in manually.
- Mobile web app (installable PWA), no native app store release in v1.
- Built for my own use only: one account, no public sign-up. Sharing with a doctor is via export or a read-only link.
- Hosted server in the EU with sync across devices; interface in Dutch only.
- The app records and shows data; it does not diagnose or advise on medication.

Core needs, all Must: easy entry with time of measurement (C1), a list (H1), Excel import (C9), categories per value from configured thresholds (H4, T1–T4), a graph (H2) and monthly averages (H3). Everything else is secondary.

## Users and roles

| Role | Can do | Account needed |
| --- | --- | --- |
| Owner (me) | Record, edit and delete readings; manage reminders, exports and share links | Yes, the only account |
| Viewer (doctor) | Read-only view of the report for a limited period | No, via expiring share link |

Registration closes once the owner account exists; there are no caregiver or admin roles in v1.

## Capturing a measurement

The entry screen opens straight from the home screen icon, with the numeric keypad already up on the systolic field.

| ID | Requirement | Priority |
| --- | --- | --- |
| C1 | Fields: systolic (mmHg), diastolic (mmHg), date and time (defaults to now) | Must |
| C2 | Optional fields: arm (left/right), free-text note | Should |
| C3 | Optional tags from a user-editable list (e.g. after medication, after coffee, stressed, after exercise) | Won't |
| C4 | Validation: systolic 60–260, diastolic 30–160, systolic greater than diastolic; out-of-range asks for confirmation instead of blocking | Must |
| C5 | Multiple readings in one session (e.g. 2 readings 1 minute apart) are grouped and averaged automatically | Should |
| C6 | Guided measurement series: a 7-day morning and evening protocol with prompts, progress, and a series average excluding day 1 | Won't (v1) |
| C7 | Edit and delete any reading; deletions can be undone for 10 seconds | Must |
| C8 | Medication log: name, dose, time taken, linkable to readings | Won't (v1) |
| C9 | Import from an existing Excel (.xlsx) or CSV list: map columns for date, time, systolic and diastolic; preview and skip duplicates before saving. Accepts dd/mm/yyyy dates, Excel date cells, and date and time in one or two columns; rejected rows are listed with the reason; a whole import can be undone. Must read the current Bloeddruk.xlsx as is: header on row 2, columns Onder before Boven, values in cmHg (e.g. 9.8 / 16.0) converted to mmHg, numbers stored as text, the untitled note column imported as note, and the Maand column and Blad2 ignored. Dates out of sequence or in the future are flagged for confirmation, not imported silently | Must |
| C10 | Photo of the cuff display read by OCR to pre-fill values, always confirmed by the user | Won't (v1) |

Entering a standard reading must take at most 3 taps plus the numbers.

## History, charts and classification

| ID | Requirement | Priority |
| --- | --- | --- |
| H1 | Table of all readings, newest first: columns date, time, systolic, diastolic and a note marker; each value cell tinted by its category with a letter code (L/G/E); a summary row per month with average and count; filter on all, morning or evening; header stays visible while scrolling | Must |
| H2 | Line chart of systolic and diastolic over 7 days, 30 days, 90 days, 1 year, custom range | Must |
| H3 | Monthly overview: average systolic and diastolic per month, number of readings, and the category of each average; plus averages per chosen period and separate morning and evening averages | Must |
| H4 | Each reading is classified as normaal, licht verhoogd, gemiddeld verhoogd or ernstig verhoogd using thresholds configured in settings. Systolic and diastolic are classified separately and each shows its own label and colour, so it is visible which value is raised; the reading's overall category is the higher of the two | Must |
| H5 | Chart draws the threshold lines and colours each point by its category, separately for systolic and diastolic | Should |
| H6 | Filter by arm and time of day | Could |
| H7 | Simple summary card on the home screen: last reading, 7-day average, trend arrow versus previous 7 days | Should |

Category colours are informational only. The app never states a diagnosis and shows a fixed line advising to contact a doctor or emergency services (112) for very high readings or symptoms.

### Thresholds and calculation rules

| ID | Requirement | Priority |
| --- | --- | --- |
| T1 | Settings screen to set the lower limit of each category, separately for systolic and diastolic; limits are inclusive (140 means 140 and above) | Must |
| T2 | Limits must rise from one category to the next; the screen rejects overlaps and gaps | Must |
| T3 | Pre-filled defaults until changed: normaal below 135/85, licht verhoogd from 135/85, gemiddeld verhoogd from 160/100, ernstig verhoogd from 180/110 (as used in Bloeddruk.xlsx) | Should |
| T4 | Categories are calculated, never stored: changing a threshold reclassifies all past readings and monthly averages | Must |
| T5 | Morning and evening windows are configurable (default 04:00–11:59 and 18:00–23:59); readings outside them count as other | Should |
| T6 | Monthly average uses every individual reading in the month; months with fewer than 6 readings are marked as limited data | Should |

## Reminders, export and sharing

| ID | Requirement | Priority |
| --- | --- | --- |
| R1 | Configurable reminders (e.g. 07:30 and 21:00) via web push; email as fallback where push is unavailable | Won't (v1) |
| R2 | Reminders pause automatically once a reading for that slot is logged | Won't (v1) |
| E1 | PDF report for a chosen period: patient name and birth year, averages, chart, full reading table and notes; A4, printable in black and white | Must |
| E2 | Export of all readings to Excel (.xlsx) or CSV, in the same layout the import accepts | Must |
| E3 | Full data export (JSON) of everything held about the account, for GDPR portability | Must |
| S1 | Read-only share link with an expiry (24 hours to 90 days) and an optional PIN; revocable at any time | Should |
| S2 | Owner sees when a share link was last opened | Won't (v1) |

## Non-functional requirements

| ID | Requirement |
| --- | --- |
| N1 | Progressive web app: installable to home screen on iOS Safari 16.4+ and Android Chrome; works in a normal browser tab too. Web app manifest with name Tensie, app icons (192, 512 and maskable, plus Apple touch icon), theme colour and standalone display, so it opens full-screen without browser bars. Service worker caches the app shell so it starts offline; a new version shows an "Update beschikbaar" prompt instead of reloading silently |
| N2 | Offline entry: readings saved locally and synced when back online; conflicts resolved by last edit, with no reading ever silently lost |
| N3 | Mobile-first layout from 360 px wide; usable one-handed; tap targets at least 44 × 44 px |
| N4 | Accessibility: WCAG 2.2 AA; large-text mode; colour never the only signal for a category (also a label) |
| N5 | Audience skews older: minimum 16 px body text, plain language, no gestures that are the only route to an action |
| N6 | Language: Dutch only; Belgian formats for dates (dd/mm/yyyy), 24-hour times and decimal comma |
| N7 | Performance: entry screen interactive within 2 s on a mid-range phone over 4G; chart of 1 year renders within 1 s |
| N8 | Daily encrypted backups kept 30 days, restore tested quarterly; no formal availability target |

## Privacy, security and regulatory

Readings are health data, so they get strong protection even though the app holds only my own data.

| ID | Requirement |
| --- | --- |
| P1 | Data stored and processed only in the EU |
| P2 | Encryption in transit (TLS 1.2+) and at rest |
| P3 | Login with email and password through Supabase Auth; optional TOTP second factor; sessions expire after 30 days of inactivity |
| P4 | No third-party analytics, ads or tracking pixels |
| P5 | Log of logins, exports, share-link creation and opens, kept 12 months |
| P6 | Full export and delete-everything available in-app |

Medical device boundary: an app used only by its builder is not placed on the market, so the EU Medical Device Regulation does not apply. Revisit this if the app is ever offered to others.

## Data model

| Entity | Key fields |
| --- | --- |
| Settings | time zone, birth year, lower limit per category for systolic and diastolic, morning and evening windows |
| Reading | id, measured at (with time zone), systolic, diastolic, arm, note, session id, source (manual/import), created and updated at |
| Session | id, started at, series id (optional) |
| Series (after v1) | id, protocol (e.g. 7-day), start date, status |
| Tag | not used (tags dropped) |
| Medication intake (after v1) | id, name, dose, taken at |
| Reminder (after v1) | id, time, days of week, channel |
| Share link | id, token hash, PIN hash, expires at, revoked at, last opened at |

Readings store the time zone so a reading taken abroad still lands in the right morning or evening slot.

## Architecture

Tensie is local-first: the PWA keeps all readings on the phone and syncs in the background with Supabase in an EU region, on the free plan.

| Part | Choice | Role |
| --- | --- | --- |
| Front end | SvelteKit + vite-plugin-pwa, hosted free on Cloudflare Pages or Netlify | Screens, manifest, service worker, offline start |
| Local storage | IndexedDB via Dexie | Every reading saved here first; list, graph and averages read from here |
| Calculations | In the app | Categories and monthly averages from the configured thresholds; never stored |
| Excel import | SheetJS in the browser | Reads Bloeddruk.xlsx, converts cmHg, flags dates, then saves locally |
| Charts | uPlot or Chart.js | Graph screen |
| Back end | Supabase (EU region): Postgres, Auth, row-level security | Stores raw readings and settings; one account, sign-ups disabled after it exists |
| Sync | Push local changes, pull server changes since last sync | Each row has a UUID, updated_at and deleted flag; last change wins |
| Backups | Nightly database export by a scheduled job to private storage | Not relying on the free plan's own backups |

The whole setup costs nothing; an optional .be domain is the only expense.

## Out of scope and open questions

Not in v1:

- Bluetooth sync with cuffs (Web Bluetooth is not supported on iOS Safari)
- Apple Health / Google Health Connect integration (needs a native wrapper)
- Clinician portal with multiple patients, and links to Belgian eHealth / patient records
- Alerts, risk scores or medication advice

Open questions:

All settled: hosted server with sync, Dutch-only interface, and the T3 default thresholds (135/85, 160/100, 180/110).
