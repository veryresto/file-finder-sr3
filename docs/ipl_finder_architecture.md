# IPL Finder — Platform Engineering Documentation

> Written as an onboarding guide for a platform or frontend engineer joining the ecosystem.
> Reflects the **current production state** of the codebase as of May 2026.

---

## 1. Product Overview

**IPL Finder** (internally `file-finder-sr3`) is a community-facing document management and search application for a residential community (`RT02` / Veryresto). Its primary operational purpose is to provide indexed, searchable access to **bank e-statements** that have been converted from PDF into plain-text formats (CSV, TXT, etc.) — referred to throughout as "IPL records."

### Who Uses It

| Actor | Role |
|---|---|
| **Residents** | Search and read/download monthly bank statements |
| **Finance administrators** | Upload new statement files each billing period |
| **Community admins** | Manage access: approve, reject, or delete resident accounts |

### What Problem It Solves

In a residential community managing monthly utility payments (IPL = *Iuran Pengelolaan Lingkungan*), the governing body receives bank transaction CSV exports monthly. Without this tool, finding "did resident X pay in March 2025?" requires manually opening spreadsheet files one at a time. IPL Finder solves this by:

1. Providing a central repository where statement files are uploaded once
2. Indexing the **full text content** of every uploaded file in the database
3. Offering instant client-side full-text search across all records

### Fit in the Larger Ecosystem

IPL Finder is one of several community tools in the **Veryresto ecosystem** (alongside `rekap-viewer`, `community-platform`, and others). It is not a standalone application — it is an **ecosystem client**:

- Authentication is delegated entirely to `portal.veryresto.com` (the `community-platform`)
- It shares the same Supabase project, auth instance, and database as the community platform
- Wildcard cookie sessions (`.veryresto.com`) allow seamless SSO between subdomains
- It reads platform-level approval status and RBAC roles from shared tables managed by the community platform

---

## 2. Application Architecture

### Frontend Architecture

IPL Finder is a **React 18 + Vite SPA** with no dedicated backend service. All server-side logic is handled by:
- **Supabase PostgREST** for database CRUD operations
- **Supabase Storage** for private file bucket operations
- **Supabase Edge Functions** (Deno) for privileged server-side tasks (user deletion, email notifications)

```
src/
├── App.tsx                  # Root: provider tree + route declarations
├── main.tsx                 # Entry point
├── index.css                # Global design tokens
├── pages/
│   ├── Index.tsx            # Main application shell (file browser)
│   ├── Admin.tsx            # User management dashboard (admin-only)
│   ├── ActivityLog.tsx      # Download audit trail (admin-only)
│   └── NotFound.tsx         # 404 fallback
├── components/
│   ├── Header.tsx           # App bar: search, upload CTA, user avatar menu
│   ├── FileList.tsx         # Sortable file grid with search snippet highlighting
│   ├── FileUploadModal.tsx  # Drag-and-drop upload dialog
│   ├── FileViewerModal.tsx  # Full-content reader + download trigger
│   ├── LoginScreen.tsx      # Legacy sign-in page (currently bypassed)
│   ├── PendingApprovalScreen.tsx # Legacy waiting room (currently bypassed)
│   ├── RejectedScreen.tsx   # Legacy rejection screen (currently bypassed)
│   └── NavLink.tsx          # Styled router link primitive
├── hooks/
│   ├── useAuth.tsx          # Auth context: session, user, signOut
│   ├── usePermissions.tsx   # Permission resolution: isAdmin, canReadFiles, etc.
│   ├── use-mobile.tsx       # Viewport breakpoint hook
│   └── use-toast.ts         # Notification toast hook
├── integrations/
│   └── supabase/
│       ├── client.ts        # Supabase client + CookieStorage adapter
│       └── types.ts         # Auto-generated TypeScript DB types
└── lib/
    └── utils.ts             # Utility functions (cn, etc.)
```

### State Management

There is no dedicated state management library (no Redux, Zustand, Jotai). State is distributed across:

| Layer | Mechanism |
|---|---|
| **Authentication** | React Context (`AuthProvider` in `useAuth.tsx`) |
| **Permissions** | Local `useState` inside `usePermissions.tsx`, re-evaluated on user change |
| **Data (files list)** | Local `useState` in `Index.tsx`; no caching layer |
| **UI state** | Local `useState` per component (modals open/close, selected files, search query) |
| **Server-side** | TanStack Query v5 is installed but **not yet used** for data fetching |

This is a pragmatic but important observation: data fetching in `Index.tsx`, `Admin.tsx`, and `ActivityLog.tsx` is handled with raw `async/await` inside `useEffect`, bypassing TanStack Query's caching and invalidation machinery entirely.

### Supabase Integration

