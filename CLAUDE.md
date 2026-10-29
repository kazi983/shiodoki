# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Shiodoki (潮時, "the right moment to switch") is v2 of a desktop app that asks the user every
30 minutes which task to work on and tracks time per task, with a "leave time" schedule (離席時刻:
when the user has to get up from the desk for their next plan, not the end of a workday) that
warns and then blocks work shortly before it. Tasks sync through Firebase (Cloud Firestore) so an Android app (`android/`, in progress) can
read and edit them. v1 (Python/Tkinter) lives in kazi983/30min-task-timer-python and is still in
daily use until v2 replaces it. The repository is kazi983/shiodoki, the Firebase project is
`shiodoki-e4e8f` and the local data directory is `shiodoki`. v2 does not read v1 data; only the
local-mode store is offered for upload on first sign-in.

`docs/requirements.md` is the source of truth for scope, the Firestore data model (§5) and the
phase plan (§9). Update it when decisions change. User-facing docs (READMEs, requirements) are
written in Japanese.

## Coding conventions

- Write comments, commit messages, and identifiers in English.
- Push work to a branch named after the change (`feat/…`, `fix/…`, `docs/…`, e.g.
  `feat/routine-break-categories`), not to an auto-generated session branch.
- Firebase config values in `desktop/src/shared/firebaseConfig.ts` are public by design. Never
  commit `desktop/resources/oauth-client.json` (Google OAuth client, gitignored) or any service
  account key.

## Layout and commands

- Repo root — formatter and linter: Prettier for every file type it supports, Markdown
  included (`.prettierrc.json`, 120 columns), and ESLint for the JS/TS parts (`desktop/`,
  `firebase/`; `eslint.config.mjs`, no type information). `npm install` at the root installs them and the
  husky pre-commit hook (lint-staged: Prettier + ESLint on staged files). Before committing,
  run `npm run format:check` and `npm run lint` at the root; CI (`.github/workflows/lint.yml`)
  runs both. `.claude/settings.json` formats every file Claude edits. The whole-tree format
  commit is listed in `.git-blame-ignore-revs` (`git config blame.ignoreRevsFile .git-blame-ignore-revs`).
- `firebase/` — `firestore.rules`, emulator config, rules tests. `npm test` runs the rules tests
  on the Firestore emulator (Java 21+). `npm run deploy:rules` deploys to project
  `shiodoki-e4e8f` (`.firebaserc`). `npm run backup` (`scripts/backup.mjs`) reads one user's data from production
  with the Admin SDK and Application Default Credentials, read-only (steps in `firebase/README.md`).
- `desktop/` — Electron + TypeScript + React (electron-vite). Before committing, run in
  `desktop/`: `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run e2e:headless`.
  Integration and Firebase E2E tests start the emulators via `../firebase/node_modules/.bin/firebase`,
  so `npm install` in `firebase/` first. Tests never touch the real Firebase project.
  - `npm run dev` (Firebase), `npm run dev:local` (`TIMER_LOCAL=1`, JSON file only),
    `TASK_MODE=test` shrinks intervals (30 min → 5 s, snooze 5 min → 10 s).
  - `TIMER_FIREBASE_EMULATOR=1` points the app at the emulators with a fake Google account (E2E).
  - `desktop/linux/` starts the installed app at login and on screen unlock, outside the app (GNOME
    autostart + a systemd user service); install steps in its README.
  - UI text lives in `src/shared/i18n/` (`ja.ts` defines the keys, `en.ts` is typed by it; terms in
    `docs/i18n/glossary.md`). Never hardcode UI text: `tests/i18n.test.ts` fails on Japanese outside
    the dictionary. Language: `SHIODOKI_LOCALE=en|ja` > the tray setting (`userData/settings.json`,
    applied on restart) > the OS (`ja*` → Japanese, else English).
- `android/` — Kotlin + Jetpack Compose, package `dev.kaorukajihara.shiodoki` (debug builds:
  `dev.kaorukajihara.shiodoki.debug`, so they install next to the release build; they always run
  in test mode like desktop `TASK_MODE=test`, `FocusConfig.TEST`). Design:
  `docs/android/design.md`. Build with Android Studio's JDK (`JAVA_HOME=/snap/android-studio/current/jbr`):
  `./gradlew assembleDebug testDebugUnitTest`. `app/google-services.json` is public and committed.
  - Kotlin 2.4.20 is forced via `org.jetbrains.kotlin.android` in the root build (AGP 9.4.1's
    built-in Kotlin 2.2 cannot read libraries built with Kotlin 2.4); keep all Kotlin plugins on
    the same version.
  - `shiodoki.useFirebaseEmulator=true` in `local.properties` makes debug builds use the emulators
    at `10.0.2.2` with the desktop E2E fake Google account. API 37 needs `ACCESS_LOCAL_NETWORK`
    (debug manifest only), so install with `adb install -r -g`.
  - UI text lives in `res/values/strings.xml` (English, the fallback) and `res/values-ja/strings.xml`
    (terms in `docs/i18n/glossary.md`); `StringResourcesTest` checks both have the same keys and
    placeholders. `model` and `data` stay free of `R` (labels via `ui/Labels.kt`).
    `NoHardcodedTextTest` fails on Japanese in Kotlin. The language follows the OS or the system
    per-app language setting (`generateLocaleConfig`).

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
- Storage is chosen on the welcome page (`settings.json` `storage`: `local` | `cloud`; `TIMER_LOCAL=1` overrides).
  Cloud mode is end-to-end encrypted (`docs/e2ee/design.md`): `EncryptionService` holds the data key in the main
  process only (kept with `safeStorage` in `userData/dek.bin`), and `FirestoreTaskRepository` encrypts task names,
  memos and session / desktop-state task names before they reach the data window and decrypts snapshots. Never log
  plain task names or secrets (the data window's console warnings are forwarded to the terminal).
- `desktopStateReporter.ts` writes `users/{uid}/state/desktop` on every status change plus a
  5-minute heartbeat.
- Renderer pages (`src/renderer/src/pages/`) only call `window.api` (preload, typed by
  `src/shared/ipc.ts`). Confirmation dialogs are native (`api.dialog.confirm`) before any
  destructive action.
- Firestore rules require `updatedAt == request.time` (always write `serverTimestamp()`), fixed
  priorities `NOW | SOONER | ANYTIME | SOMEDAY`, append-only sessions, soft delete only, and ciphertext
  (`e1:` + base64) for names, memos and session task names. When the
  data model changes, update `firebase/firestore.rules`, its tests, `src/renderer/data/mapping.ts`
  and `docs/requirements.md` §5 together.
- On Linux the app runs through XWayland so always-on-top and window placement work. The npm
  scripts and electron-builder `linux.executableArgs` pass `--ozone-platform=x11` on the command
  line; never use `app.commandLine.appendSwitch` for it (the main process has already picked
  Wayland, only child processes switch, and windows stay invisible). The tray needs the GNOME
  AppIndicator extension.
