#!/usr/bin/env bash
if [ $# -eq 0 ]
then
    echo ">>> Starting full QA testing <<<"
    
    npm run lint

    echo ">>> TODO: finish TypeScript refactor and pass the linter"
    npx vitest run || exit 1
    if [ $? -ne 0 ]
    then
        echo ">>> unit tests FAILED"
        exit 2
    fi
    npx vite build
    if [ $? -ne 0 ]
    then
        echo ">>> unit tests FAILED"
        exit 3
    fi
    for compose in `find qa -name "lab.yaml"`
    do
        echo ">>> bringing up a lab from `dirname $compose`"
        docker compose -f $compose  --project-directory . up --exit-code-from runner
    done
else
    npx vite build
    for arg in $@
    do
        echo ">>> setting up a lab from ./qa/$arg"
        docker compose -f qa/$arg/lab.yaml  --project-directory . up --exit-code-from runner
        if [ $? -ne 0 ]
        then
             echo ">>> $arg FAILED"
             exit 4
        fi
        echo ">>> $arg tests PASSED"
    done
fi
