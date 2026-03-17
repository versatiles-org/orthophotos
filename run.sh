#!/usr/bin/env bash
exec node --env-file=config.env --import tsx/esm src/run.ts "$@"
