# Platform Identity Architecture

This document outlines the authentication, authorization, approval workflow, and governance systems currently implemented in the IPL Finder application. It serves as an architectural blueprint for extracting these systems into a shared identity platform (`accounts.veryresto.com`) that can power multiple applications (e.g., `rekap.veryresto.com`, `ipl-finder.veryresto.com`, `surat.veryresto.com`, `kas.veryresto.com`) using shared Supabase authentication and community authorization.

---

## 1. Current Authentication Flow

The current application relies on Supabase Auth, specifically utilizing Google OAuth for sign-in.

### Configuration & Login
- **Provider**: Google OAuth is the sole authentication provider.
- **Trigger**: Users sign in by clicking "Continue with Google" on the `LoginScreen` (`src/components/LoginScreen.tsx`), which calls `signInWithGoogle` from `useAuth.tsx`.
- **Redirect**: Supabase is configured to redirect back to the application origin upon successful authentication.

### Session & State Handling
- **Provider Hook**: The `AuthProvider` (`src/hooks/useAuth.tsx`) wraps the application and exposes user/session state.
- **Listeners**: It uses `supabase.auth.onAuthStateChange` to actively listen for session events (login/logout/token refresh).
- **Initialization**: On mount, it calls `supabase.auth.getSession()` to rehydrate existing sessions and updates the user's `last_active_at` timestamp in the `profiles` table.

### Route Protection
Route protection is currently handled conditionally at the component level within `src/pages/Index.tsx` and `src/pages/Admin.tsx`:
- **`Index.tsx`**: Renders `LoginScreen` if no user, `RejectedScreen` if `isRejected`, `PendingApprovalScreen` if `!isApproved`, and finally the main application view if fully approved.
- **`Admin.tsx`**: Checks if the user `isAdmin` and redirects unauthorized users back to the root route (`/`).

---

## 2. Waiting Room / Approval Workflow

The application implements a strict "waiting room" pattern where authenticated users must be explicitly granted permissions to access the system.

### Full Lifecycle
1. **User Signs Up**: User logs in via Google. Supabase creates an `auth.users` record.
2. **Profile Creation**: A Postgres trigger (`on_auth_user_created`) automatically creates a `public.profiles` record containing the user's email, name, and avatar.
3. **Pending Approval State**: The user lands on `Index.tsx`. Because they have no permissions, they are shown the `PendingApprovalScreen`.
4. **Data Collection**: On the `PendingApprovalScreen`, the user must provide their `house_number` and optionally `whatsapp_number`. Submitting this updates their `profiles` record and invokes a Supabase Edge Function (`send-notification-email`) to notify admins.
5. **Admin Review**: Admins see the user in the "Active Users" table on the `Admin` dashboard. The user is marked as "Pending" (having neither `read_files` nor `upload_files` permissions).
6. **Approved State**: An admin toggles a permission switch (e.g., "Read"). This inserts a record into `user_permissions`. The user is now `isApproved` and gains access to the main application. Another email is dispatched to the user.
7. **Rejected State**: An admin can click the "Reject" (X) button. This deletes any existing permissions and inserts a special `rejected` permission. The user is then locked into the `RejectedScreen`.
8. **Restoration**: Admins can restore a rejected user by removing the `rejected` permission, sending them back to the pending state.

### Analysis
- **Reusable Concepts**: The overall flow of Authentication -> Profile creation -> Pending State -> Admin Approval/Rejection is highly generic and prime for platform extraction.
- **App-Specific Assumptions**: The requirement to collect `house_number` is specific to the community nature of IPL Finder and related local apps, but might not apply globally to all apps.

---

## 3. Database Schema Extraction

The schema is built on Postgres using Supabase. The relevant governance tables are created via migrations (e.g., `20260105012830_...` and `20260107001509_...`).

### `profiles`
- **Purpose**: Stores public-facing user metadata linked 1-to-1 with `auth.users`.
- **Columns**: `id` (UUID, primary key, references `auth.users`), `email`, `full_name`, `avatar_url`, `house_number`, `whatsapp_number`, `last_active_at`, timestamps.
- **Usage**: Used to display user information in the UI (Admin table, file uploader attribution). Updated by users during the "Waiting Room" phase.

### `user_roles`
- **Purpose**: Assigns high-level roles to users.
- **Columns**: `id`, `user_id` (references `auth.users`), `role` (enum: `'admin'`, `'user'`).
- **Usage**: Powers the `isAdmin` boolean in the frontend. Used extensively in Row Level Security (RLS) policies.

### `user_permissions`
- **Purpose**: Grants granular capabilities or marks negative states.
- **Columns**: `id`, `user_id`, `permission` (enum: `'read_files'`, `'upload_files'`, implicitly extended to handle `'rejected'`), `granted_by` (admin who granted it).
- **Usage**: Evaluated to determine `isApproved`, `isRejected`, `canReadFiles`, and `canUploadFiles` states.

**Simplified ERD**:
```
auth.users (Supabase internal)
  |-- 1:1 -- profiles (metadata, contact info)
  |-- 1:M -- user_roles (role: admin)
  |-- 1:M -- user_permissions (permission: read_files, upload_files, rejected)
```

---

## 4. Permission Model

### Representation & Checking
Permissions are managed as enums in the database and queried on the frontend via `usePermissions.tsx`.
- **`isAdmin`**: `true` if a record exists in `user_roles` with `role = 'admin'`. Admins bypass other permission checks and inherently have read/upload access.
- **Granular Permissions**: For non-admins, `user_permissions` records dictate access.
  - `canReadFiles`: Has `'read_files'` permission.
  - `canUploadFiles`: Has `'upload_files'` permission.
  - `isRejected`: Has `'rejected'` permission.
