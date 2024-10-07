# Contributing to Terminal7

We welcome new contributors and are happy to help, talk to us on our
[discord server](https://discord.com/invite/rDBj8k4tUE).

## Getting Started

Please fork and clone this repo. Terminal7 tests require a running docker daemon.
So if `docker ps` works, you can install, test and run Terminal7 with:

```console
yarn install
yarn test
yarn start
```
Then point your browser at the printed URL, usually http://localhost:5173.

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
