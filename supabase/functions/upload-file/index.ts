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
 * POST /functions/v1/upload-file
 *
 * Body (multipart or JSON):
 *   - file: binary content
 *   - name: original filename
 *   - mimeType: MIME type string (optional, defaults to text/plain)
 *
 * Requires upload_files permission or admin role.
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
    const canUpload = isAdmin || permissions.includes("upload_files");

    if (!canUpload) {
      return jsonResponse({ error: "Insufficient permissions" }, 403);
    }

    const contentType = req.headers.get("content-type") ?? "";
    let fileName: string;
    let fileContent: Uint8Array;
    let mimeType = "text/plain";
    let textContent = "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const fileField = form.get("file") as File | null;
      if (!fileField) {
        return jsonResponse({ error: "No file field in form data" }, 400);
      }
      fileName = (form.get("name") as string | null) ?? fileField.name;
      mimeType = fileField.type || mimeType;
      fileContent = new Uint8Array(await fileField.arrayBuffer());
      textContent = new TextDecoder().decode(fileContent);
    } else {
      // JSON body: { name, content, mimeType }
      const body = await req.json();
      fileName = body.name;
      textContent = body.content ?? "";
      mimeType = body.mimeType ?? mimeType;
      fileContent = new TextEncoder().encode(textContent);
    }

    const storagePath = `${identity.sub}/${Date.now()}-${fileName}`;

    // Upload to storage
    const { error: storageError } = await db.storage
      .from("text-files")
      .upload(storagePath, fileContent, { contentType: mimeType });

    if (storageError) throw storageError;

    // Insert DB record
    const { data, error: dbError } = await db.from("files").insert({
      name: fileName,
      storage_path: storagePath,
      content: textContent,
      uploader_id: identity.sub,
      file_size: fileContent.byteLength,
      mime_type: mimeType,
    }).select().single();

    if (dbError) throw dbError;

    return jsonResponse({ file: data }, 201);
  } catch (err) {
    return errorResponse(err);
  }
});
