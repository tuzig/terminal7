# Agent Documentation: Terminal7

## Project Overview

Terminal7 is a touch-friendly terminal multiplexer built as a hybrid web/mobile
app using CapacitorJS. The client is written in vanilla TypeScript. The backend
counterpart is `webexec`, a WebRTC server written in Go.

## Language & Runtime

- **Primary language:** TypeScript (vanilla — no React/Vue/etc.)
- **Runtime:** Node.js 24 (see `.nvmrc`)
- **Package manager:** Yarn 1.x (classic)
- **Module system:** ES modules (`"type"` is not set; Vite handles bundling)

## Build & Development Commands

| Task             | Command          | Notes                                    |
|------------------|------------------|------------------------------------------|
| Install deps     | `yarn install`   | Uses `yarn.lock`; `postinstall` wires git hooks |
| Dev server       | `yarn dev`       | Vite dev server, usually `localhost:5173`|
| Build            | `yarn build`     | Vite build using `vite.dev.config.js`    |
| Lint             | `yarn lint`      | ESLint + `tsc --noEmit`                  |
| Unit tests       | `vitest run`     | Vitest with jsdom environment            |
| Acceptance tests | `yarn aatp`      | Playwright-based; requires Docker/Podman |
| All tests        | `yarn test`      | Runs `vitest run` then `./aatp/run`      |
| Clean            | `yarn clean`     | Removes `dist/` and copied iOS assets    |

## Coding Style

- **Indentation:** 4 spaces (see `.editorconfig`)
- **Line endings:** LF
- **Charset:** UTF-8
- **Trailing whitespace:** Trimmed (except in Markdown)
- **Prettier** runs on staged files via pre-commit hook
- **ESLint** config in `.eslintrc.cjs`; extends `eslint:recommended` and
  `plugin:@typescript-eslint/recommended`
- Unused variables prefixed with `_` are allowed (config rule)
- Empty catch blocks are allowed

## Project Structure

- `src/`           — Main application TypeScript source
- `tests/`         — Unit test files
- `aatp/`          — Acceptance test procedures (Playwright + Docker labs)
- `css/`           — Stylesheets
- `fonts/`         — Font assets
- `hooks/`         — Git hooks (wired via `.githooks/`)
- `index.html`     — Web entry point
- `vite.config.js` — Vite configuration
- `tsconfig.json`  — TypeScript configuration (target ES2022, module ESNext)

## Testing Conventions

- Unit tests use **Vitest** with jsdom; mocks are set up in `vitest.setup.ts`
- Acceptance tests (`aatp/`) use Playwright and run against Docker-compose labs
  — they require a running Docker/Podman daemon and are not run inside the sandbox
- The `aatp/run` script handles lab setup, build, and teardown
- Always write a failing test first when fixing a bug

## Git Conventions

- Commit messages start with a capital letter, present progressive tense
  (e.g., "Adding zapping #123", "Fixing bug #345")
- Pre-commit hook runs `prettier --write` on staged files and re-stages them
- Pre-push hook runs lint, unit tests, and acceptance suite
- Stage files explicitly by path — never `git add -A` or `git add .`

## Dependencies Philosophy

Keep dependencies to a minimum; prefer built-in/browser-native alternatives
when they exist. Key libraries: xterm.js (terminal emulation), CapacitorJS
(native packaging), interactjs (touch interactions), marked (Markdown).
