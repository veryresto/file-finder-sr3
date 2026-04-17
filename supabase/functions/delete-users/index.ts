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

const CLERK_SECRET_KEY = Deno.env.get("CLERK_SECRET_KEY") ?? "";

interface DeleteUsersRequest {
  userIds: string[];
}

serve(async (req): Promise<Response> => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const identity = await verifyClerkToken(req);
    const db = getServiceClient();

    await upsertProfile(identity, db);
    await assertAdmin(identity, db);

    const { userIds }: DeleteUsersRequest = await req.json();

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return jsonResponse({ error: "No user IDs provided" }, 400);
    }

    // Prevent admin from deleting themselves
    if (userIds.includes(identity.sub)) {
      return jsonResponse({ error: "Cannot delete your own account" }, 400);
    }

    console.log(`Admin ${identity.email} is deleting users:`, userIds);

    const results: { userId: string; success: boolean; error?: string }[] = [];

    for (const userId of userIds) {
      try {
        // Prevent deleting other admins
        const { data: targetAdminRole } = await db
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin")
          .maybeSingle();

        if (targetAdminRole) {
          results.push({ userId, success: false, error: "Cannot delete admin users" });
          continue;
        }

        // Delete from Clerk via Admin API
        const clerkRes = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${CLERK_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
        });

        if (!clerkRes.ok) {
          const body = await clerkRes.json().catch(() => ({}));
          const msg = body?.errors?.[0]?.message ?? `Clerk API error ${clerkRes.status}`;
          console.error(`Error deleting Clerk user ${userId}:`, msg);
          results.push({ userId, success: false, error: msg });
          continue;
        }

        // Also clean up DB rows (profiles, permissions, roles)
        // profiles cascade-delete is gone, so delete manually
        await Promise.all([
          db.from("user_permissions").delete().eq("user_id", userId),
          db.from("user_roles").delete().eq("user_id", userId),
          db.from("files").delete().eq("uploader_id", userId),
        ]);
        await db.from("profiles").delete().eq("id", userId);

        console.log(`Successfully deleted user ${userId}`);
        results.push({ userId, success: true });
      } catch (error: any) {
        console.error(`Error processing user ${userId}:`, error);
        results.push({ userId, success: false, error: error.message });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return jsonResponse({
      message: `Deleted ${successCount} user(s)${failCount > 0 ? `, ${failCount} failed` : ""}`,
      results,
    });
  } catch (err) {
    return errorResponse(err);
  }
});
