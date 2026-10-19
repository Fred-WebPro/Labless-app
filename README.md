# Labless app

Monorepo for the Labless product.

| Folder | What it is |
|---|---|
| `mobile/` | Expo (SDK 58) app for iOS and Android, English, Spanish and Russian |
| `admin/` | Next.js admin panel and the API the app calls (deployed to Vercel) |
| `supabase/` | Database schema, row level security and storage policies |

## How it fits together

- The app signs people in with Supabase Auth and reads and writes its own data directly, protected by row level security.
- Report files go to the private `reports` storage bucket, under the owner's folder.
- `POST /api/analyze` (admin app) reads the files with Claude, stores every value, computes clinical indices in code, then asks Claude to interpret them. The app follows progress through the report's `status` and `stage`.
- `POST /api/checkin` stores answers to follow-up questions and refines the reading.
- The admin panel shows users, families, reports, every app event, and sends push broadcasts (Expo push service + in-app inbox).

## Run the app in Expo Go

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go. `mobile/.env` holds the public Supabase URL and anon key and the API address.

## Admin panel

Production: https://labless-admin.vercel.app. Sign in with an account whose email is listed in `ADMIN_EMAILS`.

```bash
cd admin
npm install
npm run dev
```

`admin/.env.local` needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `ADMIN_EMAILS`.

## Database

```bash
cd supabase
npm install
npm run migrate
```

Reads `DATABASE_URL` from `supabase/.env`. Migrations run once each, in order.

## Tests

`admin/scripts/e2e.mjs` runs the whole backend flow against the deployed API with throwaway accounts and deletes them afterwards:

```bash
cd admin
node scripts/e2e.mjs path/to/a/lab-report.pdf
```

## Before release

- In Supabase Auth → URL Configuration, set the Site URL to `https://labless-admin.vercel.app` and add `https://labless-admin.vercel.app/auth/reset` to Redirect URLs, so password reset links open the right page.
- Run `npx eas-cli init` in `mobile/` once to get an EAS project id; push notifications need it.
- Build with `npx eas-cli build` for the stores. Remote push doesn't work in Expo Go on Android; it works in a development or store build.
