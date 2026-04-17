import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  verifyClerkToken,
  getServiceClient,
  assertAdmin,
  upsertProfile,
  handleCors,
  jsonResponse,
  errorResponse,
} from "../_shared/clerkAuth.ts";

/**
 * GET /functions/v1/get-pending-users
 *
 * Returns the count (and list) of users who have no roles or permissions yet.
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

    const [profilesResult, permissionsResult, rolesResult] = await Promise.all([
      db.from("profiles").select("id"),
      db.from("user_permissions").select("user_id"),
      db.from("user_roles").select("user_id"),
    ]);

    if (profilesResult.error) throw profilesResult.error;

    const approvedUserIds = new Set([
      ...(permissionsResult.data?.map((p) => p.user_id) ?? []),
      ...(rolesResult.data?.map((r) => r.user_id) ?? []),
    ]);

    const pendingUsers = (profilesResult.data ?? []).filter(
      (p) => !approvedUserIds.has(p.id)
    );

    return jsonResponse({
      pendingCount: pendingUsers.length,
      hasPending: pendingUsers.length > 0,
    });
  } catch (err) {
    return errorResponse(err);
  }
});
