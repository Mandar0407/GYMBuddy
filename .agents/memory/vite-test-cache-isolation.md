---
name: Vite test cache isolation
description: Avoid disrupting a running preview when loading TSX through Vite for runtime tests
---

Give alternate Vite test loaders a separate disposable dependency cache from the development server.

**Why:** A middleware-only test loader with different configuration invalidated the running preview's optimized dependencies, producing 504 errors and a blank screenshot even though both tests and the server were healthy.

**How to apply:** When using Vite to load actual components in automated tests, isolate its cache and clean it up after the suite. Do not treat a passing runtime test as proof that a concurrently running preview was unaffected.