#!/usr/bin/env bash
# npx vitest run
# npx vite build
for compose in `find qa -name "compose.yaml"`
do
    docker-compose -f $compose  --project-directory . up --exit-code-from runner
done
