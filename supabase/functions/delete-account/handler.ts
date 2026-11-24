// Account deletion. The caller proves who they are with their own access token; the service-role client (injected by Supabase into the
// function's environment, never present in the app or this repository) deletes exactly that user. Foreign keys cascade every row.

export interface Admin {
  getUser(token: string): Promise<{ id: string } | null>;
  deleteUser(id: string): Promise<string | null>; // error message or null
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export function makeHandler(admin: Admin) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return json(405, { error: "method not allowed" });
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json(401, { error: "missing token" });
    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== true) return json(400, { error: "confirmation required" });
    const user = await admin.getUser(token);
    if (!user) return json(401, { error: "invalid token" });
    const err = await admin.deleteUser(user.id);
    if (err) return json(500, { error: "could not delete the account" });
    return json(200, { deleted: true });
  };
}
