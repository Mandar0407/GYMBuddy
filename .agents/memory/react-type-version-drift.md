---
name: React type-version drift
description: Cross-library ref incompatibility from multiple React type versions in the workspace
---

When a React UI library and the web app resolve different minor versions of React types, refs can fail static compatibility even though the runtime component works. Prefer a small callback-ref boundary or derive props from the library component type instead of masking the error or changing the whole UI library.

**Why:** A mobile-workspace merge left two React type versions in the dependency graph. The conflict appeared only in ref forwarding and SVG prop spreading while the app's functional code was otherwise valid.

**How to apply:** If a leaf typecheck reports structurally identical React ref types as incompatible, inspect the resolved type paths before attributing it to a runtime hook issue.