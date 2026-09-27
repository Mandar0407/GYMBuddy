#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Apply the committed Drizzle schema to the development database after merge.
# Replit Publish independently diffs dev and production schemas before publishing.
pnpm --filter @workspace/db run push
