# IPL Finder Evolution Plan: Standalone to Shared Identity Platform

This document describes the architectural changes implemented in the IPL Finder (`file-finder-sr3`) application to transition its authentication, authorization, and governance systems from a standalone model to a shared-subdomain identity client consuming the **Veryresto Community Identity Portal** (`community-portal`).

---

## 1. Before vs. After Comparison

| Feature | Standalone Architecture (Before) | Centralized Architecture (After) |
| :--- | :--- | :--- |
| **Login Handler** | Local Google OAuth triggered on the local `/login` route. | Centralized Google OAuth handled at `portal.veryresto.com`. |
| **Waiting Room** | Local `PendingApprovalScreen` (collected house & phone numbers). | Centralized Waiting Room at community portal. |
| **Admin Controls** | Local `/admin` dashboard for user approvals and role toggles. | Centralized Platform Dashboard at community portal. |
| **Session Engine** | Standard browser `localStorage` engine (host-locked). | Custom `.veryresto.com` subdomain `CookieStorage` (`veryresto-auth`). |
| **Permission Source** | Direct queries to local `user_permissions` / `user_roles`. | Centralized database queries with RBAC compatibility triggers. |

---

## 2. Key Architectural Modifications

### 1. Centralized Auth Redirection
All local authentication screens and routes have been removed from IPL Finder. 
- **Redirect Hook (`Index.tsx`)**: On mount, if the user is unauthenticated (`!user`), the application automatically redirects the browser to the portal:
  ```typescript
  window.location.replace(`${portalUrl}/?redirect_to=${encodeURIComponent(window.location.origin)}`);
  ```
- **Dynamic Portal Resolution**: The target portal URL is resolved dynamically:
  * **Local Development**: Points to `http://portal.localtest.me:5173`
  * **Production**: Points to `https://portal.veryresto.com` (or overrides via `VITE_PORTAL_URL`).

### 2. Subdomain Cookie Integration
To restore sessions seamlessly when returning from the portal, IPL Finder now uses the identical `CookieStorage` adapter as the community portal.
- **Dynamic Scoping**: Determines the base subdomain dynamically (e.g. `.veryresto.com` or `.localtest.me`).
- **Storage Namespace**: Utilizes the shared namespace key `veryresto-auth`.
- **Adaptive Protocol Security**: Configures the `Secure` flag only when using `https:`, allowing local `http://` testing.
- **Payload Stripping & JWT Parsing**: Decodes the access token on load to reconstruct the `user` profile while keeping the cookie size minimal (~1.5KB) to prevent 4KB browser truncation.

### 3. Permissions Sync and Loading Resolution
To prevent single-frame redirect loops during mount (where the user session is loaded but user permissions are still resolving from the database), we introduced a synchronization state check:
- **`resolvedUserId` Tracking (`usePermissions.tsx`)**: Exposes the user ID for which permissions have been successfully fetched.
- **Parity Redirect Check (`Index.tsx`)**:
  ```typescript
  if (user && !permLoading && resolvedUserId === user.id && !isPlatformApproved) {
    window.location.replace(`${portalUrl}/`);
  }
  ```
  This guarantees the client waits until the database query resolves, eliminating false-positive redirections.

---

## 3. Modified and Removed Components

### 1. Deleted/Disabled Code
* **`src/components/LoginScreen.tsx`**: Obsolete login interface.
* **`src/components/PendingApprovalScreen.tsx`**: Obsolete waiting room profile collection screen.
* **`src/components/RejectedScreen.tsx`**: Obsolete local rejection fallback.
* **`src/pages/Admin.tsx`**: Obsolete local governance and verification dashboard.

### 2. Modified Integration Files
* **`src/integrations/supabase/client.ts`**: Swapped standard storage for custom `CookieStorage` adapter under the key `veryresto-auth`.
* **`src/hooks/useAuth.tsx`**: Stripped out legacy local OAuth triggers and URL fragment token hash parsing.
* **`src/hooks/usePermissions.tsx`**: Added `resolvedUserId` state to track permission loading parity.
* **`src/pages/Index.tsx`**: Replaced inline waiting room routing checks with central SSO portal redirects.
* **`vite.config.ts`**: Configured `server.allowedHosts` to permit development via `ipl-finder.localtest.me`.

---

## 4. Production Environment Requirements

To deploy and run the evolved IPL Finder successfully, the following environment variables must be configured in `.env.production` during the Docker image compilation:

```env
# Shared Supabase Project Connection
VITE_SUPABASE_URL="https://your-supabase-project.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your-supabase-anon-key"

# Canonical Identity Portal URL
VITE_PORTAL_URL="https://portal.veryresto.com"
```

> [!IMPORTANT]
> Because Vite embeds environment variables at build time, any changes to `VITE_PORTAL_URL` require a full rebuild and redeployment of the application (`fly deploy`).
