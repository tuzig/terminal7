# This template is customized by project-init ritual based on the project's language
# and tool set. 

PROJECT_NAME := "daonb/terminal7"

list:
    @just --list

# Build the sandbox container
build-sandbox:
    podman machine init --disk-size 30 >/dev/null 2>&1 || true
    podman machine start >/dev/null 2>&1 || true
    podman build -t localhost/asimi-sandbox-{{PROJECT_NAME}}:latest -f .agents/sandbox/Dockerfile .

# Clean up the sandbox container
clean-sandbox:
    podman rmi localhost/asimi-sandbox-{{PROJECT_NAME}}:latest

# Install project dependencies (Node.js / Yarn)
install:
    yarn install

# Run linter & type checker (ESLint + tsc --noEmit)
lint:
    yarn lint

# Run tests (Vitest unit tests + AATP acceptance tests)
test:
    yarn test | tee test.out
    ./aatp/run | tee aatp.out

# Start the Vite development server
run:
    yarn dev

# Build the project for production (Vite)
build:
    yarn build

# Clean build artifacts and caches
clean:
    yarn clean

# Install system dependencies — already present in node:20-bookworm-slim base image
bootstrap:
    node --version && npm --version && yarn --version
