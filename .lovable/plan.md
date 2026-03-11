

# Plan: Track Last Activity (App Open) Per User

## Problem
The current "last login" (`last_sign_in_at`) from auth only updates on actual login. Since sessions persist, it rarely reflects real usage. The admin needs to see when each user last opened the app.

## Approach

### 1. Add `last_active_at` column to `profiles` table
- Database migration: `ALTER TABLE profiles ADD COLUMN last_active_at timestamptz;`
- Update RLS: the existing "Users can update own profile" policy already covers this since users can update their own row.

### 2. Update `last_active_at` on app load
In `useAuth.tsx` (or a new hook), when a session is detected, upsert `last_active_at = now()` on the user's profile. Throttle this to once per session (e.g., only on initial load, not on every re-render). A simple approach: after `getSession()` returns a valid session, call:
```typescript
supabase.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('id', user.id)
```

### 3. Display in Admin panel
- Add `last_active_at` to the `UserWithPermissions` interface (rename or add alongside `last_sign_in`).
- Replace or supplement the "Last Login" column with "Last Active" showing the `last_active_at` timestamp from profiles.
- No edge function changes needed — profiles are already fetched in `fetchUsers`.

## Files to modify
- **Database migration**: Add `last_active_at` column to `profiles`
- **`src/hooks/useAuth.tsx`**: Update profile `last_active_at` when session is detected
- **`src/pages/Admin.tsx`**: Display `last_active_at` instead of (or alongside) `last_sign_in`

