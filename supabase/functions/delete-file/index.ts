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
 * DELETE /functions/v1/delete-file
 *
 * Body: { fileId: string } — single file
 *   OR  { fileIds: string[] } — bulk delete
 *
 * Requires admin role.
 */
serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const identity = await verifyClerkToken(req);
    const db = getServiceClient();

    await upsertProfile(identity, db);
    await assertAdmin(identity, db);

    const body = await req.json();
    const ids: string[] = body.fileIds ?? (body.fileId ? [body.fileId] : []);

    if (ids.length === 0) {
      return jsonResponse({ error: "No file IDs provided" }, 400);
    }

    // Fetch storage paths
    const { data: files, error: fetchError } = await db
      .from("files")
      .select("id, storage_path")
      .in("id", ids);

    if (fetchError) throw fetchError;

    const storagePaths = (files ?? []).map((f) => f.storage_path);

    // Remove from storage
    if (storagePaths.length > 0) {
      const { error: storageError } = await db.storage
        .from("text-files")
        .remove(storagePaths);
      if (storageError) throw storageError;
    }

    // Remove from DB
    const { error: dbError } = await db
      .from("files")
      .delete()
      .in("id", ids);

    if (dbError) throw dbError;

    return jsonResponse({ deleted: ids.length });
  } catch (err) {
    return errorResponse(err);
  }
});
