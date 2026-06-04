FROM node:24-bookworm-slim

# Install system dependencies (git, curl, ca-certificates, python3, make, g++, ripgrep)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    python3 \
    make \
    g++ \
    ripgrep \
    && rm -rf /var/lib/apt/lists/*

# Install just (universal build tool)
RUN curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --to /usr/local/bin

COPY Justfile .
# Runs as root inside the container — bootstrap must NOT use sudo
RUN just bootstrap
# Asimi runtime — appended to /etc/bash.bashrc so the command-wrapper protocol
# (__asimi_run) used by the podman runner is sourced by every interactive bash
# shell BEFORE /root/.bashrc, regardless of user customizations.
COPY .agents/sandbox/asimi_runtime.sh /tmp/asimi_runtime.sh
RUN cat /tmp/asimi_runtime.sh >> /etc/bash.bashrc && rm /tmp/asimi_runtime.sh

COPY .agents/sandbox/bashrc /root/.bashrc

# Default command: start shell (bashrc handles startup tasks)
CMD ["/bin/bash"]
