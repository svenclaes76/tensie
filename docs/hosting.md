# Hosting

Tensie is a static site: `npm run build` writes everything to `build/`. It is hosted for free on
Cloudflare Pages, which builds it from GitHub on every push to `main`. The host never sees
readings: they live on the phone and in Supabase.

## What the repo already sets up

- **Security headers** (`static/_headers`): HTTPS only (HSTS), no embedding in other sites, no
  referrer, no camera/microphone/location, `noindex` for search engines.
- **Content Security Policy**: a `<meta>` tag SvelteKit writes into the page with hashes of its own
  scripts (`vite.config.ts`). Scripts only come from the site itself, and data only goes to the site
  and the Supabase project in `VITE_SUPABASE_URL`.
- **Caching**: hashed app files are cached for a year; the start page, service worker and manifest
  are always fetched fresh, so a new version is found straight away.
- **robots.txt** keeps search engines out.
- **CI** (`.github/workflows/ci.yml`): type check, unit tests and browser tests on every push and
  pull request.

## Cloudflare (Workers & Pages)

Cloudflare's dashboard now creates a **Worker** when you connect a repository, with
`npx wrangler deploy` as its deploy command. `wrangler.jsonc` in the repo tells it to serve `build/`
as static files with the single-page-app fallback; without that file, Wrangler tries to convert the
app to server-side SvelteKit and fails. `static/_headers` works the same for Workers and Pages.

For a Worker project:

1. **Settings → Build**: build command `npm run build`, deploy command `npx wrangler deploy`
   (the default), root directory empty.
2. **Settings → Build → Variables and secrets** (build-time, not runtime): `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY`. Node 24 is picked up automatically.
3. Retry the deployment. The site appears at `https://tensie.<your-subdomain>.workers.dev`.

A classic Pages project (the steps below) works too and does not use `wrangler.jsonc`.

## Cloudflare Pages

1. Log in to the [Cloudflare dashboard](https://dash.cloudflare.com) → **Workers & Pages** →
   **Create** → **Pages** → **Connect to Git**, and pick the `tensie` repository.
2. Build settings:
   - Framework preset: **None**
   - Build command: `npm run build`
   - Build output directory: `build`
3. **Environment variables** (Production, and Preview if you use previews):
   - `NODE_VERSION` = `24`
   - `VITE_SUPABASE_URL` = your project URL (docs/supabase-setup.md, step 5)
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = the publishable key

   These are read at build time; after changing one, redeploy.
4. Save and deploy. The site appears at `https://<project>.pages.dev`.
5. Optionally, set **Authentication → URL Configuration → Site URL** in Supabase to
   `https://<project>.pages.dev`. Login is by password, so no redirect addresses are needed.

Never put the Supabase secret or `service_role` key in these variables.

### Own domain (optional)

**Custom domains** → **Set up a custom domain**, for example `tensie.be`. Then update the Site URL in
Supabase to that domain.

### Preview deployments

Branches other than `main` get their own preview address. They use the same Supabase project, so
they reach your real readings once you log in there: keep previews for testing without logging in,
or turn them off under **Settings → Builds & deployments**.

## Installing on the phone (N1)

Open the address in Safari (iPhone) or Chrome (Android) and choose **Zet op beginscherm** /
**Installeren**. The app then opens full-screen and starts offline.

## Netlify instead

`netlify.toml` holds the build settings and the single-page-app rule; `static/_headers` works the
same. Create a site from the repository, add the same three environment variables, and update the
Supabase addresses as above.

## Checking a deployment

- Open the site, add a reading, and reload with the network off: the reading is still there.
- In the browser's developer tools, the console shows no "Content Security Policy" errors.
- [securityheaders.com](https://securityheaders.com) shows the headers above.
