import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  verifyClerkToken,
  getServiceClient,
  assertAdmin,
  upsertProfile,
  handleCors,
  jsonResponse,
  errorResponse,
} from "../_shared/clerkAuth.ts";

const CLERK_SECRET_KEY = Deno.env.get("CLERK_SECRET_KEY") ?? "";

/**
 * GET /functions/v1/get-users-auth-info
 *
 * Returns first_login (created_at) and last_sign_in_at for all users
 * by fetching from the Clerk Admin API instead of auth.users.
 * Admin only.
 */
serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const identity = await verifyClerkToken(req);
    const db = getServiceClient();

    await upsertProfile(identity, db);
    await assertAdmin(identity, db);

    // Fetch users from Clerk Admin API (paginated, up to 500)
    const clerkRes = await fetch(
      "https://api.clerk.com/v1/users?limit=500&order_by=-created_at",
      {
        headers: {
          Authorization: `Bearer ${CLERK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!clerkRes.ok) {
      const body = await clerkRes.json().catch(() => ({}));
      const msg = body?.errors?.[0]?.message ?? `Clerk API error ${clerkRes.status}`;
      throw new Error(msg);
    }

    const clerkUsers: {
      id: string;
      created_at: number;   // Clerk returns Unix ms timestamps
      last_sign_in_at: number | null;
    }[] = await clerkRes.json();

    // Map to same shape expected by Admin.tsx
    const users = clerkUsers.map((u) => ({
      id: u.id,
      created_at: u.created_at ? new Date(u.created_at).toISOString() : null,
      last_sign_in_at: u.last_sign_in_at ? new Date(u.last_sign_in_at).toISOString() : null,
    }));

    return jsonResponse({ users });
  } catch (err) {
    return errorResponse(err);
  }
});
