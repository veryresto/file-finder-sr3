# Auth Migration: Supabase Auth → Clerk

Migrate authentication from Supabase Auth to Clerk while keeping Supabase for DB, Storage, and Edge Functions. Security enforcement moves from DB-level RLS → Edge Function application layer.

---

## User Review Required

> [!IMPORTANT]
> **You need a Clerk account** with an application created and Google SSO enabled before we can begin Phase 1. You'll need to provide:
> - `VITE_CLERK_PUBLISHABLE_KEY` (for `.env`)
> - `CLERK_JWKS_URL` (your Clerk domain's JWKS endpoint, e.g. `https://<clerk-domain>/.well-known/jwks.json`)

> [!WARNING]
> **Breaking change — profiles.id type change.** Currently `profiles.id` is `UUID` and FK-references `auth.users(id)`. After migration it will become `TEXT` (Clerk user IDs look like `user_2abc...`). A new migration will drop the FK, change the column type, disable RLS, and drop `auth`-dependent triggers. Existing rows will need a manual data wipe or a one-time data migration script.

> [!CAUTION]
> **Storage RLS will break.** All existing Supabase Storage policies reference `auth.uid()`. We'll disable them and route all storage access through Edge Functions. Direct storage access from the frontend will stop working.

> [!NOTE]
> The spec says "No JWT bridging into Supabase RLS" meaning we won't set Supabase's `jwt_secret` to Clerk's key. All authorization is enforced in Edge Functions only.

---

## Proposed Changes

### Phase 1 — Install Clerk (Frontend Bootstrap)

#### [MODIFY] [package.json](file:///Users/a/Codes/file-finder-sr3/package.json)
- Add `@clerk/clerk-react` dependency

#### [MODIFY] [.env](file:///Users/a/Codes/file-finder-sr3/.env)
- Add `VITE_CLERK_PUBLISHABLE_KEY=<your-key>`

#### [MODIFY] [.env-example](file:///Users/a/Codes/file-finder-sr3/.env-example)
- Document the new env var

#### [MODIFY] [src/main.tsx](file:///Users/a/Codes/file-finder-sr3/src/main.tsx)
- Wrap `<App />` in `<ClerkProvider publishableKey={...}>`

---

### Phase 2 — Replace Auth Hooks & Login UI

#### [MODIFY] [src/hooks/useAuth.tsx](file:///Users/a/Codes/file-finder-sr3/src/hooks/useAuth.tsx)
- Remove all `supabase.auth.*` calls
- Re-implement `AuthProvider` and `useAuth` on top of Clerk's `useUser` + `useAuth` hooks
- Expose `user` (Clerk User object), `getToken()`, `signOut`, and `loading` with the same interface shape so downstream callers require minimal changes

#### [MODIFY] [src/components/LoginScreen.tsx](file:///Users/a/Codes/file-finder-sr3/src/components/LoginScreen.tsx)
- Replace manual Google OAuth button with Clerk's `<SignIn />` component (or keep custom button calling `clerk.openSignIn()` for visual consistency)
- Remove `signInWithGoogle` call

#### [MODIFY] [src/components/Header.tsx](file:///Users/a/Codes/file-finder-sr3/src/components/Header.tsx)
- Replace `user?.user_metadata?.avatar_url` / `user?.user_metadata?.full_name` / `user?.email` with Clerk equivalents (`user.imageUrl`, `user.fullName`, `user.primaryEmailAddress`)
- Keep `<UserButton />` or keep existing dropdown calling `clerk.signOut()`

---

### Phase 3 — Route All DB/Storage Calls Through Edge Functions

All 4 locations with direct Supabase client calls need a new Edge Function or need to be routed through an existing one.

#### [NEW] `supabase/functions/list-files/index.ts`
- Verifies Clerk JWT (shared `verifyClerkToken` helper)
- Upserts profile on each call
- Checks `read_files` permission
- Queries `files` + `profiles` join and returns result

#### [NEW] `supabase/functions/upload-file/index.ts`
- Verifies Clerk JWT
- Checks `upload_files` or `admin` permission
- Accepts multipart or JSON body with file content + metadata
- Writes to Supabase Storage via service role key
- Inserts into `files` table

#### [NEW] `supabase/functions/delete-file/index.ts`
- Verifies Clerk JWT
- Checks admin permission
- Deletes from Storage + DB

#### [NEW] `supabase/functions/get-pending-users/index.ts`
- Verifies Clerk JWT
- Checks admin permission
- Returns pending user count (profiles without any permissions/roles)

#### [NEW] `supabase/functions/manage-permissions/index.ts`
- Verifies Clerk JWT
- Checks admin permission
- Handles: `togglePermission`, `rejectUser`, `unrejectUser` actions
- Also triggers notification via `send-notification-email`

#### [NEW] `supabase/functions/_shared/clerkAuth.ts`
- Shared Deno module: fetches JWKS from `CLERK_JWKS_URL`, verifies JWT signature + `exp` + `iss`
- Returns `{ sub, email }` or throws `401`
- Also contains `upsertProfile(sub, email, supabaseAdmin)` helper

#### [MODIFY] [src/pages/Index.tsx](file:///Users/a/Codes/file-finder-sr3/src/pages/Index.tsx)
- Replace `supabase.from('files').select(...)` with `fetch('/functions/v1/list-files', { headers: { Authorization: Bearer ${token} } })`
- Replace `supabase.storage.from(...).remove(...)` + `supabase.from('files').delete()` with calls to `delete-file` Edge Function
- Replace `supabase.from('profiles').select(...)` + permission queries with `get-pending-users` Edge Function call

#### [MODIFY] [src/components/FileUploadModal.tsx](file:///Users/a/Codes/file-finder-sr3/src/components/FileUploadModal.tsx)
- Replace `supabase.storage.from(...).upload(...)` + `supabase.from('files').insert(...)` with `upload-file` Edge Function call
- Use `getToken()` from updated `useAuth` hook

#### [MODIFY] [src/pages/Admin.tsx](file:///Users/a/Codes/file-finder-sr3/src/pages/Admin.tsx)
- Replace all direct `supabase.from('user_permissions')`, `supabase.from('user_roles')`, `supabase.from('profiles')` mutations with calls to `manage-permissions` Edge Function
- Replace `supabase.functions.invoke('get-users-auth-info')` with Clerk Admin API data (fetched via new `get-users-auth-info` update below)

#### [MODIFY] [src/hooks/usePermissions.tsx](file:///Users/a/Codes/file-finder-sr3/src/hooks/usePermissions.tsx)
- Replace direct `supabase.from('user_roles')` + `supabase.from('user_permissions')` queries with a call to a new `get-my-permissions` Edge Function

#### [NEW] `supabase/functions/get-my-permissions/index.ts`
- Verifies Clerk JWT
- Upserts profile
- Returns current user's roles and permissions

---

### Phase 4 — Implement JWT Verification in Edge Functions

All new Edge Functions above already include JWT verification via the shared `_shared/clerkAuth.ts` module. This phase validates it end-to-end.

**Validation logic:**
1. Decode JWT header → extract `kid`
2. Fetch JWKS from `CLERK_JWKS_URL`
3. Find matching key by `kid`
4. Verify signature using `jose` or `deno-jose`
5. Validate `exp` and `iss` claims

---

### Phase 5 — Update Existing Edge Functions

#### [MODIFY] [supabase/functions/delete-users/index.ts](file:///Users/a/Codes/file-finder-sr3/supabase/functions/delete-users/index.ts)
- Replace `supabaseAdmin.auth.getUser(token)` (Supabase JWT verification) → use `verifyClerkToken()`
- Replace `supabaseAdmin.auth.admin.deleteUser(userId)` with Clerk Admin API: `DELETE https://api.clerk.com/v1/users/{userId}` using `CLERK_SECRET_KEY`
- Add `CLERK_SECRET_KEY` environment variable to Edge Function secrets

#### [MODIFY] [supabase/functions/get-users-auth-info/index.ts](file:///Users/a/Codes/file-finder-sr3/supabase/functions/get-users-auth-info/index.ts)
- Replace `anonClient.auth.getUser()` → `verifyClerkToken()`
- Replace `supabaseClient.auth.admin.listUsers()` with Clerk Admin API: `GET https://api.clerk.com/v1/users`
- Map response to same shape `{ id, created_at, last_sign_in_at }`

---

### Phase 6 — Database Migration

#### [NEW] `supabase/migrations/<timestamp>_clerk-auth-migration.sql`

```sql
-- 1. Drop auth-dependent trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- 2. Drop FK constraint from profiles to auth.users
ALTER TABLE public.profiles DROP CONSTRAINT profiles_id_fkey;

-- 3. Change profiles.id from UUID to TEXT (Clerk user IDs)
ALTER TABLE public.profiles ALTER COLUMN id TYPE TEXT USING id::TEXT;

-- 4. Disable RLS on all tables
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.files DISABLE ROW LEVEL SECURITY;

-- 5. Drop all auth.uid()-dependent policies (files table)
DROP POLICY IF EXISTS "Authenticated users can view all files" ON public.files;
DROP POLICY IF EXISTS "Users can upload files" ON public.files;
DROP POLICY IF EXISTS "Users can delete own files" ON public.files;

-- 6. Drop profiles policies
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- 7. Drop Storage RLS policies
DROP POLICY IF EXISTS "Authenticated users can read files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;

-- 8. Also change user_roles.user_id and user_permissions.user_id to TEXT
ALTER TABLE public.user_roles ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
ALTER TABLE public.user_permissions ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
```

---

### Environment Variables

#### Add to `.env` (Frontend):
```
VITE_CLERK_PUBLISHABLE_KEY=pk_...
```

#### Add to Supabase Edge Function secrets:
```
CLERK_JWKS_URL=https://<clerk-domain>/.well-known/jwks.json
CLERK_SECRET_KEY=sk_...
```

---

## Open Questions

> [!IMPORTANT]
> **1. Clerk user ID format for existing data.** Current profiles rows have UUID IDs from `auth.users`. After migration the table accepts TEXT Clerk IDs. Do you want to **wipe existing profiles** (fresh start) or write a one-time script to map old Supabase UUIDs → Clerk IDs?

> [!IMPORTANT]
> **2. `get-users-auth-info` — `first_login` field source.** Currently this uses `auth.users.created_at`. With Clerk the equivalent is `user.created_at` from Clerk Admin API. The `last_sign_in_at` maps to `user.last_sign_in_at`. Is that acceptable?

> [!IMPORTANT]
> **3. Profile registration flow.** Currently a DB trigger auto-creates a profile when a user signs up via Supabase Auth. After migration, profile creation is done lazily (upsert on first Edge Function call). Users will only appear in the admin panel after they've made at least one authenticated API call. Is that OK, or do you want a Clerk webhook to create profiles on sign-up?

> [!NOTE]
> **4. Supabase Storage RLS will be fully disabled.** All storage access will go through Edge Functions with service role key. There will be no row-level access controls at the storage layer — all enforcement is in Edge Function code. This matches the spec's intent but is worth confirming.

---

## Verification Plan

### After Phase 1
- [ ] App loads without errors, Clerk `<ClerkProvider>` wraps the tree
- [ ] Visiting the app shows login screen

### After Phase 2
- [ ] Google sign-in via Clerk works
- [ ] User info (name, avatar) renders in Header
- [ ] Sign-out works

### After Phase 3 + 4
- [ ] Files list loads via Edge Function
- [ ] File upload works
- [ ] File delete works
- [ ] Admin panel loads users and permissions
- [ ] Permission toggles update correctly

### After Phase 5
- [ ] `delete-users` Edge Function deletes from Clerk, not Supabase Auth
- [ ] `get-users-auth-info` returns user data from Clerk API

### After Phase 6 (DB Migration)
- [ ] Migration applies cleanly to remote Supabase
- [ ] No RLS errors in Supabase logs
- [ ] Edge Functions can read/write all tables
