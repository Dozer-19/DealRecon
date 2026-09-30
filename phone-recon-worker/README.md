# Phone Recon V3 Worker — staging source

This replacement is intentionally **not deployed**. The installed app still points to the existing `deal-recon-phone-recon` Worker. The existing Worker source was supplied separately for review; it obtains Enformion credentials from Cloudflare environment variables and can call the paid Enformion Contact Enrichment endpoint. Its live configuration, secret values, and billing behavior have not been audited.

Security implemented here:

- Firebase `deal-recon` ID tokens: RS256 signature verified against Google's rotating securetoken JWKS; audience, issuer, subject, issue time, expiration, and auth time checked.
- Server-side UID allowlist (`ALLOWED_FIREBASE_UIDS` secret). Missing allowlist rejects every lookup.
- Lookup switch defaults off; missing daily or monthly quota rejects every lookup. The Durable Object stores counters atomically for each authorized user.
- Bounded JSON payloads; no contact details or tokens in server logs; narrow CORS for the Android file origin. CORS alone is not access control.
- The adapter preserves the existing Enformion request and candidate fields. It requires `ENFORMION_AP_NAME` and `ENFORMION_AP_PASSWORD` as server-side secrets, and runs only when `LOOKUPS_ENABLED=true` with authentication, allowlisting, and quotas configured. Each approved user action can make up to four Enformion requests (two owners by two addresses), so a daily cap of N user actions may permit 4N provider requests. Failed provider attempts also consume the user-action quota. No credential is included in this repository.

The staged `secure-client.mjs` attaches the signed-in Firebase ID token and validates the new endpoint. It is not loaded by the Android app; loading it before the server cutover could break the working lookup.

Before any cutover: review the Cloudflare account configuration, provider terms, billing and logs; choose a monthly spending limit; verify authenticated preflight behavior in Android; then deploy this replacement to a separate staging URL with `LOOKUPS_ENABLED=false`. Only after end-to-end testing and explicit approval for paid lookups should the Android client use that URL and the provider be enabled. Do not put a credential in source code or a public build.

Run the local security checks with `node tests/phone-recon-worker.test.mjs`. This test generates a temporary RSA key and makes no external requests.

## Staging deployment access

The supplied production `wrangler.jsonc` names `deal-recon-phone-recon` and contains no account ID. The V3 `wrangler.toml` deliberately uses a different name, `deal-recon-phone-recon-v3`. The GitHub Actions workflow `.github/workflows/phone-recon-staging.yml` runs only from `develop/v3-communications` when this workflow file changes (or by manual dispatch after GitHub registers the workflow), tests locally, confirms that lookups and quotas are off, and then deploys the separate Worker. It does not configure Enformion credentials. It will fail safely until both of these repository Actions secrets exist:

- `CLOUDFLARE_V3_STAGING_API_TOKEN`: a dedicated, least-privilege Cloudflare API token with permission to deploy Workers in the intended account. Never paste it in chat or commit it to the repository.
- `CLOUDFLARE_ACCOUNT_ID`: account identifier from Cloudflare. Store it as an Actions secret for simple setup.

Adding the secrets does not deploy anything by itself; changing the staging workflow file on the V3 branch triggers a staging deployment. Keep access to the development branch restricted to trusted collaborators while the deployment token exists. Rotate or remove the token when it is no longer needed. No live production Worker or Android endpoint is targeted by this workflow.
