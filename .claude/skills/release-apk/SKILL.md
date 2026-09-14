---
name: release-apk
description: >
  Build Lucky Player release APKs and Play Store bundles with EAS under the personal Expo account
  (luqmankhokhar), locally or in the cloud, with keystore backup and preflight checks. Use when the
  user says "build APK", "release APK", "EAS build", "local build", "AAB", "Play Store build",
  "keystore", or "ship the app".
---

# release-apk — Lucky Player EAS builds

## Accounts: read this first

| Account | Used for |
|---|---|
| `luqmankhokhar` | **This project.** Owner in `app.json`; the Expo project is `@luqmankhokhar/lucky-player` (ID `f608163b-6089-4c88-a008-5a4bead3f93b`). |
| Global `eas login` on the dev machine (company account) | Other work. **Never build this project with it.** |

`scripts/eas.sh` makes every EAS command use the personal account:
1. reads only the `EXPO_TOKEN` line from `.env` (git-ignored; never print, paste, or commit it),
2. runs `eas whoami` and stops unless it equals `app.json` `expo.owner`,
3. runs `eas` with the given arguments.

**Always go through the npm scripts or `scripts/eas.sh`. Never run bare `eas build`.**

## New machine setup

```bash
npm install -g eas-cli
# expo.dev, logged in as luqmankhokhar: Account settings > Access tokens > Create
# In your own terminal (not in an AI chat or shared log):
cd ~/kam/Player && nano .env        # one line: EXPO_TOKEN=<token>
npm run eas:whoami                  # must print luqmankhokhar
```

Local builds also need JDK 17 and the Android SDK (`ANDROID_HOME` set).

## Commands

| Goal | Command | Output |
|---|---|---|
| Release APK, built on this machine | `npm run build:apk:local` | `build-*.apk` in the project root (path printed at the end; git-ignored) |
| Release APK, built on EAS servers | `npm run build:apk` | Download link and QR code |
| Play Store bundle | `npm run build:aab` | AAB on EAS; version code auto-incremented |
| Any other EAS command | `npm run eas -- <args>` | e.g. `npm run eas -- build:list -p android` |

Install a local APK on the test phone: `adb install -r build-*.apk`.

## Profiles (`eas.json`)

| Profile | Build type | Notes |
|---|---|---|
| `preview` | APK, internal distribution | For sideloading and testers |
| `production` | AAB | `autoIncrement`; version codes are stored on EAS (`appVersionSource: remote`) |

- User-facing version: `expo.version` in `app.json`. Bump it for each release and commit.
- Version code: `npm run eas -- build:version:get -p android` shows the current value.

## Preflight (every release)

```bash
cd ~/kam/Player
git status --short                 # clean tree; local builds package the working copy
npx tsc --noEmit
npx expo-doctor
npx expo install --check
npm run eas:whoami                 # luqmankhokhar
```

## Signing keystore

- On the first build, let EAS generate the Android keystore and store it remotely.
- Back it up: `npm run eas -- credentials -p android` → download the keystore and keep it outside the repo.
- Losing it means the Play Store listing can never be updated. Never commit `*.jks` or `*.keystore`.

## APK size

libVLC adds roughly 25 MB per CPU architecture. `app.json` → `expo-build-properties` →
`android.buildArchs` currently lists `arm64-v8a`, `armeabi-v7a`, `x86_64`. For a test-only APK,
building only `arm64-v8a` shrinks it a lot; that is an `app.json` change and must be committed
(and reverted before a public release).

## Troubleshooting

| Error | Cause and fix |
|---|---|
| `EXPO_TOKEN belongs to 'X', but app.json owner is 'luqmankhokhar'` | Token from the wrong account. Create a token while logged in as luqmankhokhar. |
| `.env missing` / `EXPO_TOKEN is empty` | Create `.env` with the token (see setup). |
| Slug or project mismatch during `eas init` | `app.json` must keep slug `lucky-player`, owner `luqmankhokhar`, and `extra.eas.projectId`. |
| Local build: `ANDROID_HOME` or SDK not found | Export `ANDROID_HOME=$HOME/Android/sdk` and retry. |
| Build succeeds but the app crashes at start | Install the APK and follow the `run-app` skill's crash and ANR steps. |

## Do not

- Run `eas` directly, or build while logged in only with the company account.
- Commit `.env`, keystores, or `build-*.apk` / `build-*.aab`.
- Edit `android/` by hand; it is regenerated for every EAS build.
