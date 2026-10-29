# Using the Shiodoki desktop app

Shiodoki asks "What's your focus now?" every 30 minutes and has you pick one task to work on.
It records the time spent on each task, and before your next plan it warns you and then stops your work.

[日本語](../ja/desktop.md)

## What you need

- Windows 10 / 11, or Ubuntu
- A Google account (only to sync between PCs; you can use the app without signing in)
  - Shiodoki is in a trial, so only accounts the administrator has registered can sign in. Tell the administrator
    which Gmail address you will use.

## Install

### Windows

1. Download `Shiodoki-Setup-<version>.exe` from [GitHub Releases](https://github.com/kazi983/shiodoki/releases) and open it.
2. If you see "Windows protected your PC", click "More info" → "Run anyway".
   - This appears because the app is not code-signed (signing needs a paid certificate).
3. Shiodoki installs without asking anything and starts. Shortcuts are added to the Start menu and the desktop.
4. The Shiodoki icon is under "^" at the bottom right of the taskbar. Drag it onto the taskbar to keep it in reach.

#### Start at sign-in (optional)

The Windows app has no setting to start automatically yet. You can add it to the Windows startup folder:

1. In the Start menu, right-click Shiodoki → "More" → "Open file location".
2. Press `Windows key + R`, type `shell:startup` and press Enter. The startup folder opens.
3. Copy the "Shiodoki" shortcut from the folder in step 1 to the folder in step 2.

### Ubuntu

Download the `.deb` file from [GitHub Releases](https://github.com/kazi983/shiodoki/releases) and install it:

```bash
sudo apt install ./shiodoki_<version>_amd64.deb
```

- The tray icon needs the GNOME extension "AppIndicator and KStatusNotifierItem Support" (the app works without it).
- To start the app at login and when you unlock the screen, follow
  [desktop/linux/README.md](../../../desktop/linux/README.md) (in Japanese).

## First start

The first window asks where to keep your data. Your choice is remembered, so this window does not come back.

| Button                      | Where your data is    | Good for                                                                                      |
| --------------------------- | --------------------- | --------------------------------------------------------------------------------------------- |
| Use on this PC only         | This PC only          | Using one PC. **Pick this if you are not sure.** Not even the administrator can see your data |
| Sign in with Google to sync | The cloud (encrypted) | Using the same tasks on several PCs                                                           |

You can change this later ([Change where your data is kept](#change-where-your-data-is-kept)). For details, see
[Data and privacy](privacy.md).

### Use on this PC only

Click "Use on this PC only" and you can start right away. The app works without an internet connection. Your data
is kept only in a file called `store.json` on this PC ([Where your data is saved](#where-your-data-is-saved)).

### Sign in with Google to sync

1. Click "Sign in with Google to sync". Your browser opens.
2. If you see "Google hasn't verified this app", click "Continue".
   - It appears because this is a personal app that has not gone through Google's review.
   - If you see "Access blocked" and cannot sign in, your account is not registered yet. Contact the
     administrator.
3. When the browser shows "Signed in", close the tab and go back to the app.
4. Set up encryption (next section).

After that you stay signed in, and the app works without an internet connection too. Changes made offline are
saved on your PC and sent automatically when you are back online.

### Set up encryption (only when you sign in)

Task names and notes are encrypted on your PC before they are sent to the cloud. The key that decrypts them can only
be unlocked with your **passphrase** or your **recovery key**. Not even the administrator can read them.

**The first time you sign in**

1. Choose a passphrase (at least 10 characters). A long sentence you can remember works well.
2. Your recovery key is shown once. Click "Copy" or "Save to file" and keep it somewhere safe, such as a password
   manager.
3. Check "I've saved my recovery key" and continue.

**Signing in on another PC**

After signing in, enter your passphrase or your recovery key. That PC does not ask again until you sign out.

> **If you lose both your passphrase and your recovery key, nobody can read your cloud data.** The administrator
> cannot recover it either.

To change your passphrase or create a new recovery key, use "Encryption…" in the tray menu.

## How to use it

### Pick a task every 30 minutes

Pick one task in "What's your focus now?" and start it. The same window comes back after 30 minutes.

| Action                         | What it does                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| Type in the field, press Enter | Add a task                                                                                  |
| Enter / double-click           | Start the selected task for 30 minutes (Enter with the field empty continues the last task) |
| Esc / close the window         | Show the window again in 5 minutes (snooze)                                                 |
| Backspace                      | Mark the selected task as done                                                              |
| Drag                           | Reorder tasks. Drop under another category's heading to change the category too             |

Tasks are grouped into six categories: NOW, ROUTINE, SOONER, ANYTIME, SOMEDAY and BREAK.

### Leave at and wrap-up

The first time you start a task each day, enter the time you **leave** your desk for your next plan
and **how many minutes before it to stop** (0 to 30; 0 means you work until you leave). The fields start from "Defaults for leaving" in the tray
menu (23:00 and "Until I leave" at first).

- You can type the time as digits only, like `2330`, `930` or `9`. A time that has passed means tomorrow.
- Leave the time empty to work without one (no warning, no wrap-up). The next pickers open with the time empty too;
  enter a time when you start a task if a plan comes up.
- **5 minutes before** wrap-up time, a warning appears. You can leave a note for next time.
- At wrap-up time, "Time to leave" fills the screen and cannot be closed. It shows how long you worked
  today, by task. Click "Quit Shiodoki" to finish.
- To use the app again, start it again and enter the time you leave.
- A "day" starts at 4:00 a.m.

### While you work

A ring at the right edge of the screen shows the minutes left (orange for the last 5 minutes). Hover over it to see
the task name and a "Done, pick the next task" button, for when you finish early.

### Manage tasks

Open "Manage tasks" from the tray menu. You can edit a task's name, category and note, search, mark tasks as done
or reopen them, and delete them.

### Tray menu

| Item                         | What it does                                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Pick a task                  | Open the task picker                                                                                                                      |
| Manage tasks                 | Open task management                                                                                                                      |
| Defaults for leaving         | Choose what "Leave at" (None or every 30 minutes) and "Wrap up" (minutes before) start with in the picker. A leave time already set stays |
| Language / 言語              | Choose English, 日本語 or System default (applies after a restart)                                                                        |
| Sign in with Google to sync… | Only without signing in. Sign in with Google and start syncing through the cloud                                                          |
| Encryption…                  | Only when signed in. Change your passphrase or create a new recovery key                                                                  |
| Restart                      | Restart the app                                                                                                                           |
| Sign out                     | Only when signed in. Data saved on this PC and the unlocked key are deleted too (your cloud data stays)                                   |
| Quit                         | Quit the app                                                                                                                              |

A dot at the top left (top right in task management) shows the state of your data: "Synced", "Pending" or "Offline",
or "This PC only" when you use the app without signing in.

## Change where your data is kept

**This PC only → the cloud**: click "Sign in with Google to sync…" in the tray menu, then sign in and set up encryption. If the
cloud has no tasks yet, the app asks whether to copy the tasks and history on this PC to the cloud. If you copy them,
`store.json` on this PC is renamed to `store.json.migrated`.

**The cloud → this PC only**: click "Sign out" in the tray menu, then choose "Use on this PC only". You start with
no data on this PC (your cloud data is not copied).

## Where your data is saved

When you use the app without signing in, all your data is in the file below. To back it up, quit the app and copy
this file.

| OS      | Location                        |
| ------- | ------------------------------- |
| Windows | `%APPDATA%\shiodoki\store.json` |
| Ubuntu  | `~/.config/shiodoki/store.json` |

This file is not encrypted. Keep that in mind if other people use your PC.

## Updating

- Windows: when a new version is available, the app tells you at startup. Click "Update" to download it in the
  background. When it is ready, choose "Restart now" or "Update when I quit". "See what's new" opens the list of
  changes in your browser.
- Ubuntu: there is no notice. Download the new `.deb` from
  [GitHub Releases](https://github.com/kazi983/shiodoki/releases) and install it with the same command as above.

Your tasks, history and sign-in are kept.

## Uninstall

- Windows: Settings → Apps → Installed apps → Shiodoki → Uninstall.
  - Settings and data stay in `%APPDATA%\shiodoki`. Delete the folder if you don't need it.
- Ubuntu: `sudo apt remove shiodoki`. `~/.config/shiodoki` stays.

**If you used the app without signing in, deleting this folder deletes all your tasks and history.** If you were
signed in, your cloud data stays. To delete it, see [Data and privacy](privacy.md).

## Troubleshooting

| Problem                                        | What to do                                                                                                                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Windows protected your PC"                    | Click "More info" → "Run anyway"                                                                                                                                           |
| "Access blocked" when signing in               | Tell the administrator your Gmail address so they can register it                                                                                                          |
| You forgot your passphrase                     | Unlock with your recovery key, then choose a new passphrase in "Encryption…" in the tray menu                                                                              |
| You lost both your passphrase and recovery key | If a PC is still signed in, create a new recovery key there in "Encryption…". Otherwise your cloud data can't be read: ask the administrator to delete it, then start over |
| Can't find the tray icon                       | On Windows, look under "^" at the bottom right of the taskbar. On Ubuntu, install the GNOME extension above                                                                |
| "Shiodoki is already running."                 | Click "Bring to front" to show the running app                                                                                                                             |
| You want to keep working after wrap-up         | Quit the app, start it again and enter the time you leave again                                                                                                            |
| Anything else                                  | Contact the administrator or open an issue on [GitHub](https://github.com/kazi983/shiodoki/issues)                                                                         |
