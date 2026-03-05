# Codebase Analysis: File Finder SR3

This document provides an overview of the `file-finder-sr3` project, its functionality, and its core governance model.

## Project Purpose

The File Finder SR3 is a specialized document repository designed to manage and search through bank e-statements that have been converted into text-based formats (CSV or Plain Text). It solves the problem of searching across multiple months/years of statements by providing a centralized index with full-text search capabilities.

## Core Functionality

- **Centralized Document Index**: Stores and organizes text files extracted from bank PDFs.
- **Search Capabilities**: Provides a fast search interface that filters files based on:
  - File names.
  - File content (full-text search).
- **File Management**: Allows users to upload new statements and delete existing ones.
- **Activity Auditing**: Tracks user actions, such as file downloads, to maintain a trail of access.

## Implemented Governance

The most critical aspect of the codebase is its strict governance model, ensuring that sensitive financial data is only accessible to authorized individuals.

### Registration and Access Flow
1. **Self-Registration**: Users can sign up for an account.
2. **Restricted Initial Access**: Upon registration, users are NOT immediately granted access to the application.
3. **Pending Approval**: New users are directed to a "Pending Approval" screen and cannot view or upload any files.
4. **Admin Approval**: An administrator (identified by a specific email or role) must manually review pending users.
5. **Granular Permissions**: Admins grant specific access levels rather than a blanket approval:
   - **Read Files**: Permission to view and search the document repository.
   - **Upload Files**: Permission to add new documents to the system.
6. **Rejection**: Admins have the authority to reject access requests, which moves users to a "Rejected" state.

### Security Implementation
- **Supabase Integration**: Uses Supabase for Authentication and Database.
- **Row-Level Security (RLS)**: Database-level policies ensure that even if a user bypasses the UI, they cannot query data without the appropriate `read_files` or `upload_files` permissions in the `user_permissions` table.
- **Role-Based Hooks**: Custom React hooks (`usePermissions`) manage the UI state based on the user's current approval status.

## Technical Stack

- **Frontend**: React with Vite, TypeScript, and Tailwind CSS.
- **UI Components**: Shadcn UI (Radix UI) for a premium, responsive look.
- **Backend**: Supabase (PostgreSQL, Storage, Edge Functions).
- **Permissions**: Custom schema with `profiles`, `user_roles`, and `user_permissions`.

---
*Created on March 2026*
