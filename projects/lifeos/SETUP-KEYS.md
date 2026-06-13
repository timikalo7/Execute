# LifeOS — Setup & Keys

The app runs end-to-end with **zero keys** in local demo mode: sign-up,
onboarding, the generated daily plan, and the dashboard all work, persisted to
`localStorage`. The integrations below are scaffolded and documented — wire a
key to promote each from demo to production.

## Run it (no keys)

```bash
cd projects/lifeos
npm install
npm run dev      # http://localhost:3000
```

Flows to try:
- `/` — marketing site
- `/demo` — the real 6-step onboarding → plan generates → signup gate → dashboard
- `/sign-up` → `/dashboard` — create a session and land on today's tasks
- `/dashboard` — today's tasks (check off, add, watch progress + streak)

## TODO(keys) — production integrations

### 1. Auth — Clerk (preferred)
- Create an app at https://clerk.com, copy the keys into `.env.local`:
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
  - `CLERK_SECRET_KEY`
- Swap point: `lib/auth.tsx`. Replace the `AuthProvider` internals with Clerk's
  `<ClerkProvider>` and back `useAuth()` with `useUser()` / `useAuth()` from
  `@clerk/nextjs`. The public surface (`useAuth() → { user, signIn, signOut }`)
  is intentionally identical, so no callsite changes are needed. Wrap the app in
  `app/layout.tsx` and convert the routes under `app/sign-in` / `app/sign-up`
  to Clerk's `<SignIn />` / `<SignUp />`.

### 2. Database — Neon (preferred Postgres)
- Set `DATABASE_URL` from https://neon.com.
- Swap point: `lib/store.tsx`. Replace the `localStorage` read/write with server
  actions hitting Neon. The `Person` shape in `lib/types.ts` is the schema
  contract.

### 3. Analytics — Plausible (preferred)
- Set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` and add the Plausible script in
  `app/layout.tsx`.

### 4. Email — Resend (preferred transactional)
- Set `RESEND_API_KEY` for the signup welcome + daily-plan email.

## Never commit
`.env.local` and any real keys. Only `.env.example` is tracked.
