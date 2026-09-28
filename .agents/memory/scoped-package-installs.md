---
name: Scoped package installs
description: How to add dependencies to one package when the generic package installer cannot target a pnpm workspace member
---

For dependencies needed by a single pnpm workspace member, use a filtered pnpm add command if the package-management installer rejects a root install.

**Why:** The generic installer invoked an unfiltered pnpm add at the workspace root, which pnpm rejected. Supplying --filter as a package token was also rejected. A filtered pnpm command succeeded without making the dependency a root dependency.

**How to apply:** When adding a dependency to an existing artifact or library, first try the package-management installer. If it cannot scope the package, use pnpm --filter for that member and verify its manifest and lockfile.