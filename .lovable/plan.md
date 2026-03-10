

# Plan: Update README.md with Project Summary, Interoperability Guide, and Architecture Diagram

## What will be added

The README.md will be rewritten to include three new major sections while keeping the existing development setup instructions:

### 1. Project Summary
A concise overview of File Finder SR3: a document repository for bank e-statements with full-text search, role-based access control, and activity auditing.

### 2. Architecture Diagram (Mermaid)
A visual diagram showing how the frontend connects to backend services:
- **Auth**: Google OAuth SSO via Supabase Auth
- **Database**: PostgreSQL tables (`profiles`, `files`, `user_roles`, `user_permissions`, `activity_logs`) with RLS policies and security-definer functions
- **Storage**: Private `text-files` bucket for uploaded documents
- **Edge Functions**: `delete-users`, `get-users-auth-info`, `send-notification-email`

### 3. Interoperability / Migration Guide
A section explaining what integrations are Supabase-dependent and what's needed to migrate away from Lovable Cloud:

| Component | Lovable Cloud (current) | Migration Target |
|-----------|------------------------|-----------------|
| **Auth** | Supabase Auth (Google OAuth) | Any OAuth provider (Firebase Auth, Auth0, Clerk) — update `useAuth.tsx` and env vars |
| **Database** | Supabase PostgreSQL | Any PostgreSQL host — export schema via `supabase db dump`, migrate RLS policies and functions |
| **Storage** | Supabase Storage (`text-files` bucket) | Any S3-compatible storage — update upload/download logic in `FileUploadModal.tsx` and `FileViewerModal.tsx` |
| **Edge Functions** | Supabase Edge Functions (Deno) | Any serverless platform (AWS Lambda, Cloudflare Workers) — rewrite from Deno to Node.js if needed |
| **Client SDK** | `@supabase/supabase-js` | Replace with direct REST/PostgreSQL client calls |

Key files that contain Supabase-specific code will be listed for reference.

### Technical approach
- Single file edit to `README.md`, replacing the boilerplate content with the enriched version
- Mermaid diagram will be embedded as a standard markdown code block (```mermaid)

