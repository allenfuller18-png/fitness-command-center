# Fitness Command Center

A mobile-first workout, walking, and wellness tracker for a gentle four-week foundation. Separate from the NBA 2K27 Build Vault. **Source code is public; the deployed website and data are intended to be private.**

## Project status (2026-11-20)

- Complete website source committed: `public/index.html`, `public/app.js`, `public/style.css`, `public/sw.js`, `src/worker.js`, manifest, icon, tests, and Wrangler config.
- GitHub CI checks pass. The automated workflow tests the code but **does not deploy**.
- The owner reports completing the Cloudflare Git connection and initial deployment. **Live Worker URL, access policy, and private-data protection have not been independently verified.** The Worker fails closed until authentication settings exist.
- A native Google Sheets tracker exists, but live sync requires a Google service account and Worker secrets.
- The assistant inside the app is rules-based; it is **not** a connected AI model. Live AI, email sending, and private push notifications are still future integrations.

## Easiest deployment — connect Cloudflare directly to GitHub

1. Sign in at https://dash.cloudflare.com/ with the **same Cloudflare account** used to host the user's NBA 2K27 site.
2. Navigate to **Workers & Pages → Create → Import a repository / Connect to Git** (labels vary).
3. Authorize the Cloudflare Workers GitHub app if prompted, and select `allenfuller18-png/fitness-command-center`.
4. Use Worker name `fitness-command-center`; choose production branch `main`, repository root `/`. Use the existing `wrangler.jsonc`; deploy command `npx wrangler deploy`. Cloudflare Workers Builds handles authentication for deployment—**no GitHub API token secrets are needed** with this direct integration.
5. Deploy. At this stage an unauthenticated or unconfigured request should fail: this is deliberate.
6. On the new Worker enable **Cloudflare Access** for production `workers.dev` and preview URLs. Configure an Allow policy for **only your sign-in email**. Avoid public/bypass policies. Use Cloudflare's official [Access for Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) setup.
7. In Worker **Settings → Variables and Secrets**, set `ACCESS_TEAM_DOMAIN` (full HTTPS Access issuer), `ACCESS_AUD` (the Access app's audience ID), and `ALLOWED_EMAIL` (your authorized sign-in email). Keep the values out of GitHub.
8. Test an incognito session: the site must require Access sign-in and not show private content anonymously.

## Google Sheets synchronization

1. Create a Google Cloud service account in a project with Google Sheets API enabled. Generate credentials securely.
2. Open the separately created native spreadsheet and share **only that spreadsheet** with the service account `client_email`, granting Editor access.
3. Set these additional **Cloudflare Worker secrets**: `GOOGLE_SERVICE_ACCOUNT_JSON` (full service-account JSON, added only in Cloudflare's dashboard) and `GOOGLE_SHEET_ID` (the native tracker spreadsheet ID).
4. Keep the hidden `App Sync` tab in the Sheet. The Worker stores versioned full JSON state there and mirrors readable log rows to the other tabs. The site saves locally offline and synchronizes when online.
5. Verify by entering a *test* workout and confirming a matching new row in the Sheet. Before adding sensitive information, test sign-in, data export, and conflict handling.

## Security and limitations

- Never commit health logs, private email addresses, Google credentials, API tokens, `.dev.vars`, or service-account key files.
- **Do not share credentials in chat.** Enter them directly in Cloudflare/Google dashboards.
- Google Sheets remote version checks are not a transactional database. Avoid simultaneous editing across devices.
- Offline workout records are stored in browser local storage and **are not encrypted at rest**. Use device protection and avoid shared/untrusted devices. Export regular backups.
- Workouts, breathing, and pain guidance are not a diagnosis; worsening breathing trouble or significant pain should interrupt exercise.
- Once Cloudflare Git integration is connected, push to `main` can deploy automatically. Its first deployment should occur **before** saving real workout data and should be verified for Access protection.

## Local development

```sh
npm install
npm run check
npm run dev
```

Worker authentication requires properly configured secrets. Local testing of a private site without configured authentication intentionally returns an error.

[Cloudflare Git integration documentation](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)

## Deployment verification and new safeguards (November 20, 2026)

- A private Google Sheets tracker and the complete GitHub source exist, but **successful GitHub CI is not proof of successful Cloudflare deployment**.
- Verify that visiting the Worker URL in a logged-out private browser cannot reveal the home page or any health data. Then verify authorized sign-in, `/api/status`, and a non-sensitive test record.
- Clearing local records no longer attempts to delete the remote Google Sheet. When a local/cloud conflict is resolved by selecting the cloud copy, a local recovery snapshot is saved. Settings includes a **Recover previous local copy** button.
- An optional Cloudflare Workers AI coach endpoint is present, but **disabled**. To enable it later, add a Workers AI binding named `AI` in Wrangler (or the Cloudflare dashboard), and set `AI_ENABLED=true` as a Worker variable. Inference can incur Cloudflare charges: confirm pricing first. The app asks before sharing a short workout summary; questions are submitted only when the user sends them.
- No secrets, health records, or private credentials belong in the public repository.
