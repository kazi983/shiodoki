# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Shiodoki (潮時, "the right moment to switch") is v2 of a desktop app that asks the user every
30 minutes which task to work on and tracks time per task, with a "leave time" schedule (離席時刻:
when the user has to get up from the desk for their next plan, not the end of a workday) that
warns and then blocks work shortly before it. Tasks sync through Firebase (Cloud Firestore) so an Android app (planned, `android/`) can
read and edit them. v1 (Python/Tkinter) lives in kazi983/30min-task-timer-python and is still in
daily use until v2 replaces it. The repository is kazi983/shiodoki, the Firebase project is
`shiodoki-e4e8f` and the local data directory is `shiodoki`. Only the v1 import
(`src/shared/legacy.ts`) still uses the old name, because it reads v1's `30min-task-timer` files.

`docs/requirements.md` is the source of truth for scope, the Firestore data model (§5) and the
phase plan (§9). Update it when decisions change. User-facing docs (READMEs, requirements) are
written in Japanese.

## Coding conventions

- Write comments, commit messages, and identifiers in English.
- Firebase config values in `desktop/src/shared/firebaseConfig.ts` are public by design. Never
  commit `desktop/resources/oauth-client.json` (Google OAuth client, gitignored) or any service
  account key.

## Layout and commands

- `firebase/` — `firestore.rules`, emulator config, rules tests. `npm test` runs the rules tests
  on the Firestore emulator (Java 21+). `npm run deploy:rules` deploys to project
  `shiodoki-e4e8f` (`.firebaserc`).
- `desktop/` — Electron + TypeScript + React (electron-vite). Before committing, run in
  `desktop/`: `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run e2e:headless`.
  Integration and Firebase E2E tests start the emulators via `../firebase/node_modules/.bin/firebase`,
  so `npm install` in `firebase/` first. Tests never touch the real Firebase project.
  - `npm run dev` (Firebase), `npm run dev:local` (`TIMER_LOCAL=1`, JSON file only),
    `TASK_MODE=test` shrinks intervals (30 min → 5 s, snooze 5 min → 10 s).
  - `TIMER_FIREBASE_EMULATOR=1` points the app at the emulators with a fake Google account (E2E).

## Desktop architecture

- `src/main/appController.ts` orchestrates the session flow (picker → running → interval /
  overlay click → picker, snooze, leave warning / block, exit). It depends only on interfaces
  (`WindowPort`, `LifecyclePort`) and is unit-tested with fake timers. Every path that ends a
  session must go through `finishSession()`, which records the session exactly once.
- `TimerService` is the only place that schedules delayed work, so everything is cancellable.
- Persistence is behind `TaskRepository` (`taskRepository.ts`): `JsonFileTaskRepository` for
  local mode, `FirestoreTaskRepository` for Firebase. Writes send only changed fields
  (`updateTask(id, patch)`); session minutes are added with Firestore `increment()` in the same
  batch as the session document.
- The Firebase SDK runs in a hidden "data" window (`src/renderer/data/`) because Firestore
  offline persistence needs IndexedDB. The main process talks to it through
  `src/main/dataBridge.ts`; `FirestoreTaskRepository` keeps an in-memory copy fed by snapshot
  listeners so the UI never waits for the network. Firestore writes are not awaited (they only
  resolve once the server acknowledges, which never happens offline).
- Google sign-in uses the system browser (loopback + PKCE, `googleOAuth.ts`), then
  `signInWithCredential` with the Google ID token.
- `desktopStateReporter.ts` writes `users/{uid}/state/desktop` on every status change plus a
  5-minute heartbeat.
- Renderer pages (`src/renderer/src/pages/`) only call `window.api` (preload, typed by
  `src/shared/ipc.ts`). Confirmation dialogs are native (`api.dialog.confirm`) before any
  destructive action.
- Firestore rules require `updatedAt == request.time` (always write `serverTimestamp()`), fixed
  priorities `NOW | SOONER | ANYTIME | SOMEDAY`, append-only sessions, soft delete only. When the
  data model changes, update `firebase/firestore.rules`, its tests, `src/renderer/data/mapping.ts`
  and `docs/requirements.md` §5 together.
- On Linux the app runs through XWayland so always-on-top and window placement work. The npm
  scripts and electron-builder `linux.executableArgs` pass `--ozone-platform=x11` on the command
  line; never use `app.commandLine.appendSwitch` for it (the main process has already picked
  Wayland, only child processes switch, and windows stay invisible). The tray needs the GNOME
  AppIndicator extension.