The Supabase client is configured in [`src/integrations/supabase/client.ts`](file:///Users/a/Codes/file-finder-sr3/src/integrations/supabase/client.ts). The critical non-default configuration is:

```typescript
auth: {
  storageKey: 'veryresto-auth',   // shared key with community-platform
  storage: new CookieStorage(),    // custom wildcard cookie adapter
  persistSession: true,
  autoRefreshToken: true,
}
```

The `CookieStorage` adapter replaces Supabase's default `localStorage` to enable cross-subdomain session sharing.

### Authentication / Session Usage

`useAuth.tsx` is a thin wrapper around `supabase.auth`:
- On mount, it calls `getSession()` to rehydrate from the cookie, then starts `onAuthStateChange` subscription
- It updates `profiles.last_active_at` on every successful session rehydration — tracking activity without an explicit sign-in event
- `signOut()` calls `supabase.auth.signOut()` which clears the wildcard cookie

**What it does NOT do:** It does not redirect to login. Redirect responsibility lives in `Index.tsx`.

### Permission Validation Flow

`usePermissions.tsx` runs after the user is known. It executes three concurrent queries:

1. **Global admin check**: queries `user_roles` for `role = 'admin'`
2. **Local app admin check**: queries `user_app_roles` joined against `app_roles` and `applications` filtering `applications.slug = 'ipl_finder'` and `app_roles.name = 'admin'`
3. **Platform approval check**: queries `profiles.approval_status`

If the user is not an admin, two more RPC calls run in parallel:
- `has_namespaced_permission(user_id, 'ipl_finder.read_files')`
- `has_namespaced_permission(user_id, 'ipl_finder.upload_files')`

The resolved state (`isAdmin`, `isPlatformApproved`, `canReadFiles`, `canUploadFiles`, `isRejected`) is exposed via the hook return value. All subsequent routing decisions and UI rendering are gated on this state.

### Data-Fetching Patterns

- **Files**: Fetched in `Index.tsx` via a single Supabase query joining `profiles` via foreign key. Loaded once on mount (when approved), with manual refetch after upload/delete.
- **Admin users**: Fetched in `Admin.tsx` using four concurrent queries (`profiles`, `user_roles`, `user_permissions`, and edge function `get-users-auth-info`) merged in-memory in JavaScript.
- **Activity logs**: Fetched in `ActivityLog.tsx` with a 100-record limit and joined manually with profile data. Supplemented by a Supabase Realtime subscription for live INSERT events.

No pagination or infinite scroll exists anywhere.

### Routing / Navigation Structure

```
/           → Index.tsx  (main file browser; conditional gate screens inline)
/activity   → ActivityLog.tsx (admin-only; redirects via useNavigate if not admin)
/*          → NotFound.tsx
```

There is no `/admin` route in this app. The "Admin" button in the header navigates to `${portalUrl}/admin` — an **external URL on community-platform**.

### Responsibility Boundary

| Responsibility | Owned By |
|---|---|
| Google OAuth flow | `community-platform` |
| Waiting room / profile collection | `community-platform` |
| User approval workflow | `community-platform` |
| Global platform roles (`user_roles`) | `community-platform` |
| App-specific permissions (`user_app_roles`) | `community-platform` (manages via central admin UI) |
| File storage and search | IPL Finder |
| Download audit trail | IPL Finder |
| Local user management (legacy) | IPL Finder (`Admin.tsx` — partly obsolete, see §10) |

---

## 3. Ecosystem Integration

### How Shared Authentication Works

All ecosystem apps share a single Supabase project. When a user authenticates via `portal.veryresto.com`:
1. Supabase Auth issues a JWT (access token + refresh token)
2. The community platform's `CookieStorage` adapter writes the session as `veryresto-auth` with `domain=.veryresto.com; path=/; SameSite=Lax; Secure`
3. When the user navigates to `ipl-finder.veryresto.com`, the browser automatically sends the same cookie
4. IPL Finder's own `CookieStorage` adapter reads `veryresto-auth` and restores the session via `supabase.auth.getSession()`
5. The JWT is validated by Supabase PostgREST on every database request — no round-trip to community-platform needed

**Cookie payload optimization**: To stay within the 4KB browser cookie limit, the adapter strips all user metadata on write, storing only `access_token`, `refresh_token`, `expires_at`, `expires_in`, and `token_type`. On read, it decodes the JWT payload using `parseJwt()` to reconstruct the `user` object.

### How the App Validates Access

Access validation is a **two-gate system**:

**Gate 1 — Ecosystem membership** (`isPlatformApproved`):
```
profiles.approval_status === 'approved'
```
If this fails, the user is redirected to `${portalUrl}/` — they are not yet a community member.

**Gate 2 — App-level permission** (`isApproved = isAdmin || canReadFiles || canUploadFiles`):
```
has_namespaced_permission(user_id, 'ipl_finder.read_files') OR
user_roles.role = 'admin'
```
If platform-approved but not app-permitted, the user sees an "Access Denied" screen with a link back to the Hub.

### How Permissions Are Checked

The `has_namespaced_permission(user_id, namespaced_perm)` PostgreSQL function (SECURITY DEFINER) resolves the full App-RBAC chain:

```sql
user_app_roles → app_roles → app_role_permissions → app_permissions → applications
```

filtering by `applications.slug = 'ipl_finder'` and the specific permission name. Global admins short-circuit this check and always return `TRUE`.

### Redirect Patterns

| Condition | Behavior |
|---|---|
| `!user` after auth resolves | `window.location.replace(portalUrl + '/?redirect_to=...')` |
| `user && !isPlatformApproved` (after permissions resolve) | `window.location.replace(portalUrl + '/')` |
| `user && isPlatformApproved && !isApproved` | Inline "Access Denied" component (no redirect) |
| Admin navigates to `/activity` without admin role | `useNavigate('/')` |

The redirect guards use `window.location.replace()` (not `useNavigate`) to ensure browser history is replaced, preventing back-navigation into a broken state. The condition `resolvedUserId === user.id` prevents premature redirects during the async permission loading phase.

### Cookie / Session Assumptions

- The shared storage key `veryresto-auth` is hard-coded in both `community-platform` and IPL Finder — any rename breaks session sharing
- The cookie domain detection logic is environment-aware: `.veryresto.com` for production, `.localtest.me` for local dev, and bare `hostname` for anything else (including `localhost`)
- The `Secure` flag is driven by `window.location.protocol`, so HTTP local development works without special config

---

## 4. Domain Model

### Core Entities

```
auth.users (Supabase-managed)
  │
  ├──[1:1]── profiles
  │           ├── email, full_name, avatar_url
  │           ├── house_number, whatsapp_number    ← community identity
  │           ├── approval_status                  ← platform gate
  │           └── last_active_at                   ← activity tracking
  │
  ├──[1:M]── user_roles
  │           └── role: 'admin' | 'user'           ← global platform roles
  │
  ├──[1:M]── user_app_roles                        ← App-RBAC source of truth
  │           └── → app_roles → app_role_permissions → app_permissions
  │           note: ipl_finder roles: 'resident' | 'admin' | 'rejected' (marker)
  │
  └──[1:M]── activity_logs
              └── action, resource_type, resource_id, resource_name

files
  ├── name, storage_path, content                  ← content indexed for search
  ├── file_size, mime_type
  ├── uploader_id → profiles
  └── GIN indexes on tsvector(content) + tsvector(name)

storage.objects ('text-files' bucket, private)
  └── path: {user_id}/{timestamp}-{filename}
```

### App-RBAC Entities (New Governance Layer)

```
applications
  ├── slug: 'ipl_finder'
  └── name, description, url

app_permissions
  ├── app_id → applications
  └── name: 'read_files' | 'upload_files'

app_roles
  ├── app_id → applications
  └── name: 'resident' | 'admin' | 'rejected'
       ├── resident       → read_files
       ├── admin          → read_files + upload_files  [naming: see §10 item 9]
       └── rejected       → (no permissions; marker only for admin UI categorisation)

app_role_permissions
  ├── app_role_id → app_roles
  └── permission_id → app_permissions

user_app_roles
  ├── user_id → auth.users
  ├── app_role_id → app_roles
  └── granted_by → auth.users
```

### Conceptual Relationships

- **A resident** is a community member (`profiles.approval_status = 'approved'`) who has been granted `ipl_finder.read_files` via a `user_app_roles` assignment to the `resident` role template
- **A finance admin** is a resident additionally granted `ipl_finder.upload_files` (via the `admin` app role template, or directly via legacy `user_permissions`)
- **A platform admin** has a global `user_roles.role = 'admin'` record, which bypasses all permission checks at both the RLS and application layers
- **A rejected user** is a platform-member-in-name-only: their `profiles` row exists, but `approval_status` blocks the platform gate

---

## 5. Frontend Engineering Analysis

### Component Organization

Components are organized flat (no subdirectory by feature) which is appropriate for the current scale. All non-shadcn/ui components are feature components rather than generic primitives.

**Feature components**:
- [`FileList.tsx`](file:///Users/a/Codes/file-finder-sr3/src/components/FileList.tsx) — Grid of file cards with bulk selection, search snippet rendering, context-aware delete visibility
- [`FileUploadModal.tsx`](file:///Users/a/Codes/file-finder-sr3/src/components/FileUploadModal.tsx) — Drag-and-drop upload dialog; validates MIME types and extensions
- [`FileViewerModal.tsx`](file:///Users/a/Codes/file-finder-sr3/src/components/FileViewerModal.tsx) — Full-screen content reader; triggers storage download + activity log
- [`Header.tsx`](file:///Users/a/Codes/file-finder-sr3/src/components/Header.tsx) — Search bar, conditional upload CTA, user dropdown, admin link to community portal

**Gate components** (currently bypassed by ecosystem redirects, preserved for potential reuse):
- `LoginScreen.tsx` — standalone Google SSO screen; preserved in case IPL Finder ever needs to operate independently of the community platform
- `PendingApprovalScreen.tsx` — waiting room with house/WhatsApp number collection; preserved as a template for per-app registration flows
- `RejectedScreen.tsx` — access-denied screen with sign-out; preserved as a UI primitive

> These components are not dead code — they are deliberately kept because the ecosystem integration pattern may evolve, and reactivating a standalone auth flow should be a low-effort operation.

### Reusable Abstractions

- `useAuth()` and `usePermissions()` are the primary shared hooks used across 6+ components — they are well-extracted
- `highlightMatch()` and `getAllMatchSnippets()` in `FileList.tsx` are duplicated almost identically in `FileViewerModal.tsx` — a missed extraction opportunity
- No shared `FileCard` component; the file card markup is inline in `FileList.tsx`

### State Flow

```
AuthProvider (session, user)
  └── usePermissions (isAdmin, canReadFiles, canUploadFiles, isPlatformApproved)
        └── Index.tsx
              ├── files[] (local state, useEffect-fetched)
              ├── searchQuery (string)
              ├── filteredFiles (useMemo of files + searchQuery)
              ├── selectedFiles (Set<string>)
              └── modal states (uploadOpen, selectedFile, fileToDelete)
```

### Rendering Patterns

- **Conditional gate rendering**: `Index.tsx` renders one of five states based on auth/permission flags — this is a simple but clear multi-gate pattern. However, all gates except the final approved state render loading spinners, which may flash briefly.
- **Search highlighting**: The `highlightMatch()` function uses regex splitting to return JSX arrays with `<span>` or `<mark>` elements. This is a client-side approach that works for the current scale but has no virtualization.
- **Staggered animation**: `FileList` uses `animationDelay: ${index * 50}ms` for slide-up animations on render — a nice polish detail.

### Performance Considerations

- **Full content loaded upfront**: Every file's full text content is fetched and stored in the client's `files[]` state array. For the current scale (dozens of monthly bank statement CSVs), this is the intentional design — it enables the instant client-side search without round-trips.
- **Client-side search (intentional)**: `filteredFiles` uses `useMemo` with `.includes()` on the full in-memory content. This is a deliberate choice for this scale: instant feedback, no network latency, no debouncing complexity. The database has GIN `tsvector` indexes available as a future escape hatch if the corpus grows significantly.
- **No pagination**: Both the file list and admin user list fetch all rows with `.select()` and no `.range()` — O(N) network cost on every load.
- **PWA configured**: `vite-plugin-pwa` is installed with `NetworkFirst` caching for Supabase API calls and asset precaching. This is a meaningful addition for mobile residents on spotty connections.

### Responsiveness / Mobile UX

- The header collapses labels on small screens (`hidden sm:inline`) — responsive but minimal
- File metadata wraps using `flex-wrap` on mobile
- The file viewer modal is `95vw` wide, appropriate for mobile viewing
- The admin table is not horizontally scrollable on narrow screens — a known limitation for a dense data table

### Filtering / Search System

Search is entirely client-side:
1. User types in the header input → `searchQuery` state updates
2. `filteredFiles = useMemo(...)` filters the pre-loaded array
3. `FileList` renders all matching files and shows inline content snippets for each match
4. `FileViewerModal` highlights matches within the full content view

There is no debounce on the search input.

### Upload UX

The upload modal supports:
- Drag-and-drop with visual feedback (`isDragOver` state)
- Multi-file selection via native file picker
- File type validation (MIME type + extension)
- Per-file file size display and removal before upload
- Sequential upload: files are uploaded one at a time in a `for` loop — no parallelism
- The content is read client-side via `file.text()` and stored in the `files.content` column alongside the storage object, enabling content search

---

## 6. Security & Access Control

### Permission Enforcement Layers

| Layer | Mechanism | Enforced By |
|---|---|---|
| Authentication | JWT validation on all Supabase requests | Supabase Auth (server) |
| Platform approval | `profiles.approval_status` check via RLS | PostgreSQL RLS |
| File read access | `has_role('admin') OR has_namespaced_permission('ipl_finder.read_files')` | PostgreSQL RLS |
| File upload | `has_role('admin') OR has_namespaced_permission('ipl_finder.upload_files')` | PostgreSQL RLS |
| Storage read | `has_role('admin') OR has_namespaced_permission('ipl_finder.read_files')` | Supabase Storage RLS |
| Storage delete | `auth.uid()::text = storage.foldername(name)[1]` (own files only) | Supabase Storage RLS |
| Admin data (`user_roles`, `user_app_roles`) | `has_role('admin')` | PostgreSQL RLS |

### Frontend Trust Boundaries

The frontend enforces permissions only as **UX gates**, not security gates:
- The "Upload" button only renders if `canUploadFiles || isAdmin` — but the RLS policy on `files` INSERT enforces this server-side
- The "Delete" button only renders in `FileList` based on `canDeleteFile(file)` — but the RLS policy enforces this server-side
- The admin link in the header only appears for `isAdmin` — but the Admin page and ActivityLog page redirect non-admins via `useNavigate`

This layering is correct: the UI prevents confusion, but the database layer prevents actual unauthorized access.

### RLS Usage

Security definer functions (`has_role`, `has_permission`, `has_namespaced_permission`) are used in RLS policies to avoid recursive table scans. This is the correct pattern.

### Identified Risks

**1. Overly permissive storage read policy**

The storage policy for reads is:
```sql
USING (bucket_id = 'text-files' AND auth.uid() IS NOT NULL)
```
This allows **any authenticated user** to download files directly from storage, even if they have no `read_files` permission. Since file content is also stored in the `files.content` column (which is RLS-protected), this is a secondary but real bypass: anyone with a Supabase session could construct a `storage.download()` call with a known storage path.

**2. `files` content is fully exposed in the `SELECT` query**

The `INDEX.tsx` query fetches the full `content` column for all files. This is sent over the wire as JSON even for files the user is only viewing the title of. There is no column-level security or on-demand content loading.

**3. Legacy `user_permissions` table is still the RLS source of truth**

The new App-RBAC (`user_app_roles`) feeds the `has_namespaced_permission()` function, but the RLS policies on `files` still reference `has_permission(_user_id, 'read_files')` which queries the legacy `user_permissions` table. The `sync_legacy_permissions` trigger keeps them in sync, but this two-source-of-truth architecture is fragile — a trigger failure would cause the permission sources to diverge silently.

**4. Hardcoded admin email in migration**

`20260107001509.sql` contains `IF NEW.email = 'veryresto@gmail.com'` in the `assign_admin_role` trigger. This is an acceptable bootstrap for a single-community deployment but is a security anti-pattern in a multi-tenant context.

**5. Edge function CORS is wildcard**

All three edge functions return `"Access-Control-Allow-Origin": "*"`. While edge functions require a valid JWT in the `Authorization` header, the wildcard CORS header means any browser origin can call these endpoints.

---

## 7. Supabase Architecture

### Database Tables

| Table | Purpose | RLS |
|---|---|---|
| `profiles` | 1:1 user metadata (name, avatar, house_number, whatsapp_number, approval_status) | All authenticated can read; users update own |
| `files` | File index with embedded content for search | Requires `read_files` permission or admin role |
| `user_roles` | Global platform roles (`admin`, `user`) | Admin-only read/write |
| `user_permissions` | Legacy app permissions (`read_files`, `upload_files`, `rejected`) | Admin-only + own-record select |
| `activity_logs` | Download audit trail | Admin-only read; any authenticated user can insert own |
| `governance_events` | Platform-level governance audit trail | Admin/verifier read; admin/verifier/moderator insert |
| `applications` | Registered ecosystem apps | Approved residents can read |
| `app_permissions` | Capability registry per app | Approved residents can read |
| `app_roles` | Role templates per app | Approved residents can read |
| `app_role_permissions` | Permission bindings per role | Approved residents can read |
| `user_app_roles` | User → app role assignments | Approved residents can read; admin/verifier can manage |

### Storage Buckets

| Bucket | Visibility | Usage |
|---|---|---|
| `text-files` | Private | All uploaded documents; path pattern: `{user_id}/{timestamp}-{filename}` |

### RLS Patterns

- SECURITY DEFINER helper functions (`has_role`, `has_permission`, `has_namespaced_permission`) prevent circular RLS dependencies and provide a single point for permission logic
- `is_approved()` function checks for any permission record OR admin role — used indirectly
- GIN indexes on `tsvector(content)` and `tsvector(name)` support full-text search at the DB level (though currently not leveraged by the frontend)

### Realtime Subscriptions

Used in exactly one place: `ActivityLog.tsx` subscribes to `INSERT` events on `activity_logs` using `supabase.channel('activity-logs-realtime')`. This powers live updates in the admin audit view without polling.

### Edge Functions

| Function | Runtime | Purpose |
|---|---|---|
| `delete-users` | Deno | Batch-deletes auth users via Admin API; verifies calling user is admin server-side |
| `get-users-auth-info` | Deno | Retrieves `created_at` and `last_sign_in_at` from `auth.users` (not accessible via PostgREST) |
| `send-notification-email` | Deno | Sends approval/rejection/new-user emails via Resend API |

### Migration Structure

| Migration | Date | Change |
|---|---|---|
| `20260105012830` | Jan 2026 | Initial schema: `profiles`, `files`, storage bucket, `handle_new_user` trigger |
| `20260107001509` | Jan 2026 | Add `user_roles`, `user_permissions`, security definer functions, RLS on files, hardcoded admin trigger |
| `20260107002340` | Jan 2026 | Fix delete policy: only uploaders with `upload_files` permission |
| `20260107093614` | Jan 2026 | (Minor, likely typo fix) |
| `20260113041311` | Jan 2026 | (Minor patch) |
| `20260115044000` | Jan 2026 | (Minor patch) |
| `20260115045406` | Jan 2026 | Add `activity_logs` table, realtime publication |
| `20260311063103` | Mar 2026 | (Minor patch) |
| `20260518103000` | May 2026 | Placeholder (empty) migration for CLI history alignment |
| `20260518120000` | May 2026 | **Major**: Community governance — `approval_status`, `applications`, App-RBAC tables, `has_namespaced_permission`, legacy sync trigger, seed data |

---

## 8. Operational Workflows

### Searching IPL Records

1. Resident navigates to `ipl-finder.veryresto.com`
2. Ecosystem auth validates: session cookie → database permission → access granted
3. All files are fetched (name + content) in a single query
4. Resident types a keyword (e.g., a name or amount) in the search bar
5. `filteredFiles` memo immediately filters; matching lines are shown as inline snippets with highlighted keywords
6. Resident clicks "View" to open the full file with all matches highlighted
7. Resident clicks "Download" → storage `download()` → activity log INSERT → browser file download

### File Upload (Finance Admin Workflow)

1. Finance admin logs in (must have `upload_files` permission)
2. "Upload" button is visible in header
3. Admin opens modal, drags statement CSVs for a specific month
4. Client reads file text (`file.text()`), uploads binary to storage, then inserts row in `files` with full text content
5. Files are uploaded sequentially (one at a time)
6. On completion, `fetchFiles()` is called to refresh the list

### Resident Onboarding

1. New resident visits `ipl-finder.veryresto.com` with no session → redirected to `portal.veryresto.com/?redirect_to=...`
2. Resident authenticates via Google OAuth on community platform
3. `profiles` row is auto-created via `handle_new_user` trigger; `approval_status = 'pending'`
4. Resident is shown the community platform waiting room (collects house_number, whatsapp_number)
5. Admin is notified via email
6. Community platform admin approves resident → `approval_status = 'approved'`
7. Admin also assigns `ipl_finder.resident` app role via community platform admin UI
8. Resident revisits IPL Finder → both gates pass → full access

### Admin Moderation (User Management)

> **Note**: As of the ecosystem evolution, user management is intended to be centralized at `community-platform/admin`. The local `Admin.tsx` page in IPL Finder still exists and is reachable but is architecturally obsolete.

Local Admin.tsx workflow:
1. Admin accesses `/admin` route (protected via `isAdmin` check)
2. All users, their app role assignments, and auth metadata are loaded (parallel queries + edge function)
3. Admin toggles permission switches (read/upload) which assign/remove `user_app_roles` records for `ipl_finder.resident` or `ipl_finder.admin` roles
4. Rejection assigns the `ipl_finder.rejected` marker role and removes active roles; restore removes it
5. Approval/rejection notifications are sent via `send-notification-email` edge function
6. Admin can bulk-delete non-admin users via `delete-users` edge function

### Activity Audit

1. Admin opens `ActivityLog` page (accessible via Admin header button)
2. Last 100 download events are fetched and joined with profile data
3. Realtime subscription shows new downloads live as they occur
4. Currently logs: `download` events only (other actions like `upload` are not logged)

---

## 9. Current Strengths

### Strong Engineering Decisions

**Ecosystem-aware cookie storage**: The `CookieStorage` adapter is a well-engineered piece of infrastructure. It handles domain detection, cookie size optimization (stripping user metadata), JWT reconstruction for the `user` object, and protocol-aware `Secure` flag — all in ~100 lines of TypeScript. This is what enables seamless SSO across subdomains without a dedicated auth server.

**Layered access control**: The two-gate system (platform approval → app permission) correctly separates ecosystem membership from application authorization. The RLS policies enforce this at the database level, meaning the frontend gates are UX affordances, not security mechanisms.

**SECURITY DEFINER functions**: Using helper functions for RLS policy evaluation avoids recursive queries and centralizes permission logic at the DB layer — a best practice pattern.

**`resolvedUserId` parity check**: The race condition guard in `usePermissions` — only redirecting after `resolvedUserId === user.id` — demonstrates careful thinking about async timing during mount.

**`has_namespaced_permission` RPC**: The namespaced permission function (`ipl_finder.read_files`) is a clean abstraction that allows multiple apps to share the same DB schema without permission name collisions.

**Legacy sync trigger**: The `sync_legacy_permissions` trigger is a deliberate strangler fig pattern — new App-RBAC writes sync back to the old `user_permissions` table, preventing a big-bang migration requirement.

**PWA configuration**: The `vite-plugin-pwa` integration with `NetworkFirst` caching for Supabase URLs is appropriate for the mobile-first community use case.

**Edge function server-side verification**: The `delete-users` edge function re-validates the calling user's admin role server-side using the service role key, rather than trusting the client's claimed role. This is correct.

---

## 10. Technical Debt & Risks

### Frontend Architecture Risks

**1. No server-side search**
Client-side full-text search across full file content will break down as the document repository grows. The database already has `gin(to_tsvector('english', content))` indexes — these are never used. This is wasted infrastructure.

**2. TanStack Query installed but unused**
`@tanstack/react-query` is in `package.json` and the `QueryClientProvider` wraps the app, but no `useQuery` or `useMutation` hooks are used. All data fetching is manual `useEffect` + `useState`. This means no cache, no background refresh, no loading/error states managed uniformly.

**3. `duplicated highlightMatch` logic**
Identical highlighting utilities exist in both `FileList.tsx` and `FileViewerModal.tsx`. This should be extracted to a shared utility.

**4. `FileWithProfile` type is duplicated**
The `FileWithProfile` interface is defined independently in `Index.tsx`, `FileList.tsx`, and `FileViewerModal.tsx` — should be a shared type.

**5. Sequential upload**
Files are uploaded one at a time in a `for` loop. Parallel uploads with `Promise.all` would be more efficient for multi-file batches.

### Maintainability Issues

**6. Legacy Admin.tsx is architecturally ambiguous**
`Admin.tsx` provides local user management that now partially overlaps with what `community-platform` does. The "Admin" button in `Header.tsx` points to `${portalUrl}/admin` (external), but the `/admin` route in this app still renders the local admin page. This creates two diverging admin surfaces.

**7. Hardcoded admin email in SQL trigger**
`assign_admin_role()` hardcodes `veryresto@gmail.com`. Any admin change requires a new migration.

**8. App-name coupling in edge function**
`send-notification-email` hardcodes `APP_NAME: "Warga RT02"` and `ADMIN_EMAIL: "veryresto@gmail.com"` in a `CONFIG` object at the top. These should be environment variables.

**9. `ipl_finder.admin` app role name is misleading** *(deferred, low priority)*
The seeded `admin` app role for `ipl_finder` grants `read_files + upload_files` — functionally a finance/uploader role, not a platform administrator. The name collides conceptually with the global `user_roles.role = 'admin'`. A future cleanup should rename it to `uploader` or `staff`.

Migration path when ready:
```sql
-- 1. Rename the app_role row
UPDATE public.app_roles
SET name = 'uploader', description = 'Can read and upload statement files'
WHERE name = 'admin'
  AND app_id = (SELECT id FROM public.applications WHERE slug = 'ipl_finder');
-- No user_app_roles rows need changing — they reference app_role_id (UUID), not the name.
-- No app_role_permissions rows need changing for the same reason.
```

Frontend change needed alongside: update `usePermissions.tsx` local admin check (`app_roles.name = 'admin'` → `'uploader'`) and `Admin.tsx` role-mapping logic.

### Scaling Bottlenecks

**9. Full content SELECT on file list load (accepted trade-off)**
Loading the full `content` column for all files is intentional — it enables instant client-side search. At the current scale (dozens of monthly CSV files), the payload is small. If the corpus grows to hundreds of large files, the escape hatch is PostgreSQL's existing `tsvector` GIN indexes + a server-side search RPC.

**10. No pagination anywhere**
Admin user list, activity logs (limited to 100), and file list all use full-table fetches. Note: Storage security is being refactored to check permissions against the `files` table, which will mitigate issues with the permissive storage read policy.

**11. Pending users detection is a multi-table N+1**
`fetchPendingUsers()` in `Index.tsx` fetches all profiles, all permissions, and all roles separately, then computes the intersection in JavaScript. This is a 3-query scan triggered every time `isAdmin` becomes true.

### Security Gaps

~~**12. Storage read policy is too permissive**~~ *(resolved — storage RLS now requires `read_files` permission)*

~~**13. Two sources of truth for permissions**~~ *(resolved — `user_permissions` table dropped; `user_app_roles` is the single source of truth)*

### Operational Fragility

**14. No error monitoring**
There is no error tracking (Sentry, etc.). Failures in edge functions or data fetching surface only as toast notifications or `console.error` logs.

**15. `VITE_PORTAL_URL` is baked at build time**
Any production portal URL change requires a full rebuild and redeploy (Vite embeds env vars at build time). This is noted in `docs/ipl-finder-evolution-plan.md` as a known constraint.

---

## 11. Future Evolution

### Search / Indexing

- **Current approach (keep)**: Client-side full-text search over pre-loaded content is the intentional design for this scale. Fast, simple, zero latency after initial load.
- **Future escape hatch**: If the file corpus grows significantly (hundreds of large files), route search through `supabase.rpc('search_files', { query })` using PostgreSQL's `to_tsquery` + existing GIN indexes and return only `ts_headline` snippets per match — keeping the network payload small regardless of corpus size. The DB is already indexed for this.

### Caching and Data Freshness

- Adopt TanStack Query (already installed) for all data fetching — replace `useEffect` + `useState` patterns
- Use `staleTime` of 60s for the file list; use `invalidateQueries` on upload/delete
- Consider Supabase Realtime for live file list updates (new uploads appear automatically for all active sessions)

### Upload Architecture

- Parallelize multi-file uploads using `Promise.allSettled`
- Add upload progress tracking (Supabase Storage `onUploadProgress` callback)
- Consider server-side content extraction: store binary file in storage first, then trigger an edge function to extract text and update the `files.content` column — this avoids transmitting large file content in two directions from the browser

### PWA / Offline Support

- The PWA manifest and service worker are already configured
- Current `NetworkFirst` strategy for Supabase API calls means offline use is not supported
- To enable offline browsing of previously viewed files: cache the file list and content using `CacheFirst` with a `StaleWhileRevalidate` strategy
- File downloads could be cached to service worker cache storage for offline access

### Scalability

- **Server-side pagination**: Add `.range(0, 49)` + cursor-based pagination to file list and admin user list
- **Column projection**: Stop fetching `content` in the file list query; only fetch it when a file is opened (`onViewFile`)
- **Search endpoint**: Server-side full-text search would allow eliminating the `content` column from the list query entirely

### Realtime Updates

- Extend the Realtime subscription already used in `ActivityLog.tsx` to `files` table — new uploads would appear live across all active sessions
- Add a presence indicator showing "N users online" for community engagement

### Analytics

- Add upload analytics: track which files are downloaded most frequently, by whom
- Extend `activity_logs` to cover `upload` and `delete` events (currently only `download` is tracked)
- Aggregate search queries to understand what residents search for most

### Multi-Community Support

- The ecosystem architecture already supports this conceptually via `applications` registry
- IPL Finder would need `community_id` scope on `files`, `activity_logs`, and storage paths
- Permissions would be namespaced per community: `ipl_finder:{community_id}.read_files`

---

## 12. Repository Map

```
file-finder-sr3/
├── src/
│   ├── App.tsx                    # Provider composition + router
│   │                              # Wraps: QueryClient, AuthProvider, TooltipProvider, Router
│   ├── main.tsx                   # Vite entry point
│   ├── index.css                  # Design tokens, base styles (Tailwind + custom)
│   │
│   ├── pages/
│   │   ├── Index.tsx              # ★ Core application page
│   │   │                          # Owns: auth gate logic, redirect orchestration,
│   │   │                          # file state, search state, bulk operations
│   │   ├── Admin.tsx              # ★ User management dashboard (legacy, admin-only)
│   │   │                          # Owns: user permission toggles, reject/restore,
│   │   │                          # bulk delete via edge function
│   │   ├── ActivityLog.tsx        # Audit log viewer (admin-only, realtime)
│   │   └── NotFound.tsx           # 404 fallback
│   │
│   ├── components/
│   │   ├── Header.tsx             # App bar: search input, upload CTA, user menu
│   │   ├── FileList.tsx           # File grid with snippet highlighting + bulk select
│   │   ├── FileUploadModal.tsx    # Drag-and-drop file upload dialog
│   │   ├── FileViewerModal.tsx    # Full content viewer + download trigger + audit log
│   │   ├── LoginScreen.tsx        # [Legacy] Local Google SSO screen (bypassed)
│   │   ├── PendingApprovalScreen.tsx # [Legacy] Profile collection waiting room (bypassed)
│   │   ├── RejectedScreen.tsx     # [Legacy] Rejection message screen (bypassed)
│   │   └── ui/                    # shadcn/ui primitives (Button, Dialog, Table, etc.)
│   │
│   ├── hooks/
│   │   ├── useAuth.tsx            # ★ Auth context provider + consumer hook
│   │   │                          # Source: supabase.auth session events
│   │   ├── usePermissions.tsx     # ★ Permission resolver hook
│   │   │                          # Sources: user_roles, profiles, has_namespaced_permission RPC
│   │   ├── use-mobile.tsx         # Viewport width breakpoint hook
│   │   └── use-toast.ts           # Toast notification queue hook
│   │
│   ├── integrations/supabase/
│   │   ├── client.ts              # ★★ Critical: Supabase client + CookieStorage adapter
│   │   │                          # The key ecosystem integration point
│   │   └── types.ts               # Auto-generated DB TypeScript types
│   │
│   └── lib/
│       └── utils.ts               # cn() + misc utilities
│
├── supabase/
│   ├── config.toml                # Supabase CLI config
│   ├── migrations/                # Chronological schema history (10 migrations)
│   │   └── 20260518120000_*.sql   # ★ Most recent: full App-RBAC governance layer
│   └── functions/
│       ├── delete-users/          # Admin user deletion via Auth Admin API
│       ├── get-users-auth-info/   # Fetch auth timestamps inaccessible via PostgREST
│       └── send-notification-email/ # Resend-based email notifications
│
├── docs/
│   ├── platform-identity-architecture.md  # Pre-migration architecture analysis
│   ├── ipl-finder-evolution-plan.md       # Migration implementation spec
│   └── (other reference docs)
│
├── vite.config.ts                 # Vite + PWA + allowed hosts configuration
├── tailwind.config.ts             # Tailwind theme
├── Dockerfile                     # Container build for fly.io deployment
├── fly.toml                       # fly.io deployment configuration
├── .env-example                   # Required environment variables
└── package.json                   # Dependencies (React 18, Supabase, TanStack Query, shadcn/ui)
```

### Entry Points by Concern

| Concern | Entry Point |
|---|---|
| App bootstrap | [`src/main.tsx`](file:///Users/a/Codes/file-finder-sr3/src/main.tsx) |
| Ecosystem session sharing | [`src/integrations/supabase/client.ts`](file:///Users/a/Codes/file-finder-sr3/src/integrations/supabase/client.ts) (CookieStorage) |
| Auth state | [`src/hooks/useAuth.tsx`](file:///Users/a/Codes/file-finder-sr3/src/hooks/useAuth.tsx) |
| Permission resolution | [`src/hooks/usePermissions.tsx`](file:///Users/a/Codes/file-finder-sr3/src/hooks/usePermissions.tsx) |
| Redirect orchestration | [`src/pages/Index.tsx`](file:///Users/a/Codes/file-finder-sr3/src/pages/Index.tsx) (lines 50–60) |
| Database schema | [`supabase/migrations/`](file:///Users/a/Codes/file-finder-sr3/supabase/migrations) |
| App-RBAC governance | [`supabase/migrations/20260518120000_*.sql`](file:///Users/a/Codes/file-finder-sr3/supabase/migrations/20260518120000_community_platform_governance_v2.sql) |
