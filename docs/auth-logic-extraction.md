Analyze the existing IPL Finder codebase and extract all authentication, authorization, approval workflow, and governance-related implementation details into a reusable platform identity architecture document.

The goal is NOT to refactor the app yet.

The goal is to reverse-engineer the current "waiting room" and permission system into a reusable shared identity/auth platform specification that can later power multiple apps such as:

* rekap.veryresto.com
* ipl-finder.veryresto.com
* surat.veryresto.com
* kas.veryresto.com

using shared Supabase authentication and shared community authorization.

Create a detailed document:

```txt
docs/platform-identity-architecture.md
```

The document should focus on:

# 1. Current Authentication Flow

Document:

* how Supabase Auth is configured
* login methods
* signup flow
* session handling
* frontend auth state handling
* auth hooks/providers
* route protection

Include:

* relevant files
* important functions/hooks/components
* architectural notes

---

# 2. Waiting Room / Approval Workflow

Document the full lifecycle:

1. user signs up
2. user fills house number
3. user enters phone number
4. profile creation
5. pending approval state
6. approved state
7. rejected state
8. blocked access state

Explain:

* frontend flow
* backend logic
* database state transitions
* admin approval actions

Identify:

* reusable concepts
* app-specific assumptions

---

# 3. Database Schema Extraction

Document all relevant tables related to identity/governance.

Especially:

* profiles
* user_roles
* user_permissions
* approval states

For each table:

* purpose
* important columns
* relationships
* how it is used by app logic
* how it is used by RLS

If possible:

* include simplified ERD-style explanation.

---

# 4. Permission Model

Document:

* how permissions are represented
* how permissions are checked
* hooks/utilities used
* admin vs normal user behavior
* read/upload permissions

Explain:

* which parts are generic platform concepts
* which parts are specific to IPL Finder.

---

# 5. RLS Policies

Extract and explain:

* all important RLS policies
* access assumptions
* policy dependencies on profile/permissions tables

Document:

* why these policies matter
* how they enforce security beyond frontend checks.

---

# 6. Admin Governance Flow

Document:

* how admins approve/reject users
* how admin status is determined
* how permission assignment works
* UI flows for governance

Identify:

* assumptions that should become configurable in future platform identity app.

---

# 7. Platform Extraction Opportunities

Identify:

* which parts should become shared platform functionality
* which parts should stay app-specific

Examples:

* shared identity
* shared approval
* shared permissions
* app-specific capabilities

---

# 8. Proposed Future Architecture

Based on the current implementation, propose a reusable future architecture for:

```txt
accounts.veryresto.com
```

This future app should become:

* shared identity portal
* approval/governance center
* permission management system

while allowing:

* independent apps
* independent deployments
* shared Supabase auth
* shared user database

Discuss:

* recommended separation of concerns
* reusable tables/services
* future permission strategy
* future app onboarding strategy

---

# 9. Important Constraints

Do NOT:

* rewrite the application
* migrate frameworks
* introduce microservices
* introduce Clerk/Auth0/Keycloak
* implement new auth provider
* implement code changes yet

This task is analysis + architecture extraction only.

---

# 10. Deliverable Requirements

The final document should:

* be detailed
* reference actual code files
* explain implementation reasoning
* distinguish reusable platform concepts vs app-specific logic
* help future developers build a dedicated accounts/identity app later.
