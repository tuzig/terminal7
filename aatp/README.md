# Quality Automation

TL;DR: from the project root, run `./aatp/run`.

This folder contains the automated acceptance test procedures for Terminal7.
Each suite spins up a self-contained lab using compose (a browser runner,
the Terminal7 web bundle, a `webexec` server, and — where relevant — a
`peerbook` server plus its Redis, mock RevenueCat and mock SMTP). Tests
are driven by [Playwright](https://playwright.dev).

## Test suites

Each subdirectory with a `lab.yaml` is a suite:

| Suite                  | Focus                                      |
| ---------------------- | ------------------------------------------ |
| `aatp/ui`              | Terminal7 UI behaviour with no backend     |
| `aatp/http_webrtc`     | Direct HTTP/WebRTC connection to `webexec` |
| `aatp/peerbook_webrtc` | Connection via `peerbook` signalling       |
| `aatp/sec`             | Security-related scenarios                 |

## Running

`./aatp/run` first runs `npm run build` to produce the web bundle the lab
serves, then for each suite it builds the compose images and brings the
lab up with `--exit-code-from runner` so the test container's exit status
drives the result.

With no arguments it discovers every `lab.yaml` under `aatp/` and runs
each one sequentially. Pass one or more suite directories to limit the
run:

```
./aatp/run aatp/peerbook_webrtc aatp/http_webrtc
```

### Flags

| Flag | Meaning                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `-h` | Print usage and exit                                                                                                                 |
| `-n` | Don't rebuild the lab images (use whatever is cached)                                                                                |
| `-z` | Build images with `--no-cache` (force a clean rebuild)                                                                               |
| `-l` | Leave the lab running after the suite finishes (skip `down -v`) — handy for poking around with `docker compose exec` / `podman exec` |

### Container engine

The script auto-detects the engine. `podman` is preferred; if not
installed it falls back to `docker`. On macOS with podman the script
locates the podman API socket (`podman-machine-default-api.sock` under
`$DARWIN_USER_TEMP_DIR`, then `$XDG_RUNTIME_DIR`, then `/run/user/$UID`)
and exports `DOCKER_HOST` so the bundled `docker-compose` shim can reach
it. Make sure `podman machine start` has been run.

If neither engine is present the script exits with a hint to install
podman.

## Playwright options

Pass extra flags to Playwright via the `PWARGS` env var. A common one is
`-x` to stop after the first failure (keeps the logs short):

```
PWARGS=-x ./aatp/run aatp/peerbook_webrtc
```

`PWARGS` defaults to `-x -j 1` inside the runner image. Run
`npx playwright test --help` for the full list of options.

Test artefacts (traces, screenshots) land in `aatp/result/`.

## Backend binaries (webexec & peerbook)

The `webexec` and `peerbook` services are built from source at
image-build time — there are no pre-built binaries in this repo.

- `webexec` &larr; `go install github.com/tuzig/webexec@${WEBEXEC_REF}`
  in `aatp/infra/webexec/Dockerfile`
- `peerbook` &larr; `go install github.com/tuzig/peerbook@${PEERBOOK_REF}`
  in `aatp/infra/peerbook/Dockerfile`

Both refs default to `master`. To pin a branch, tag, or commit, export
the variable before invoking the runner:

```
WEBEXEC_REF=v1.5.1 PEERBOOK_REF=master ./aatp/run aatp/peerbook_webrtc
```

Changing a `*_REF` requires a rebuild — drop `-n` (or pass `-z` to bust
the Go module cache).

### Using a locally built webexec

To test a webexec binary you built yourself (e.g. while debugging a fix
in the `webexec` repo), set `WEBEXEC_BIN` to its absolute path:

```
WEBEXEC_BIN=/path/to/your/webexec ./aatp/run aatp/peerbook_webrtc
```

The runner verifies the file is executable, then layers in
`aatp/infra/webexec/local-bin.override.yaml`, which bind-mounts it over
`/usr/local/bin/webexec` inside the container. The binary must be
Linux-compatible (the image is `golang:alpine`); cross-compile from macOS
with `GOOS=linux GOARCH=amd64 go build`.

There is no equivalent override for `peerbook` yet — use `PEERBOOK_REF`
pointing at your branch/commit.
