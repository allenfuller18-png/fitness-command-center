# Fitness Command Center

A mobile-first, private-by-default workout and wellness tracker using Cloudflare Workers. **This is a separate project from NBA 2K27 Build Vault.**

## Status
- The functional source is in the prepared **Fitness_Command_Center_Cloudflare_Public_Source.zip** bundle supplied in ChatGPT.
- A native Google Sheet with your workout plan and logs has been created separately.
- Cloudflare has **not** been deployed; sign-in and Google Sheets sync require dashboard configuration.
- Do not upload personal workout records, Google credentials, private keys, API tokens, or .dev.vars.

## Deployment
1. Add the bundle's `public/`, `src/`, `tests/`, `package.json`, `wrangler.jsonc`, and `.github/workflows/deploy.yml` to this repository.
2. Provision a new Cloudflare Worker called `fitness-command-center` and configure **Cloudflare Access** to restrict access to your email.
3. Set the GitHub Actions repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
4. Set Cloudflare Worker secrets `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ALLOWED_EMAIL`, `GOOGLE_SHEET_ID`, and `GOOGLE_SERVICE_ACCOUNT_JSON`.
5. Share the Google Sheet **only** with your Google service account email, as editor.
6. Run code checks (`npm run check`) and deploy; first test anonymous access is denied before entering health information.

**Security:** Public GitHub code is acceptable only because the Worker denies requests without a valid signed Cloudflare Access assertion. Never publish personal records or secret credentials. The app's local browser data is not encrypted at rest.

## Documentation
See the longer README in the downloadable deployment ZIP for setup and limitations.
