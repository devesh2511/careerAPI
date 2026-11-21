# Pilot Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin run a time-boxed, seat-limited free pilot for an institute, during which students register with just the institute code, and carry those accounts over when the institute pays.

**Architecture:** Pilot students get a `"user"` list row tagged `via_pilot` with no subscription (approach A in the spec). The access check treats such a row as a plan while the institute's pilot is live; the paid upload moves the row onto a subscription through the existing renewal path. All pilot state lives on `institute`; "live" is computed at query time.

**Tech Stack:** Node 20 ESM, Express 5, `pg`, Postgres (careerAPI); plain JS static pages (careerAI).

**Spec:** `docs/superpowers/specs/2026-11-21-pilot-mode-design.md`

## Global Constraints

- No commits (user instruction for this run). Leave changes in the working trees of careerAPI (branch `feat/pilot-mode`) and careerAI.
- Migrations must be idempotent (`ADD COLUMN IF NOT EXISTS`, guarded constraints) — `scripts/migrate.js` header.
- Defaults: seats 5 / 5, end time now + 48 h (admin UI prefill). Seats `0..1000`.
- Pilot live = `pilot_mode AND now() < pilot_ends_at AND status = 'active' AND NOT is_deleted`.
- Pilot access / seat counting only for rows `via_pilot AND subscription_id IS NULL`.
- `pilot_unmatched` is computed per upload and never stored.
- Error codes: `pilot_full` (409), `already_at_school` (409).
- Admin times shown and entered in IST.

## Review Focus

1. Two students racing for the last seat — the institute row lock must make the second one get `pilot_full`. (Task 2 harness: sequential seat-limit test; lock reviewed by reading.)
2. Admin edits an institute whose pilot expired with the toggle still on — saving other fields must not fail on "end time in the past". (Task 3 test.)
3. A pilot student whose name in the paid file differs — upload succeeds, student listed in `pilot_unmatched` with a same-phone suggestion. (Task 3 test.)
4. Paid ex-pilot student after subscription ends, pilot restarted — no access, no seat used. (Task 1 test.)
5. Existing account at a school's pilot while on another school's list (registered or not) — `already_at_school`, other school's row untouched. (Task 2 test.)

## Verification approach

No test suite and no local Postgres. Tests run in a scratch harness **outside both repos** (`%TEMP%\pilot-harness`): PGlite (in-process Postgres) runs every migration, and a Node loader hook swaps `src/Database/db.js` for a PGlite-backed module, so real services and repositories run against a real schema. Harness scripts are throwaway and not part of the change. Frontend is checked with `node --check` and by reading.

---

### Task 0: Harness

**Files:** Create (outside repos) `%TEMP%\pilot-harness\{package.json, db.js, hooks.mjs, register.mjs, setup.mjs}`

- [ ] Install `@electric-sql/pglite` in the harness dir.
- [ ] `db.js` exports `pool`, `query`, `db`, `withTransaction` with `pg`'s shape (`{ rows, rowCount }`), backed by one PGlite instance.
- [ ] `hooks.mjs` resolves any `.../src/Database/db.js` to the harness `db.js`; `register.mjs` registers it.
- [ ] `setup.mjs` applies `D:\careerAPI\migrations\*.sql` in order and exposes fixtures (admin, institute, list rows).
- [ ] Run: migrations 001–019 apply cleanly. Expected: no error.

### Task 1: Schema + access check

**Files:**
- Create: `migrations/020_pilot_mode.sql`
- Modify: `src/Database/student.repository.js` (`ACCESS_FACTS.plan`)

**Interfaces — Produces:** columns `institute.pilot_mode, pilot_ends_at, pilot_seats_class9, pilot_seats_class10`, `"user".via_pilot`; constraint `institute_pilot_ends_check` (`NOT pilot_mode OR pilot_ends_at IS NOT NULL`), seat checks `>= 0`.

- [ ] Test `access-pilot`: pilot row on live pilot → `has_access`, `ends_at = pilot_ends_at`; pilot stopped → `reason: 'not_subscribed'`; ends_at passed → `not_subscribed`; row with `subscription_id` set to an ended subscription and pilot live → `not_subscribed`; covering subscription + live pilot → subscription's `ends_at`.
- [ ] Run → fails (no columns).
- [ ] Write migration; change `plan` to the covering subscription, else the pilot plan (`ORDER BY` subscription first).
- [ ] Run → passes; re-running migration 020 changes nothing.

### Task 2: Registration

