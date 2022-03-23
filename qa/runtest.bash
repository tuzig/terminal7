#!/usr/bin/env bash
# run this script from Terminal7's project root
npm run build
docker-compose -f bb/test1.yaml --project-directory . up
