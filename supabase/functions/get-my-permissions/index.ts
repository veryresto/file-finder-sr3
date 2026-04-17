import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  verifyClerkToken,
  getServiceClient,
  upsertProfile,
  handleCors,
  jsonResponse,
  errorResponse,
} from "../_shared/clerkAuth.ts";

/**
 * GET /functions/v1/get-my-permissions
 *
 * Returns the calling user's roles and permissions.
 * Also upserts the profile (lazy registration).
 */
serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const identity = await verifyClerkToken(req);
    const db = getServiceClient();

    // Lazy profile upsert — this is how new Clerk users get registered
    await upsertProfile(identity, db);

    const [rolesResult, permsResult] = await Promise.all([
      db
        .from("user_roles")
        .select("role")
        .eq("user_id", identity.sub),
      db
        .from("user_permissions")
        .select("permission")
        .eq("user_id", identity.sub),
    ]);

    const roles = rolesResult.data?.map((r) => r.role) ?? [];
    const permissions = permsResult.data?.map((p) => p.permission) ?? [];

    return jsonResponse({ roles, permissions });
  } catch (err) {
    return errorResponse(err);
  }
});
