# FitPulse Movement companion

On iOS, Expo Pedometer uses Core Motion. With Motion & Fitness permission and a supported physical device, `getStepCountAsync` reads historical step totals over a requested interval, limited to the past seven days. The app queries local hourly intervals on launch and when it returns to the foreground, then replaces each day's native snapshot on the paired FitPulse account. No JavaScript listener is claimed to keep running while locked.

Expo Pedometer's `watchStepCount` does **not** deliver updates in the background. Its historical `getStepCountAsync` is **iOS only**. Android in this Expo Go-compatible version therefore does not promise locked-screen history; it can still display and add paired manual steps. An Android implementation would need a separate supported Health Connect integration and user consent.

Sources: [Expo Pedometer](https://docs.expo.dev/versions/latest/sdk/pedometer/), [Apple CMPedometer historical queries](https://developer.apple.com/documentation/coremotion/cmpedometer/querypedometerdata(from:to:withhandler:)).

The movement tables are defined in the shared Drizzle schema. The configured post-merge setup pushes this schema to the development database. Replit Publish applies the development-to-production schema diff when the project is published; the API intentionally does not modify schema on startup.

Pairing: create the private key in the web Movement view, paste it into the mobile app. The key is a bearer credential; the server stores its hash, while the phone stores the key in SecureStore. Keep it private. Existing browser sensor estimates and old manual entries cannot be distinguished. When a native snapshot arrives for that date it replaces that older browser total, not adds to it. New manual additions use separate idempotent event IDs, so refreshes of native history do not double-count them. Clearing manual steps never erases native phone history.