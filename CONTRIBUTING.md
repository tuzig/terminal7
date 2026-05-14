# Contributing to Terminal7

We welcome new contributors and are happy to help, talk to us on our
[discord server](https://discord.com/invite/rDBj8k4tUE).

## Getting Started

If you're on Windows you'd better install WSL2 and use it to run Terminal7.
If you're on Linux or MacOS you should be fine.
Start by forkng the repo and clone it locally.
Terminal7 tests require a running docker daemon.
You can use `docker ps` to ensure it's up and running.
To install, test and run Terminal7 with:

```console
yarn install
yarn test
yarn start
```

Then point your browser at the printed URL, usually http://localhost:5173.

### Building for iOS / Android

Terminal7 ships as a native app via [Capacitor](https://capacitorjs.com/).
To package or live-run on a device or simulator, use the wrapper scripts
(they call `vite build` first so `dist/` is always fresh before Capacitor
copies it into the native project):

```console
yarn build:ios       # produce an iOS IPA
yarn build:android   # produce an Android APK
yarn run:ios         # build + launch on a connected device/simulator
yarn run:android
```

iOS builds require Xcode with a valid signing identity. The iOS native
project lives under `ios/`, the Android one under `android/`.

## Fixing a bug

Found an annoying bug? Great!
Please start by creating an issue with detailed instructions
on how to recreate it.
If you'd like to help fix it, please assign the issue to yourself.
Start by writing a test that recreates the bug and fails.
If it's a low hanging fruit, you can fix it right away.
If not, open a PR with the failing test and we'll get back to you shortly.

## Commit Messages

We believe in keeping our git history clean and readable.
Each commit message should start with a capital later and be in the present progressive tense.
For example, "Adding zapping #123" or "Fixing bug #345".

## Crafting features

If you're missing a feature, please first search the open issues to see if it's already been requested.
If so, please add a comment to the issue to show your interest.
If you'd like to code a feature, please assign it to yourself and open a PR with the
feature's tests. You can and should keep developing the feature and update the PR once the
tests pass anf the feature is done.

## Running Tests

Terminal7 has two sets of test: unit tests and acceptance tests.
Before pushing code, it's recommended to run them:

```console
yarn test
```

A GitHub workflow runs the tests on PRs to ensure the code is solid.
To learn more about the acceptance test, please refer to [./aatp/README.md](./aatp/README.md).

## Git Hooks

Hooks live under `.githooks/` and are wired up automatically by `yarn install`
(via a `postinstall` script that sets `core.hooksPath`).

- **pre-commit** runs `prettier --write` on the staged files and re-stages them.
- **pre-push** runs lint, unit tests, and the acceptance suite.

To bypass a hook for a single git command, pass `--no-verify`.
