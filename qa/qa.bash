#!/usr/bin/env bash
if [ $# -eq 0 ]
then
    echo ">>> Starting full QA testing <<<"
    npm run lint
    npx vitest run
    npx vite build
    for compose in `find qa -name "lab.yaml"`
    do
        echo ">>> bringing up a lab from `dirname $compose`"
        docker-compose -f $compose  --project-directory . up --exit-code-from runner
    done
else
    for arg in $@
    do
        echo ">>> setting up a lab from ./qa/$arg"
        docker-compose -f qa/$arg/lab.yaml  --project-directory . up --exit-code-from runner
    done
fi
