import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v4.15.5/index.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ClerkIdentity {
  sub: string;   // Clerk user ID, e.g. "user_2abc..."
  email: string;
}

// ---------------------------------------------------------------------------
// JWT verification
// ---------------------------------------------------------------------------
const JWKS_URL = Deno.env.get("CLERK_JWKS_URL") ?? "";

let cachedJwks: jose.RemoteJWKSet | null = null;

function getJwks(): jose.RemoteJWKSet {
  if (!cachedJwks) {
    cachedJwks = jose.createRemoteJWKSet(new URL(JWKS_URL));
  }
  return cachedJwks;
}

/**
 * Verifies the Clerk JWT from an Authorization header.
 * Returns the extracted identity on success, throws a Response on failure.
 */
export async function verifyClerkToken(req: Request): Promise<ClerkIdentity> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response(
      JSON.stringify({ error: "Missing or malformed Authorization header" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    const { payload } = await jose.jwtVerify(token, getJwks(), {
      // Clerk sets the issuer to your frontend API URL
      // We skip strict issuer check here to avoid config drift; expiry is checked.
    });

    const sub = payload.sub;
    const email =
      (payload["email"] as string) ??
      (payload["email_address"] as string) ??
      "";

    if (!sub) {
      throw new Error("No sub claim in token");
    }

    return { sub, email };
  } catch (err: any) {
    throw new Response(
      JSON.stringify({ error: "Invalid or expired token", detail: err?.message }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
}

// ---------------------------------------------------------------------------
// Supabase admin client (service role — bypasses RLS)
// ---------------------------------------------------------------------------
export function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ---------------------------------------------------------------------------
// Profile upsert — called on every authenticated request
// ---------------------------------------------------------------------------
export async function upsertProfile(
  identity: ClerkIdentity,
  db: ReturnType<typeof getServiceClient>
): Promise<void> {
  const { error } = await db.from("profiles").upsert(
    { id: identity.sub, email: identity.email, last_active_at: new Date().toISOString() },
    { onConflict: "id", ignoreDuplicates: false }
  );
  if (error) {
    console.error("upsertProfile error:", error);
  }
}

// ---------------------------------------------------------------------------
// Admin check helper
// ---------------------------------------------------------------------------
export async function assertAdmin(
  identity: ClerkIdentity,
  db: ReturnType<typeof getServiceClient>
): Promise<void> {
  const { data } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", identity.sub)
    .eq("role", "admin")
    .maybeSingle();

  if (!data) {
    throw new Response(
      JSON.stringify({ error: "Admin access required" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }
}

// ---------------------------------------------------------------------------
// Shared CORS headers
// ---------------------------------------------------------------------------
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorResponse(err: unknown): Response {
  // If we threw a pre-built Response (from verifyClerkToken / assertAdmin), pass through
  if (err instanceof Response) {
    // Re-attach CORS headers
    const clone = err.clone();
    const headers = new Headers(clone.headers);
    for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
    return new Response(clone.body, { status: clone.status, headers });
  }
  console.error("Unhandled error:", err);
  return jsonResponse(
    { error: err instanceof Error ? err.message : "Internal server error" },
    500
  );
}
