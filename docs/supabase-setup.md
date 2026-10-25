# Supabase setup

Tensie works without a server: every reading is stored on the device first. These steps connect
it to your own Supabase project so readings are backed up and appear on your other devices (N2).
Do the security review (`docs/expert-profiles.md`, expert 2) before real readings go in.

## 1. Create the project

1. In the [Supabase dashboard](https://supabase.com/dashboard), create a new project on the free
   plan. Pick an **EU region** (for example Frankfurt, `eu-central-1`) (P1).
2. Choose a strong database password and keep it in your password manager. The app never needs it.

## 2. Create the tables

1. Open **SQL Editor** → **New query**.
2. Paste the whole of `supabase/migrations/20261025000000_init.sql` and run it.
3. Check under **Table Editor** that `readings`, `settings` and `imports` exist and show
   "RLS enabled".

(With the Supabase CLI you can run `supabase link` and `supabase db push` instead.)

## 3. Your account, and nobody else's

1. **Authentication** → **Users** → **Add user** → **Create new user**: your email address, and tick
   "Auto confirm user". The app never creates accounts itself.
2. **Authentication** → **Sign In / Providers** → **Email**: keep it enabled.
3. **Authentication** → **Sign In / Providers**: turn **Allow new users to sign up** off.

## 4. The login email

An app installed on an iPhone does not share its storage with Safari, so a tapped link logs you in
in Safari rather than in the app. The app therefore also accepts the code from the same email.

1. **Authentication** → **Emails** → **Templates** → **Magic Link**.
2. Add a line with the code, for example:

   ```html
   <h2>Inloggen bij Tensie</h2>
   <p><a href="{{ .ConfirmationURL }}">Tik hier om in te loggen</a></p>
   <p>Of vul deze code in de app in: <strong>{{ .Token }}</strong></p>
   ```

## 5. Addresses the login may return to

**Authentication** → **URL Configuration**:

- **Site URL**: the address the app is hosted at, for example `https://tensie.example.be`.
- **Redirect URLs**: add `https://<your app address>/auth`, and for testing on your computer
  `http://localhost:5173/auth` and `http://localhost:4173/auth`.

## 6. Sessions (P3)

Under **Authentication** → **Sessions**, set the inactivity timeout to 30 days if your plan offers
it. A second factor (TOTP) can be enabled under **Multi-Factor**; the app does not ask for it yet.

## 7. Connect the app

1. **Project Settings** → **API Keys**: copy the **Project URL** and the **publishable** key (on older
   projects the `anon` `public` key).
2. Copy `.env.example` to `.env` and fill in both values:

   ```
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>
   ```

3. Never use the **secret** or `service_role` key in the app, and never commit `.env` (it is in
   `.gitignore`). The publishable key is safe in the app because row-level security only lets a
   signed-in owner reach their own rows.
4. Rebuild (`npm run build`) or restart `npm run dev`, open **Instellingen** → **Synchronisatie**,
   and log in with your email.

The first sync uploads everything already on the device.

## Still to arrange

- **Backups (N8):** the free plan has no point-in-time recovery. A nightly database export to
  private storage is planned separately.
- **Security review:** before real readings go in, have someone check RLS, the disabled sign-ups and
  the keys (`docs/expert-profiles.md`).