**Files:**
- Modify: `src/Database/institute.repository.js` — `findJoinableByCode(code, db, { forUpdate = false } = {})` also returns `pilot_live, pilot_seats_class9, pilot_seats_class10`.
- Modify: `src/Database/studentList.repository.js` — add `pilotSeatsUsed(instituteId, db) → { 9: n, 10: n }` (rows `via_pilot AND subscription_id IS NULL`, linked account not deleted, by account class); `addPilot({ instituteId, name, phoneNo, studentId }, db)`; `onOtherSchool({ instituteId, studentId, name, phoneNo }, db) → boolean` (any row on another `school`, linked to studentId or matching name+phone).
- Modify: `src/Services/auth.service.js` — `findEntry` re-reads the institute `FOR UPDATE` when the pilot is live; pilot decision helper `pilotRoute(institute, cls, db) → 'pilot' | 'request'` throwing `pilot_full` / `already_at_school`.

Rules: on list → normal path. Not on list and pilot live → seat left for the class → pilot; else `accepts_requests` → join request; else `409 pilot_full` (`field: 'class'` on register only). `checkEntry`: existing account → its class decides; new account → pilot if any class has a seat; returns `pilot: true`, hides `username`. School pilot + `onOtherSchool` → `409 already_at_school`. Pilot path never calls `keepOneSchool`/`claimAllFor`; link path removes any join request for this institute.

- [ ] Tests `register-pilot`: check → `{ status: 'new', pilot: true, needs_approval: false }`; register → access granted, row `via_pilot`, `subscription_id` null; 6th class-9 register with 5 seats → `pilot_full`, class-10 still ok; seats full + `accepts_requests` → join request; pilot off → `not_on_list`; existing account (from another coaching list) links → access, username not in check; school pilot with person unregistered on another school's list → `already_at_school` and that row still exists; on-list student during pilot → normal path (`via_pilot` false).
- [ ] Run → fails. Implement. Run → passes.

### Task 3: Admin API

**Files:**
- Modify: `src/DTO/admin.requests.js` (`InstituteRequest`: `pilot_mode` tri-state like `accepts_requests`; `pilot_ends_at` Date|undefined; seats int 0..1000|undefined)
- Modify: `src/Database/institute.repository.js` (`insert`, `update` with coalesce; `ADMIN_SELECT` adds `pilot_live, pilot_used_class9, pilot_used_class10`)
- Modify: `src/DTO/InstituteDTO.js` (`pilot: { mode, live, ends_at, seats: { class9: { limit, used }, class10: { limit, used } } }`)
- Modify: `src/Services/admin.institute.service.js` (`create`/`update` validation; `listStudents` adds `via_pilot`; `uploadStudents` returns `pilot_unmatched`)
- Modify: `src/Database/studentList.repository.js` (`list` selects `via_pilot`; add `pilotWithoutSubscription(instituteId, db)`)
- Modify: `docs/openapi.yaml`

Validation: final mode on with no end → `400 invalid` field `pilot_ends_at`; end in the past only rejected when turning on or changing the end time.
`pilot_unmatched` item: `{ student_id, username, full_name, phone_no, class, suggestions: [{ full_name, phone_no }] }` — queried after `upsertMany`, suggestions = file entries with same phone, different name.

- [ ] Tests `admin-pilot`: create with pilot on + future end → DTO `pilot.live`; update turning on with past end → 400; update other fields of an expired-but-on pilot → ok; stop → `live: false`; seats used count; upload with exact match → pilot row on subscription, not in `pilot_unmatched`; upload with "Aarav K. Mehta" same phone → listed with suggestion; `listStudents` has `via_pilot`.
- [ ] Run → fails. Implement. Run → passes.

### Task 4: Admin panel (careerAI `scripts/admin.js`)

- [ ] Details form: Pilot section (Off/On select, "Pilot ends (IST)" `datetime-local`, seats class 9 / class 10) prefilled per Global Constraints; status line with seats used and **Extend 1 day** / **Stop now** buttons (send the form with overrides; Stop confirms).
- [ ] Students list: "Pilot" badge on `via_pilot` rows; note line while live.
- [ ] Upload result: "Pilot students not found in this file" section with suggestions and links to `#/students/<id>`.
- [ ] Institutes list: `admPlanBadge` shows "Pilot until …" when live and no active subscription.
- [ ] `node --check scripts/admin.js` passes.

### Task 5: Student sign-up (careerAI `scripts/script.js`)

- [ ] Track `authPilot` from check; details/link copy says they're joining the trial with immediate access.
- [ ] `pilot_full` on register shows under class; `already_at_school` restarts at step 1 like `not_on_list`.
- [ ] `node --check scripts/script.js` passes.
