# Auth Migration Specification: Supabase Auth → Clerk (No Backend, Edge Functions Only)

## 1. Objective

Migrate authentication from Supabase Auth to Clerk while:

* Keeping Supabase for Database, Storage, and Edge Functions
* Removing dependency on `supabase.auth`
* Disabling or bypassing RLS
* Using Edge Functions for authorization and data access control
* Supporting future multi-app SSO via Clerk

---

## 2. Target Architecture

```
Frontend (React + Clerk)
        ↓ (Clerk JWT)
Supabase Edge Functions (JWT verification + authorization)
        ↓
Supabase PostgreSQL + Storage
```

---

## 3. Scope of Changes

### Replace

* Supabase Auth (Google OAuth)

### Keep

* Supabase PostgreSQL
* Supabase Storage
* Supabase Edge Functions

### Remove

* Any dependency on `supabase.auth`
* Any reliance on `auth.users`
* Any RLS policies depending on `auth.uid()`

---

## 4. Environment Variables

### Add

Frontend:

```
VITE_CLERK_PUBLISHABLE_KEY=
```

Edge Functions:

```
CLERK_JWKS_URL=https://<your-clerk-domain>/.well-known/jwks.json
```

---

## 5. Frontend Changes

### 5.1 Remove Supabase Auth Usage

Remove:

* `supabase.auth.signInWithOAuth`
* `supabase.auth.getUser`
* `onAuthStateChange`

---

### 5.2 Integrate Clerk

Wrap app:

```tsx
<ClerkProvider publishableKey={PUBLISHABLE_KEY}>
  <App />
</ClerkProvider>
```

---

### 5.3 Replace Auth Hooks

Replace all usages of:

```ts
useAuth (custom Supabase hook)
```

With:

```ts
import { useUser, useAuth } from "@clerk/clerk-react"
```

---

### 5.4 Replace Login UI

Replace Supabase login with:

```tsx
<SignInButton />
<UserButton />
```

---

### 5.5 API Calls

All calls to Supabase must be routed through Edge Functions.

Replace:

```ts
supabase.from('files').select()
```

With:

```ts
const token = await getToken()

fetch('/functions/v1/<endpoint>', {
  headers: {
    Authorization: `Bearer ${token}`
  }
})
```

---

## 6. Database Changes

### 6.1 Profiles Table

Modify `profiles`:

* `id` becomes Clerk user ID (`sub`)
* Remove dependency on `auth.users`

---

### 6.2 Remove Triggers

Remove any triggers referencing:

```sql
auth.users
```

---

### 6.3 Disable or Simplify RLS

Recommended:

```sql
ALTER TABLE <table_name> DISABLE ROW LEVEL SECURITY;
```

OR replace policies to not depend on:

```sql
auth.uid()
```

---

## 7. Edge Functions (Core Logic Layer)

Edge Functions become the primary backend.

---

### 7.1 Responsibilities

Each Edge Function must:

1. Verify Clerk JWT
2. Extract user identity (`sub`, `email`)
3. Enforce authorization (roles/permissions)
4. Perform DB operations using service role key

---

### 7.2 JWT Verification

* Use Clerk JWKS endpoint
* Validate:

  * signature
  * expiration (`exp`)
  * issuer (`iss`)

Reject request if invalid.

---

### 7.3 User Sync (Profiles)

On each request:

* Extract:

  * `sub` → user_id
  * `email`

* Upsert:

```sql
INSERT INTO profiles (id, email)
VALUES (...)
ON CONFLICT (id) DO NOTHING;
```

---

### 7.4 Authorization Model

Use existing tables:

* `user_roles`
* `user_permissions`

Edge Functions must:

* Query permission tables
* Enforce rules manually

---

## 8. Storage Changes

### 8.1 Remove Direct Access

Remove:

```ts
supabase.storage.from(...).upload/download
```

---

### 8.2 Replace with Edge Functions

Flow:

```
Frontend → Edge Function → Storage
```

Edge Function:

* validates user
* checks permission
* performs upload/download

---

## 9. Edge Function Updates

### 9.1 delete-users

* Replace Supabase Auth deletion
* Use Clerk Admin API instead

---

### 9.2 get-users-auth-info

* Remove dependency on Supabase Auth
* Replace with Clerk user data if needed

---

## 10. Security Model

### Before

```
Supabase Auth → RLS → DB
```

### After

```
Clerk → Edge Function → DB
```

Security enforcement moves from:

* Database → Application layer

---

## 11. Breaking Changes

* `auth.uid()` no longer available
* Supabase Auth session removed
* RLS policies depending on auth will break
* Direct DB access from frontend must be removed

---

## 12. Migration Steps

### Phase 1 — Introduce Clerk

* Install Clerk
* Enable Google SSO
* Verify login works

---

### Phase 2 — Replace Auth Hooks

* Replace `useAuth`
* Replace login/logout UI

---

### Phase 3 — Introduce Edge Function Calls

* Replace all direct DB queries
* Route via Edge Functions

---

### Phase 4 — Implement JWT Verification

* Add Clerk JWT validation in Edge Functions

---

### Phase 5 — Remove Supabase Auth

* Remove auth usage
* Remove triggers
* Clean dependencies

---

### Phase 6 — Disable RLS

* Or refactor policies

---

## 13. Non-Goals

* No backend server (Go/Node)
* No JWT bridging into Supabase RLS
* No migration of database provider

---

## 14. Future Considerations

* Multi-app SSO via Clerk
* Shared user identity across apps
* Optional: reintroduce RLS later with custom JWT integration

---

## 15. Summary

* Clerk handles authentication and identity
* Supabase remains as BaaS (DB, Storage, Functions)
* Edge Functions act as backend layer
* RLS is removed or minimized
* System becomes app-controlled instead of DB-controlled
