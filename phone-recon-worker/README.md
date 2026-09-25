# Phone Recon V3 Worker — staging source

This replacement is intentionally **not deployed** and does not call a contact provider. The installed app still points to the existing `deal-recon-phone-recon` Worker. The old Worker source is not in this repository, so its live configuration, secret storage, and billing behavior have not been audited.

Security implemented here:

- Firebase `deal-recon` ID tokens: RS256 signature verified against Google's rotating securetoken JWKS; audience, issuer, subject, issue time, expiration, and auth time checked.
- Server-side UID allowlist (`ALLOWED_FIREBASE_UIDS` secret). Missing allowlist rejects every lookup.
- Lookup switch defaults off; missing daily or monthly quota rejects every lookup. The Durable Object stores counters atomically for each authorized user.
- Bounded JSON payloads; no contact details or tokens in server logs; narrow CORS for the Android file origin. CORS alone is not access control.
- Provider adapter is absent by design. Even setting `LOOKUPS_ENABLED=true` returns a paused response after the quota check. No paid lookup is possible from this code.

The staged `secure-client.mjs` attaches the signed-in Firebase ID token and validates the new endpoint. It is not loaded by the Android app; loading it before the server cutover could break the working lookup.

Before any cutover: obtain and inspect the existing Worker source and Cloudflare account configuration; review provider terms, billing and logs; rotate any exposed provider credential; choose a monthly spending limit; add a bounded provider adapter and tests; verify authenticated preflight behavior in Android; then deploy this replacement to a separate staging URL. Only after end-to-end testing should the Android client use that URL and send its Firebase ID token. Do not set a provider credential or enable lookups based solely on these files.

Run the local security checks with `node tests/phone-recon-worker.test.mjs`. This test generates a temporary RSA key and makes no external requests.
