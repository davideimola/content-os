import "server-only";

import { createClient } from "@supabase/supabase-js";

// The Pipeline's source of truth is Supabase (ADR-0014). This app is a *client* of
// that source, twin to the MCP adapter (ADR-0015): it reads freely and writes ONLY
// through the RPC contract. It never becomes a second source of truth (ADR-0016,
// which amends ADR-0002).
//
// The service_role key bypasses RLS, so it must NEVER reach the browser. `server-only`
// makes any accidental client import a build error; every caller of this module must
// be a Server Component or Server Action.
const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.local / ADR-0016)."
  );
}

// A fresh client per call is fine on the server; no session persistence needed.
export function supabaseAdmin() {
  return createClient(url as string, serviceRoleKey as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
