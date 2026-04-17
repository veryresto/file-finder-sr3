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
 * GET /functions/v1/list-files
 *
 * Returns all files with uploader profile info.
 * Requires read_files permission or admin role.
 */
serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const identity = await verifyClerkToken(req);
    const db = getServiceClient();

    await upsertProfile(identity, db);

    // Check permission
    const [rolesResult, permsResult] = await Promise.all([
      db.from("user_roles").select("role").eq("user_id", identity.sub).eq("role", "admin").maybeSingle(),
      db.from("user_permissions").select("permission").eq("user_id", identity.sub),
    ]);

    const isAdmin = !!rolesResult.data;
    const permissions = permsResult.data?.map((p) => p.permission) ?? [];
    const canRead = isAdmin || permissions.includes("read_files");

    if (!canRead) {
      return jsonResponse({ error: "Insufficient permissions" }, 403);
    }

    const { data, error } = await db
      .from("files")
      .select(`
        id,
        name,
        storage_path,
        content,
        file_size,
        created_at,
        uploader_id,
        profiles (
          email,
          full_name,
          avatar_url
        )
      `)
      .order("name", { ascending: false });

    if (error) throw error;

    return jsonResponse({ files: data });
  } catch (err) {
    return errorResponse(err);
  }
});
