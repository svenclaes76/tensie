# Tensie — Review experts

Reviewers needed for Tensie, a personal blood pressure PWA (SvelteKit + Dexie, Supabase EU, one user). Requirement IDs refer to the doc "Tensie — Requirements".

| # | Expert | Priority | Effort | When |
|---|--------|----------|--------|------|
| 1 | GP or cardiologist | Must | 30 min | Before building classification and reports |
| 2 | Supabase security reviewer | Must | 2–4 h | Before real readings go into Supabase |
| 3 | Front-end developer (offline sync and PWA) | Must | 2–4 h | After the first working sync |
| 4 | UX / interaction designer | Should | 1–2 h | Now, on the design canvas |
| 5 | Test user | Should | 1 week of daily use | After the first usable version |
| 6 | QA (self, with checklist) | Must | Ongoing | During development |

---

## 1. GP or cardiologist

**Why:** they interpret the readings, so the thresholds, the measuring routine and the report must fit how they work.

**Profile**
- Treating GP (huisarts) or cardiologist who knows your history
- Familiar with home blood pressure measurement guidelines (ESC/ESH)

**What to review**
- Thresholds T1–T3: licht verhoogd from 135/85, gemiddeld from 160/100, ernstig from 180/110
- Morning/evening windows (T5) and the monthly average rule (T6)
- Monthly overview screen and the export (E1–E2): is this what they want to see?
- The fixed note about contacting a doctor or 112 (H-section)

**Questions to ask**
1. Are these thresholds right for me, or do you want personal targets?
2. How often and when should I measure (e.g. twice morning and evening)?
3. Which period and format do you want before a consultation?
4. Should a reading count separately per arm, or only the higher arm?

**Where to find:** your own huisarts or treating specialist, during a regular consultation.

---

## 2. Supabase security reviewer

**Why:** readings are health data; the most common Supabase mistake is a table readable through the public API key.

**Profile**
- Has shipped production apps on Supabase
- Knows Postgres row-level security (RLS), Supabase Auth and API key types
- Basic web security (OWASP Top 10)

**What to review**
- RLS enabled and correct on every table (readings, settings, tags)
- Sign-ups disabled after the owner account exists
- Only the public (anon/publishable) key in the front end; no service-role key anywhere in the app or repo
- Auth settings: magic link, TOTP, session lifetime (P3)
- Region is EU (P1) and the nightly backup job stores exports privately

**Questions to ask**
1. Can anyone read or write data without being logged in as me?
2. What happens if my public key leaks?
3. Is the backup export encrypted and access-restricted?

**Where to find:** freelance platforms (Malt, Upwork) searching "Supabase RLS", Supabase community Discord, or a developer friend with Supabase experience.

---

## 3. Front-end developer — offline sync and PWA

**Why:** offline entry and sync is the trickiest technical part; mistakes lose or duplicate readings.

**Profile**
- Experience with IndexedDB (Dexie or similar) and service workers (Workbox / vite-plugin-pwa)
- Has built or debugged an offline-first or sync feature
- Knows iOS Safari PWA limitations

**What to review**
- Sync logic: UUIDs, updated_at, deleted flags, last change wins (Architecture)
- No reading lost when offline, app closed, or two devices edit at once (N2)
- Service worker update flow and the "Update beschikbaar" prompt (N1)
- Install and offline start on iOS and Android
- Excel import in the browser with SheetJS (C9)

**Questions to ask**
1. Can a reading ever be lost or duplicated in my sync design?
2. How do I handle clock differences between devices?
3. Will iOS clear my IndexedDB data, and how do I protect against that?

**Where to find:** freelance platforms searching "offline-first PWA" or "IndexedDB sync", local developer meetups.

---

## 4. UX / interaction designer

**Why:** a fresh eye on the screens before building them.

**Profile**
- Mobile app or health/fitness app design experience
- Attention to accessibility and readability

**What to review** (on the Tensie design canvas)
- Entry screen: can a reading be saved in at most 3 taps plus the numbers (C1)?
- Are the B/O badges and four categories understood without explanation (H4)?
- Is the graph with category bands readable at a glance (H2)?
- Import flow with column mapping and date checks (C9)

**Questions to ask**
1. What would confuse a first-time user on each screen?
2. Is colour plus label enough to tell the categories apart?
3. What would you remove?

**Where to find:** Malt, Dribbble, or a designer in your network; one paid session is enough.

---

## 5. Test user

**Why:** real daily use shows problems no review finds.

**Profile**
- Someone who measures their blood pressure at home (not an expert)
- Uses a smartphone daily; ideally on a different phone type than yours

**What to test**
- Install the app, enter readings morning and evening for one week
- Find a past reading, check the graph and monthly overview
- Note every moment of hesitation or annoyance

**Where to find:** a family member or friend who already measures their blood pressure.

---

## 6. QA — self-review checklist

**Why:** the classification and import rules have the biggest impact if wrong; automate them.

**Unit tests**
- [ ] Classification at every boundary: 134/84, 135/85, 159/99, 160/100, 179/109, 180/110
- [ ] Systolic and diastolic in different categories: overall category is the higher one
- [ ] Monthly average uses all readings; fewer than 6 marked as limited data
- [ ] Changing a threshold reclassifies past readings and averages (T4)

**Import tests with Bloeddruk.xlsx**
- [ ] Header on row 2, columns Onder before Boven
- [ ] cmHg converted to mmHg (9.8 → 98)
- [ ] Values stored as text are read correctly
- [ ] Note column imported ("Start medicatie")
- [ ] Rows 78 (23/12/2022) and 85 (30/01/2028) flagged for confirmation
- [ ] Re-importing the same file creates no duplicates; undo removes the whole import

**Edge cases**
- [ ] Reading just before and after midnight lands on the right day
- [ ] Reading taken abroad keeps its local time slot
- [ ] Offline entry, then sync, then edit on a second device
- [ ] App update while offline
