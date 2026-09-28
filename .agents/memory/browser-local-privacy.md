---
name: Browser-local privacy
description: The accepted storage-security tradeoff for FitPulse web
---

Keep FitPulse's browser-local profile and pairing data usable across visits without pretending that client-side obfuscation makes it secret from the device owner. Explain the visibility of a pairing key where it is shown.

**Why:** The user explicitly chose to keep browser-local storage and accept its visibility after being offered passphrase-protected storage or server-managed accounts. An encryption key included in client code would be recoverable by the same browser and create a false security claim.

**How to apply:** Preserve the existing local persistence model for normal FitPulse changes. If the user later requests protection from someone who can inspect browser storage, discuss the needed passphrase or server-account tradeoff rather than adding a bundled key or reversible encoding.