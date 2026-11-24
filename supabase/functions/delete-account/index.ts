import { createClient } from "jsr:@supabase/supabase-js@2";
import { makeHandler } from "./handler.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(
  makeHandler({
    async getUser(token) {
      const { data, error } = await admin.auth.getUser(token);
      return error || !data.user ? null : { id: data.user.id };
    },
    async deleteUser(id) {
      const { error } = await admin.auth.admin.deleteUser(id);
      return error ? error.message : null;
    },
  }),
);
