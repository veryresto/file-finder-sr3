Create a detailed implementation planning document for extracting the existing identity, approval, and permission system from the IPL Finder codebase into a new dedicated application:

```txt id="jlwm38"
accounts-app
```

This task is still architecture + implementation planning only.

Do NOT implement the app yet.

The purpose of this document is to define a safe and incremental extraction strategy from the existing IPL Finder codebase into a reusable shared community identity platform.

The new application will eventually become:

```txt id="jlwm39"
accounts.veryresto.com
```

and will provide:

* centralized community identity
* approval workflow
* shared permissions
* governance management
* shared Supabase authentication

for multiple apps including:

* rekap.veryresto.com
* ipl-finder.veryresto.com
* kas.veryresto.com
* surat.veryresto.com

The implementation plan should be written to:

```txt id="jlwm40"
docs/accounts-app-implementation-plan.md
```

---

# Planning Goals

The plan must prioritize:

* minimal disruption
* incremental extraction
* preserving existing IPL Finder functionality
* shared Supabase project
* future multi-app compatibility
* operational simplicity

Avoid:

* premature abstraction
* microservices
* distributed auth systems
* Clerk/Auth0/Keycloak
* complex enterprise IAM concepts

---

# 1. Define Target Architecture

Describe the intended future architecture including:

## Shared Platform

```txt id="jlwm41"
accounts-app
```

Responsibilities:

* authentication entrypoint
* waiting room
* resident approval
* permission assignment
* shared resident profiles
* governance dashboard

---

## Independent Applications

Examples:

* IPL Finder
* Rekap
* Surat
* Kas

Each app should:

* remain independently deployable
* share Supabase auth/session
* use centralized identity tables
* maintain app-specific business logic

---

# 2. Define Extraction Strategy

Create a phased extraction plan.

For each phase:

* objective
* scope
* affected systems
* migration risk
* rollback strategy

The plan should minimize breaking changes.

Suggested extraction stages:

## Phase 1

Create accounts-app scaffold only

## Phase 2

Move waiting-room UI

## Phase 3

Move approval/admin UI

## Phase 4

Centralize permissions

## Phase 5

Convert IPL Finder into consumer of centralized identity

## Phase 6

Integrate Rekap

---

# 3. Shared Database Strategy

Define:

* which tables become shared platform tables
* which tables remain app-specific

Document:

* ownership boundaries
* naming conventions
* permission namespacing strategy

Recommend future-safe permission naming:

Example:

```txt id="jlwm42"
ipl_finder.read
ipl_finder.upload
rekap.view
kas.manage
```

instead of generic names.

---

# 4. Shared Permission Architecture

Design:

* app registration model
* app-specific permission model
* user-to-app capability assignment

Propose tables such as:

* applications
* app_permissions
* user_app_permissions

Explain:

* how RLS would evolve
* how sibling apps query permissions

---

# 5. Authentication & Session Strategy

Document:

* how Supabase session sharing should work across subdomains
* redirect/login flow
* session validation expectations

Example:

```txt id="jlwm43"
accounts.veryresto.com/login
```

then redirect back to:

```txt id="jlwm44"
rekap.veryresto.com
```

Explain:

* assumptions
* browser constraints
* SameSite/cookie considerations

---

# 6. Governance Model

Define:

* resident lifecycle
* pending approval flow
* rejected flow
* suspended users
* admin roles
* permission delegation

Clarify:

* global roles vs app-specific permissions

---

# 7. Migration Safety

Very important:
The plan must explain how IPL Finder remains fully operational during migration.

Document:

* compatibility strategy
* temporary duplication
* fallback approach
* phased rollout

Avoid:

* "big bang" migration.

---

# 8. App Onboarding Model

Define how future apps should integrate with accounts-app.

For example:

* required Supabase config
* required permission checks
* required shared tables
* recommended auth middleware/hooks

Explain:

* how future resident developers can create their own apps under subdomains.

---

# 9. Deployment Strategy

Document:

* recommended deployment topology
* Fly.io considerations
* shared environment variables
* Supabase project reuse
* DNS/subdomain expectations

---

# 10. Constraints

Do NOT:

* implement code
* refactor existing app yet
* create new migrations yet
* introduce enterprise IAM
* create distributed microservices

This task is implementation planning only.

---

# 11. Deliverable Quality

The document should:

* be detailed
* reference current architecture
* explain reasoning
* prioritize maintainability
* prioritize operational simplicity
* distinguish platform concerns from app concerns
* support future collaborative app ecosystem.
