// capture-idea — the insert-only phone door onto the Pipeline (ADR-0014).
//
// Phone AI apps (a ChatGPT Custom GPT Action, MCP connectors) POST a raw Idea
// here; we forward the spark VERBATIM to the `capture_idea` Postgres RPC. That
// RPC is `security definer` and the only verb granted to the `anon` role, so a
// leaked token can insert one Idea and reach nothing else — least privilege by
// construction (docs/design/supabase-foundations.md).
//
// Trust model:
//   - This function authenticates callers itself, with a shared `CAPTURE_TOKEN`
//     header (deployed with --no-verify-jwt so Supabase's own JWT gate is off).
//   - It talks to the DB with the ANON key only. The service key must NEVER be
//     used here — that would defeat the whole point of the narrow door.

import { createClient } from "jsr:@supabase/supabase-js@2";

// Permissive CORS: a browser-based Custom GPT Action / preflight needs this.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-capture-token",
};

// Small JSON response helper — always carries the CORS headers.
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Constant-time string compare, so a wrong token can't be timed byte-by-byte.
// (The length short-circuit leaks only the length, which is not a secret.)
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  // CORS preflight.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // This door only inserts — nothing but POST is meaningful.
  if (req.method !== "POST") {
    return json({ ok: false, error: "method not allowed" }, 405);
  }

  try {
    // ── auth: our own shared-secret header (why we deploy --no-verify-jwt) ──
    const expected = Deno.env.get("CAPTURE_TOKEN");
    if (!expected) {
      // Misconfiguration, not the caller's fault — never a 401.
      return json({ ok: false, error: "server not configured" }, 500);
    }
    const presented = req.headers.get("x-capture-token") ?? "";
    if (!safeEqual(presented, expected)) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    // ── body: { spark, title?, source? } ──
    let payload: { spark?: unknown; title?: unknown; source?: unknown };
    try {
      payload = await req.json();
    } catch {
      return json({ ok: false, error: "invalid JSON body" }, 400);
    }

    // `spark` is the raw idea text and becomes p_body verbatim (no trimming of
    // the stored value); reject only when it is missing or blank.
    const spark = typeof payload.spark === "string" ? payload.spark : "";
    if (spark.trim().length === 0) {
      return json({ ok: false, error: "spark is required" }, 400);
    }
    const title = typeof payload.title === "string" ? payload.title : null;
    const source =
      typeof payload.source === "string" && payload.source.trim().length > 0
        ? payload.source
        : "app";

    // ── DB: anon key only, calling the single granted RPC ──
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );

    const { data, error } = await supabase.rpc("capture_idea", {
      p_body: spark,
      p_title: title,
      p_source: source,
    });

    if (error) {
      return json({ ok: false, error: error.message }, 502);
    }

    // `capture_idea` returns the inserted `ideas` row. PostgREST hands a single
    // composite back as an object; tolerate an array shape just in case.
    const row = Array.isArray(data) ? data[0] : data;
    const id = row?.id ?? null;

    return json({ ok: true, id });
  } catch (err) {
    // Last-resort catch — never leak a stack trace to the caller.
    const message = err instanceof Error ? err.message : "unexpected error";
    return json({ ok: false, error: message }, 500);
  }
});
