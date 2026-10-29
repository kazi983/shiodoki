# Shiodoki: your data and privacy

Shiodoki is made by an individual (Kaoru Kajihara, "the administrator") and shared with people they know.
This page explains what data is saved and who can see it.

[日本語](../ja/privacy.md)

## Two ways to use Shiodoki

| How you use it                | Where your data is               | What the administrator can see                                            |
| ----------------------------- | -------------------------------- | ------------------------------------------------------------------------- |
| On this PC only (recommended) | Your PC only                     | Nothing                                                                   |
| Signed in with Google         | Your PC and the cloud (Firebase) | Everything except task names and notes (the "Not encrypted" column below) |

If you use only one PC, we recommend "Use on this PC only".

Either way, no analytics or advertising tools are used. Your data is not sold or given to third parties.

At startup, the Windows app asks GitHub whether a newer version is available. No tasks or other data are sent.

## On this PC only

Your data is saved only in `store.json` on your PC (Windows: `%APPDATA%\shiodoki\store.json`, Ubuntu:
`~/.config/shiodoki/store.json`) and is never sent over the internet. Nobody outside your PC, including the
administrator, can see it.

This file is not encrypted, so anyone who can use your PC can read it.

## Signed in with Google

The following is saved in Google's Firebase (Cloud Firestore and Firebase Authentication):

| Data           | Encrypted                                                                  | Not encrypted                                                                                                                              |
| -------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Account        | Nothing                                                                    | Your Google account's email address, name, profile picture URL, and an ID assigned by Firebase                                             |
| Tasks          | Task name, note                                                            | Category, order, whether it is done or deleted, total time worked, when it was created, updated and completed                              |
| Work sessions  | Task name                                                                  | Which task (its ID), from when to when, for how many minutes, on a PC or a phone                                                           |
| PC status      | Name of the task in progress                                               | Whether you are picking a task, working, stopped for your next plan, and so on, with the times. Updated every 5 minutes while the app runs |
| Decryption key | The key itself (encrypted with your passphrase and with your recovery key) | Settings used to derive the key (such as the number of iterations)                                                                         |

Your PC also keeps a copy for offline use and your settings (such as the display language).

### How the encryption works

- Task names and notes are encrypted on your PC before they are sent (end-to-end encryption). The cloud holds only
  the encrypted text.
- The key that decrypts them can only be unlocked with your passphrase or your recovery key. Your passphrase and
  recovery key are never sent to the cloud or to the administrator.
- Once unlocked, the key is kept on each PC in the secure storage the operating system provides (such as DPAPI on
  Windows), and deleted when you sign out.
- The length of the encrypted text reveals the **approximate length** of task names and notes.

### Who can see it

- **You**: in the app, you can see and change only your own data. You cannot see other users' data (Firestore
  security rules enforce this).
- **The administrator**: as the owner of the Firebase project, the administrator can see every user's data in the
  Firebase console, but cannot read task names and notes because they are encrypted. What they can see is the "Not
  encrypted" column above (when and how long you worked, how many tasks you have, their categories, and so on). The
  administrator does not look at this either, except when you ask them to investigate a problem.
- **Google**: the data is stored on Google's servers ([Firebase privacy and security](https://firebase.google.com/support/privacy)).
  Google cannot read the encrypted items either.

If you lose both your passphrase and your recovery key, nobody can read the encrypted items. The administrator cannot
recover them either.

## Deleting your data

- You can delete tasks in the app. When you are signed in, they are not removed from the database but marked as
  deleted, so that your other devices stay in sync.
- On this PC only, deleting `store.json` deletes all your data.
- Signing out of the app deletes the data saved on this PC and the unlocked key. Your cloud data stays.
- To **delete all your cloud data** (for example, when you stop using Shiodoki), contact the administrator. They will
  delete your account and all of its data.

## Contact

Contact the administrator directly, or open an issue on [GitHub](https://github.com/kazi983/shiodoki/issues).
Issues are public, so contact the administrator directly about anything personal.

Last updated: 2026-10-29
