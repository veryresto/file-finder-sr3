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
 * POST /functions/v1/manage-permissions
 *
 * Body:
 *   action: "grant" | "revoke" | "reject" | "unreject"
 *   userId: string
 *   permission?: "read_files" | "upload_files"   (required for grant/revoke)
 *
 * Admin only. Also triggers send-notification-email for first-approval events.
 */
serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const identity = await verifyClerkToken(req);
    const db = getServiceClient();

    await upsertProfile(identity, db);
    await assertAdmin(identity, db);

    const { action, userId, permission } = await req.json();

    if (!userId) return jsonResponse({ error: "userId is required" }, 400);

    switch (action) {
      case "grant": {
        if (!permission) return jsonResponse({ error: "permission is required for grant" }, 400);

        // Check if this is the user's first permission (for notification)
        const { data: existing } = await db
          .from("user_permissions")
          .select("permission")
          .eq("user_id", userId);
        const hadNoPermissions =
          !existing || existing.filter((p) => p.permission !== "rejected").length === 0;

        const { error } = await db.from("user_permissions").insert({
          user_id: userId,
          permission,
          granted_by: identity.sub,
        });
        if (error) throw error;

        // Send first-approval notification
        if (hadNoPermissions) {
          const { data: profile } = await db
            .from("profiles")
            .select("email, full_name")
            .eq("id", userId)
            .single();
          if (profile?.email) {
            await db.functions.invoke("send-notification-email", {
              body: {
                type: "user_approved",
                userEmail: profile.email,
                userName: profile.full_name,
                permissions: [permission],
              },
            });
          }
        }
        return jsonResponse({ ok: true, action, userId, permission });
      }

      case "revoke": {
        if (!permission) return jsonResponse({ error: "permission is required for revoke" }, 400);
        const { error } = await db
          .from("user_permissions")
          .delete()
          .eq("user_id", userId)
          .eq("permission", permission);
        if (error) throw error;
        return jsonResponse({ ok: true, action, userId, permission });
      }

      case "reject": {
        // Remove all non-rejected permissions first
        await db.from("user_permissions").delete().eq("user_id", userId);
        const { error } = await db.from("user_permissions").insert({
          user_id: userId,
          permission: "rejected",
          granted_by: identity.sub,
        });
        if (error) throw error;

        // Notification
        const { data: profile } = await db
          .from("profiles")
          .select("email, full_name")
          .eq("id", userId)
          .single();
        if (profile?.email) {
          await db.functions.invoke("send-notification-email", {
            body: {
              type: "user_rejected",
              userEmail: profile.email,
              userName: profile.full_name,
            },
          });
        }
        return jsonResponse({ ok: true, action, userId });
      }

      case "unreject": {
        const { error } = await db
          .from("user_permissions")
          .delete()
          .eq("user_id", userId)
          .eq("permission", "rejected");
        if (error) throw error;
        return jsonResponse({ ok: true, action, userId });
      }

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    return errorResponse(err);
  }
});
