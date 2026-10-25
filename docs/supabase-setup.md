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

You log in with email and password (P3). That works in an app installed on an iPhone, and needs no
email at all, so no SMTP or domain.

1. **Authentication** → **Users** → **Add user** → **Create new user**: your email address, a strong
   password (generate one in your password manager and save it there), and tick
   **Auto confirm user**. The app never creates accounts itself.
   Already created the account without a password? Open it under **Users** and set a password, or
   delete it and create it again as above.
2. **Authentication** → **Sign In / Providers** → **Email**: keep it enabled.
3. **Authentication** → **Sign In / Providers**: turn **Allow new users to sign up** off.

Email templates and SMTP are not needed.

## 4. Sessions and a second factor (P3)

- Under **Authentication** → **Sessions**, set the inactivity timeout to 30 days if your plan offers
  it.
- A second factor (TOTP, an authenticator app) can be enabled under **Multi-Factor**; the app does
  not ask for it yet.

## 5. Connect the app

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
   and log in with your email and password. On the iPhone, let Safari save the
   password, or fill it in from your password manager.

The first sync uploads everything already on the device.

## Still to arrange

- **Backups (N8):** the free plan has no point-in-time recovery. A nightly database export to
  private storage is planned separately.
- **Security review:** before real readings go in, have someone check RLS, the disabled sign-ups, the
  password and  the keys (`docs/expert-profiles.md`).
