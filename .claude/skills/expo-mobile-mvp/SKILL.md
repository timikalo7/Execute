---
name: expo-mobile-mvp
description: Scaffold and build a mobile app MVP with Expo / React Native (expo-router, jest-expo, RNTL). Use whenever a project needs a mobile app, an Expo or React Native build, or a cross-platform (iOS/Android/web) MVP. Proven on Expo SDK 56 + RN 0.85 + React 19.
---

# Expo Mobile MVP — working recipe (SDK 56 / RN 0.85 / React 19)

Read the versioned docs first: https://docs.expo.dev/versions/v56.0.0/ (adjust to current SDK). Expo moves faster than training data — do not code from memory.

## 1. Scaffold

```bash
npx create-expo-app@latest <name> --template blank-typescript
```
- Inside an existing git repo it prompts interactively but still scaffolds — expect and answer the prompt.
- Drop an `AGENTS.md` in the project root pointing all builders at the versioned Expo docs.

## 2. Switch to expo-router

- package.json: `"main": "expo-router/entry"`.
- Routes live in `app/`; API routes are `app/api/<route>+api.ts` (export `GET`/`POST`). Verify health with `/api/health`.

## 3. Dependencies (install with `npx expo install` so versions match the SDK)

Core: `expo-router expo-constants expo-linking expo-status-bar react-native-safe-area-context react-native-screens react-native-svg react-native-web @expo/metro-runtime`
As needed: `expo-sqlite expo-notifications expo-sensors expo-sharing react-native-reanimated react-native-view-shot lucide-react-native`
Other libs (zod, SDKs) via npm. zod v4 gotcha: `.default({})` on object schemas fails typing — use `.prefault({})`.

## 4. Jest config (jest-expo + RNTL v14)

```js
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  clearMocks: true,
};
```
- Do NOT override `transformIgnorePatterns` — the preset handles RN/Expo packages.
- RNTL v14: `render()` is ASYNC. Always `await render(<X />)` or `screen` queries silently never bind.
- Singleton stores: detect `process.env.JEST_WORKER_ID` and fall back to an in-memory driver.

## 5. Platform-split storage (keep native modules out of web bundles)

Metro statically bundles even dynamic `import('expo-sqlite')` into web builds, and expo-sqlite on web needs wasm assets. Use file splitting instead:
- `src/data/sqliteDriver.native.ts` — real expo-sqlite (picked on iOS/Android).
- `src/data/sqliteDriver.ts` — web driver on localStorage (picked on web).
Same exported interface from both; never reference a native module from shared code paths.

## 6. Architecture pattern

- Business logic as pure TS engines: `(state, date) → output` functions in `src/engine/` — testable with zero RN runtime; put most tests here.
- One canonical zod document schema for the store (`src/data/schema.ts`); parse at every storage boundary. Encode invariants (e.g. privacy guarantees) in the schema so violations are unrepresentable.

## 7. Keyless-first env scaffolding

For every account-gated service (auth, DB, LLM, analytics):
1. Build the degraded-but-working path first (guest mode / local storage / template fallback).
2. Gate the real integration on env detection (`EXPO_PUBLIC_*` for client keys, plain env for server keys in API routes).
3. Write `.env.example` and a `SETUP-KEYS.md` table (service → keys → what it unlocks → when needed → TODO checkbox).
The build must complete and the app must run with zero keys.

## 8. Verification loop (run after every milestone)

```bash
npm run typecheck          # tsc --noEmit
npm test                   # jest
npx expo export --platform web   # catches native-module leaks into the web bundle
```
Then live smoke: start the app, hit `/api/health`, render the first screen. The web export is the cheapest catch for Metro bundling mistakes — keep it in the loop even for mobile-only products.

For a worked reference, look for an existing Expo project under this repo's `projects/` (optional — the recipe above stands on its own).