- **`isApproved`**: A derived boolean representing `isAdmin || canReadFiles || canUploadFiles`.

### Platform vs. Specific Concepts
- **Platform Concepts**: The existence of roles (Admin vs. User), the concept of being "Rejected", and the overall "Approved" derived state are generic governance concepts.
- **App-Specific Concepts**: `'read_files'` and `'upload_files'` are highly specific to IPL Finder. A future platform will need a generic string-based permission schema tied to specific application IDs or resource scopes.

---

## 5. RLS Policies

Row Level Security ensures the Postgres database enforces permissions, preventing unauthorized access even if the frontend is bypassed.

### Key Policies
- **Security Definer Functions**: To avoid recursive queries in RLS, the schema uses `has_role(uuid, role)` and `has_permission(uuid, permission)` functions executing with elevated privileges (`SECURITY DEFINER`).
- **Profiles**: `Users can view all profiles` (authenticated users) and `Users can update own profile`.
- **Roles & Permissions**: `Admins can view/manage all roles/permissions`. Regular users can only select their own permissions.
- **Application Data (`files`)**:
  - `Approved users can view files`: Depends on `has_role('admin') OR has_permission('read_files')`.
  - `Users with upload permission can upload files`: Depends on `has_role('admin') OR has_permission('upload_files')`.
  - Storage bucket policies also mirror these access patterns.

These policies are critical because they anchor security at the database layer. A shared platform will likely maintain a central `user_roles`/`permissions` set of tables that individual app schemas query via cross-schema or shared security definer functions.

---

## 6. Admin Governance Flow

### Admin Behaviors
- **Role Assignment**: An automatic trigger (`assign_admin_role`) currently grants the `'admin'` role to a specific hardcoded email (`veryresto@gmail.com`) upon signup.
- **User Management UI**: `Admin.tsx` provides a dashboard to view all users, filtered by active and rejected states.
- **Granting Permissions**: Admins toggle switches to grant/revoke `'read_files'` or `'upload_files'`. This directly inserts/deletes `user_permissions` records.
- **Rejection Flow**: Clicking the reject button wipes existing permissions and sets the `'rejected'` permission, moving the user to the Rejected tier.
- **Bulk Deletion**: Admins can purge users entirely by calling a Supabase Edge Function (`delete-users`) which interacts with the Supabase Admin API.

### Assumptions to Make Configurable
- Hardcoding the root admin email in a SQL trigger is an anti-pattern for a multi-tenant platform.
- Hardcoding specific capabilities (`read_files`, `upload_files`) in the Admin UI components limits extensibility. The UI should dynamically render available permissions based on the target application's configuration.

---

## 7. Platform Extraction Opportunities

### Shared Platform Functionality
The following should be extracted into the `accounts.veryresto.com` platform:
- **Supabase Auth Configuration**: Centralized Google OAuth project.
- **Profile Management**: `profiles` table, handling names, avatars, and contact information.
- **Core Governance Tables**: `user_roles` and a more generic version of `user_permissions`.
- **The "Waiting Room"**: The concept of collecting required contact information and pausing access until admin approval.
- **Admin Dashboard**: A centralized portal to approve users, view activity logs, and assign cross-application roles.
- **Notifications**: Centralized mailing/notification Edge Functions for signups and approvals.

### App-Specific Capabilities
The following should remain in `ipl-finder` (and other sibling apps):
- **App-Specific Enums**: The actual capability strings (e.g., `iplfinder.read`, `iplfinder.upload`, `kas.manage`).
- **App Data Tables**: The `files` table and storage buckets.
- **App-Level UI**: The actual `FileList`, `UploadModal`, etc.

---

## 8. Proposed Future Architecture

### Centralized Identity (`accounts.veryresto.com`)
This new application will act as the master identity provider and governance center.

1. **Shared Supabase Project**: All apps (`accounts`, `ipl-finder`, `kas`) will connect to the same Supabase database and Auth instance. 
2. **SSO / Session Sharing**: Since all apps use the same Supabase URL/Anon Key on subdomains of `.veryresto.com`, auth tokens can be shared (e.g., via shared cookies or seamless redirects).
3. **Enhanced Permission Schema**:
   - `applications` table: Registers `ipl-finder`, `kas`, etc.
   - `app_permissions` table: Defines valid permissions for an app (e.g., `app_id`, `permission_key`).
   - `user_app_permissions`: Maps user -> app -> permission_key.
4. **Central Admin Portal**: `accounts.veryresto.com` will house the Admin UI, removing `Admin.tsx` from individual applications. Admins will manage users globally and assign app-specific access rights from this single pane of glass.

### Flow for a Sibling App (e.g., `ipl-finder.veryresto.com`)
1. User visits `ipl-finder`.
2. If unauthenticated, redirected to `accounts.veryresto.com/login?redirect=ipl-finder...`.
3. User logs in. `accounts` checks global approval. If pending, handles "Waiting Room" data collection directly on `accounts`.
4. If approved globally and has `ipl-finder` permissions, redirects back.
5. `ipl-finder` initializes Supabase client, sees valid session, and queries the shared `user_app_permissions` via RLS to determine local UI state (can upload vs read only).

---

## 9. Important Constraints

As stipulated, the current task was an **analysis and architecture extraction only**. 
- The application has not been rewritten.
- No microservices or external identity providers (Auth0/Clerk) have been introduced.
- The existing codebase remains perfectly intact and functional while serving as the basis for this blueprint.
