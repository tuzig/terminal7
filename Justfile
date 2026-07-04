# This template is customized by project-init ritual based on the project's language
# and tool set. 

PROJECT_NAME := `git config --get remote.origin.url | sed -E 's/.*[:\/]([^\/]+)\/([^\/]+)\.git$/\1\/\2/'`

list:
    @just --list

# Build the sandbox container
build-sandbox:
    podman machine init --disk-size 30 >/dev/null 2>&1 || true
    podman machine start >/dev/null 2>&1 || true
    podman rmi localhost/asimi/sandbox/{{PROJECT_NAME}}:latest 2>/dev/null || true
    podman build -t localhost/asimi/sandbox/{{PROJECT_NAME}}:latest -f .agents/sandbox/Dockerfile .

# Clean up the sandbox container
clean-sandbox:
    podman rmi localhost/asimi/sandbox/{{PROJECT_NAME}}:latest

# Install project dependencies (language-specific) — customize for your project
install:
    yarn install --frozen-lockfile

# Run linter & formatter (language-specific) — customize for your project
lint:
    yarn lint

# Run tests (language-specific) — customize for your project
test:
    yarn test

# Start the program or server — customize for your project
run:
    yarn dev

# Build the project — customize for your project
build: install
    yarn build

# Clean build artifacts and caches — customize for your project
clean:
    yarn clean

# Install system dependencies — customize for your project
bootstrap:
    @echo "yarn already available in node base image"
