# Deal Recon V3 development plan

Production checkpoint: `37c2764` on `main`. Development branch: `develop/v3-communications`.
The Android application ID stays `com.kenleposa.dealrecon`; debug builds continue using the existing release signing configuration and GitHub Actions secrets. Version code advances from 2 to 5 for the campaign follow-up update build. Do not generate a replacement signing key.

## Architecture reviewed

- `MainActivity.java` hosts the local `index.html` WebView and the existing deed/AI bridges.
- `index.html` contains Owner Recon, Phone Recon, Lead Recon, local `dr2_` arrays, and shared Firestore workspace sync.
- `lead-recon-sourcing.js` and `lead-recon-ai.js` provide lead sourcing and analysis.
- Phone Recon calls an existing Cloudflare Worker URL; the Worker source and its credentials are absent from this repository. No provider credentials belong in the Android app or this Git repository.
- `.github/workflows/android-build.yml` builds an APK using existing signing secrets.

## Execution

1. Preserve production and develop on a branch from `37c2764`. Complete.
2. Connect Owner Recon and Lead Recon to the V3 communications screen without duplicating leads. Complete.
3. Finish Phone Recon handoff, history sync, and provider error handling; audit its Worker authentication, authorization, rate limits, and provider billing before production. Handoff/history sync complete; V3 staging authentication, allowlist, input bounds, and quotas tested; live server audit and cutover pending existing Worker source and Cloudflare access.
4. Add Call Recon outcomes, DNC suppression, mail drafts, mail opt-out, reviewed mailing logs, campaigns, follow-up tasks, and lead-based conversion/ROI reporting. Manual workflows complete, including editable letters saved by lead and letter type with an immutable text snapshot on a logged mailing. Campaign enrollment now schedules three review tasks, prevents duplicate enrollment, and allows removal with cancellation of unfinished cadence tasks. An optional AI suggestion uses the existing app AI bridge only after the user confirms a potentially metered request; it never replaces the draft without review. No outbound automation is enabled.
5. Add server-controlled dispatch, opt-in and suppression rules, billing limits, webhook verification, retries, and audit logs before enabling automated calls or mail. Pending provider selection, server infrastructure, and explicit approval of charges.
6. Run JavaScript workflow checks before the Android build; produce an update-compatible signed APK with the existing key. Checks pass locally; APK build requires Android SDK/Gradle or GitHub Actions access.

## Data and operational limits

Communications arrays use the existing `dr2_` storage and shared Firestore document. This document has finite size and concurrent writes currently use last-writer-wins; migrate to per-record collections with access rules before mass campaigns or multi-agent use. Logging a mail event confirms a letter was mailed outside the app; it never sends one. Follow-up creates tasks for review, not scheduled remote outreach. ROI reflects entered revenue and logged cost; untracked expenses are excluded. The current mail draft includes a disclosure review placeholder and must be completed before sending.
