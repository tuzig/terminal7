# Agent Context: Terminal7

This document provides context for AI coding agents operating within the Terminal7 repository.

## Project Overview

Terminal7 is a touch-friendly terminal multiplexer, similar to `tmux` or `screen`, designed for modern web and mobile clients. It primarily uses WebRTC for real-time communication. The application is built as a hybrid app using CapacitorJS, allowing it to be deployed as a PWA on the web and as a native app on iOS and Android.

The client-side is written in vanilla TypeScript. The backend counterpart is `webexec`, a WebRTC server written in Go, which is based on `pion/webrtc`.

## Key Technologies

- **Framework/Platform:** CapacitorJS for building the hybrid app.
- **Language:** TypeScript
- **UI/Terminal Emulation:** Xterm.js
- **Build Tool:** Vite
- **Testing:**
    - **Unit/Component Tests:** Vitest
    - **End-to-End/Acceptance Tests:** Playwright and a custom test runner in `aatp/`.
- **Linting & Type-checking:** ESLint and TypeScript (`tsc`).
- **Package Manager:** Yarn (inferred from `yarn.lock`).

## Dependencies

A Vanilla TypeScript project, we do use xtermjs for emulation and capacitorjs for packaging as iOS and Android apps. We keep our dependencies to a minimum and always prefer built-in alternatives if they exist.

## Project Structure

- `src/`: Main application source code (TypeScript).
- `tests/`: Unit tests for the application.
- `aatp/`: Acceptance tests, including Docker-based infrastructure setup.
- `css/`: Stylesheets for the application.
- `index.html`: Main entry point for the web app.
- `vite.config.js`: Vite build configuration.
- `package.json`: Project dependencies and scripts.
- `tsconfig.json`: TypeScript configuration.

## Important Commands

- **Install Dependencies:**

    ```bash
    yarn install
    ```

- **Run Development Server:**

    ```bash
    yarn dev
    ```

- **Build to Test Integrity:**

    ```bash
    yarn build
    ```

- **Build / Run the Native Apps:**
  These wrappers run `vite build` first so the web bundle in `dist/` is always
  fresh before Capacitor copies it into the native project. Use these instead
  of calling `npx cap build|run` directly.

    ```bash
    yarn build:ios       # produce an iOS IPA
    yarn build:android   # produce an Android APK
    yarn run:ios         # build + launch on a connected device/simulator
    yarn run:android
    ```

- **Run Tests:**
    - **Run all tests (Unit and Acceptance):**
        ```bash
        yarn test
        ```
    - **Run only unit tests:**
        ```bash
        vitest run
        ```
    - **Run only acceptance tests:**
        ```bash
        yarn aatp
        ```

- **Linting and Type Checking:**
    - This command checks for code style issues and type errors. It should be run after making changes to ensure code quality.
    ```bash
    yarn lint
    ```

## Development Conventions

- **Package Manager:** Yarn (v1). All commands should use `yarn`, not `npm`.
- **Language:** Vanilla TypeScript. Keep dependencies minimal; prefer built-in alternatives.
- **Build Tool:** Vite. The dev server runs on port 5173 (`yarn dev`).
- **Formatting:** Prettier (enforced via pre-commit hook).
- **Linting:** ESLint + TypeScript (`tsc --noEmit`).
- **Testing:**
    - Unit tests: Vitest with jsdom environment.
    - E2E / Acceptance tests: Custom AATP runner under `aatp/` (uses Playwright + Docker infra).
- **Git Hooks:** Configured via `.githooks/`. Pre-commit runs prettier; pre-push runs lint + tests.
- **Commit Style:** Present progressive tense, starts with a capital letter (e.g. "Adding zapping #123").
- **Code Style:**
    - Prefer explicit types over `any`.
    - Use `const` / `let`; avoid `var`.
    - Keep functions small and focused.
    - `yarn test` runs everything before pushing is recommended.
- **Native builds** (iOS/Android) are done via Capacitor wrapper scripts (`yarn build:ios`, `yarn run:android`, etc.) which always rebuild the web bundle first.
- **`vite` in `dependencies`:** Yarn v1 has a known bug where it fails to link a peer dependency that's only in `devDependencies` when a package (vitest 4.x) declares it in both `dependencies` and `peerDependencies`. Moving `vite` to `dependencies` ensures it's hoisted at the top level. Do NOT move `vite` back to `devDependencies` without also switching to a package manager that handles peer deps correctly (e.g., yarn v3+ or pnpm).
