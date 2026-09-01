# Private Android admin app

`apps/mobile-admin` is a separate Capacitor application for ADMIN users. It never contains provider credentials or payment details. Google OAuth finishes with a 60-second, single-use code; the API exchanges it for a 15-minute access token and rotating 30-day refresh token. Tokens are stored by the native secure-storage plugin in Android Keystore-backed encrypted storage.

## Runtime configuration

API/worker environment:

- `MOBILE_ADMIN_REDIRECT_URI=studioadmin://oauth/callback`
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` from a Firebase service account
- Optional `PROVIDER_MONITOR_INTERVAL_MS` and `PROVIDER_ALERT_COOLDOWN_MS`
- Existing provider, database, Redis, Google OAuth, `JWT_SECRET`, `ADMIN_EMAILS`, and API URL variables

Mobile build environment:

- Copy `apps/mobile-admin/.env.example` to `.env.staging` or `.env.production`.
- Set `VITE_API_BASE_URL` to the HTTPS API origin. Cleartext HTTP is disabled in the Android manifest.
- Put the Firebase Android client file at `apps/mobile-admin/android/app/google-services.json`. Its package must be `com.prompt2spot.admin`. This file is intentionally not committed.

Google OAuth uses the API's existing HTTPS callback URI. Add that callback URI to the Google OAuth client; the API performs the final custom-scheme redirect after validating OAuth state and the ADMIN role.

## Builds

```powershell
pnpm --filter @studio/mobile-admin android:staging
pnpm --filter @studio/mobile-admin android:production
```

The staging command creates a debug-signed APK under `apps/mobile-admin/android/app/build/outputs/apk/debug/`. For a private production-signed APK, provide an organization-controlled Android keystore and set:

```powershell
$env:ADMIN_KEYSTORE_FILE="C:\secure\prompt2spot-admin.jks"
$env:ADMIN_KEYSTORE_PASSWORD="..."
$env:ADMIN_KEY_ALIAS="prompt2spot-admin"
$env:ADMIN_KEY_PASSWORD="..."
pnpm --filter @studio/mobile-admin android:production
```

Gradle only enables release signing when all four variables exist; no fallback secret is embedded. Distribute the signed APK through the organization's private channel and record its SHA-256 checksum.

## Operations and security

- Provider top-up actions return only hard-coded official HTTPS billing URLs and open them in a native Custom Tab, not an embedded payment WebView.
- ADMIN-only FCM device tokens are removed on logout, revoked-device handling, or invalid-token responses.
- Polling records source freshness and never fabricates balances. When no official balance endpoint exists, the monitor reports health/configuration or an explicitly labeled estimate.
- Runtime provider failures create immediate alerts. Alert fingerprints, cooldowns, recovery events, and acknowledgement prevent push floods while keeping an audit trail.
- Sensitive views, threshold changes, billing-link opens, alert acknowledgements, user changes, and credit adjustments are written to `AuditLog`.
- Lost device: revoke its `AdminDevice` and active `MobileRefreshToken` rows, or use the app logout endpoint if the device is available.

Before release, apply the Prisma migration, verify Firebase delivery on a physical Android 13+ device, test OAuth return from Chrome Custom Tabs, test token reuse rejection, and confirm that release signing reports the expected certificate.
