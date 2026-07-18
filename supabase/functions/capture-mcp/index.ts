// capture-mcp — the insert-only capture door, spoken as MCP (ADR-0014).
//
// The sibling of `capture-idea`: same narrow door, different protocol. Remote
// MCP connectors (Perplexity, Claude custom connectors) speak the Model Context
// Protocol over Streamable HTTP; this function exposes a SINGLE tool,
// `capture_idea`, that forwards the spark VERBATIM to the `capture_idea`
// Postgres RPC. That RPC is `security definer` and the only verb granted to the
// `anon` role, so a leaked token can insert one Idea and reach nothing else —
// least privilege by construction (docs/design/supabase-foundations.md).
//
// Trust model (identical to capture-idea):
//   - This function authenticates callers itself, with the shared `CAPTURE_TOKEN`
//     secret (deployed with verify_jwt = false so Supabase's own JWT gate is off).
//   - It talks to the DB with the ANON key only. The service key must NEVER be
//     referenced here — that would defeat the whole point of the narrow door.
//
// Why hand-rolled JSON-RPC and not the MCP SDK: the official SDK's Streamable
// HTTP transport is written against Node's `http` req/res objects and manages
// sessions, which is an awkward fit for Deno's fetch-style `Request`/`Response`
// and the ephemeral, stateless edge runtime. For a single insert-only tool the
// MCP surface is tiny (initialize / initialized / tools/list / tools/call), so a
// minimal, stateless JSON-RPC 2.0 handler is more reliable and easier to debug.

import { createClient } from "jsr:@supabase/supabase-js@2";

// ── server identity ──────────────────────────────────────────────────────────
const SERVER_NAME = "content-os-capture";
const SERVER_VERSION = "0.1.0";
// The newest protocol version we understand; we echo back the client's own
// requested version when it sends one, and fall back to this otherwise.
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

// ── the one tool this server exposes ─────────────────────────────────────────
const CAPTURE_TOOL = {
  name: "capture_idea",
  description:
    "File a raw content idea onto the Content OS pipeline; the spark is stored verbatim, no judgement.",
  inputSchema: {
    type: "object",
    properties: {
      spark: {
        type: "string",
        description: "The raw idea text, stored verbatim as the idea body.",
      },
      title: {
        type: "string",
        description: "Optional short readable summary of the idea.",
      },
      source: {
        type: "string",
        description: 'Optional origin tag; defaults to "app".',
      },
    },
    required: ["spark"],
    additionalProperties: false,
  },
} as const;

// Permissive CORS: remote connectors preflight from a browser/vendor cloud.
// `x-api-key` is Claude's header-auth path; `authorization` carries a Bearer
// token; the `mcp-*` headers are sent by spec-compliant Streamable HTTP clients.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "content-type, x-api-key, authorization, mcp-session-id, mcp-protocol-version",
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

// The shared secret can arrive on either header. `x-api-key` is primary because
// it is on Claude's request-header allowlist; Perplexity's "API Key" auth also
// lands here. `Authorization: Bearer <token>` is the fallback.
function presentedToken(req: Request): string {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey) return apiKey;
  const auth = req.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

// ── MCP tool result helpers ──────────────────────────────────────────────────
// A tool FAILURE is reported inside a successful JSON-RPC result with
// `isError: true` (so the model sees the message), not as a JSON-RPC error.
function toolError(message: string) {
  return { content: [{ type: "text", text: message }], isError: true };
}

// The actual work behind `tools/call` → `capture_idea`.
async function callCaptureIdea(args: Record<string, unknown> | undefined) {
  // `spark` is the raw idea text and becomes p_body verbatim (no trimming of the
  // stored value); reject only when it is missing or blank.
  const spark = typeof args?.spark === "string" ? args.spark : "";
  if (spark.trim().length === 0) {
    return toolError("spark is required and must be a non-empty string");
  }
  const title = typeof args?.title === "string" ? args.title : null;
  const source = typeof args?.source === "string" ? args.source : "";

  // DB: anon key only, calling the single granted RPC. The service key is never
  // referenced here.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );

  const { data, error } = await supabase.rpc("capture_idea", {
    p_body: spark,
    p_title: title ?? null,
    p_source: source || "app",
  });

  if (error) {
    return toolError(`capture failed: ${error.message}`);
  }

  // `capture_idea` returns the inserted `ideas` row. PostgREST hands a single
  // composite back as an object; tolerate an array shape just in case.
  const row = Array.isArray(data) ? data[0] : data;
  const id = row?.id ?? null;

  return {
    content: [
      {
        type: "text",
        text: id ? `Captured idea ${id}` : "Captured idea (id unavailable)",
      },
    ],
    structuredContent: { id },
    isError: false,
  };
}

// ── JSON-RPC 2.0 dispatch ────────────────────────────────────────────────────
// JSON-RPC error codes we use.
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INTERNAL_ERROR = -32603;

type JsonRpcMessage = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

// Handle a single JSON-RPC message. Returns the response object, or `null` for a
// notification (no `id`) which the spec says gets no reply.
async function handleMessage(msg: JsonRpcMessage): Promise<object | null> {
  // Notifications omit `id`; requests carry one (including 0). Anything without
  // an `id` gets no response — this covers `notifications/initialized` & friends.
  const isNotification = msg.id === undefined || msg.id === null;
  const id = msg.id ?? null;
  const method = msg.method ?? "";

  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const err = (code: number, message: string) => ({
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });

  // Notifications (e.g. notifications/initialized) are acknowledged silently.
  if (isNotification) return null;

  if (!msg.method || typeof msg.method !== "string") {
    return err(INVALID_REQUEST, "missing method");
  }

  switch (method) {
    case "initialize":
      return ok({
        // Speak the client's protocol version back when it offers one.
        protocolVersion:
          typeof msg.params?.protocolVersion === "string"
            ? msg.params.protocolVersion
            : DEFAULT_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions:
          "Use the capture_idea tool to file a raw content idea; the spark is stored verbatim, no judgement.",
      });

    // MCP keep-alive.
    case "ping":
      return ok({});

    case "tools/list":
      return ok({ tools: [CAPTURE_TOOL] });

    case "tools/call": {
      const name = msg.params?.name;
      if (name !== CAPTURE_TOOL.name) {
        // Unknown tool is surfaced as a tool error, not a protocol error, so the
        // caller's model still gets a readable message.
        return ok(toolError(`unknown tool: ${String(name)}`));
      }
      const args = msg.params?.arguments as Record<string, unknown> | undefined;
      return ok(await callCaptureIdea(args));
    }

    default:
      return err(METHOD_NOT_FOUND, `method not found: ${method}`);
  }
}

// ── Streamable HTTP transport ────────────────────────────────────────────────
// The client advertises what it accepts; the spec lets the server answer a
// request either as one JSON object or as an SSE stream, and requires the client
// to support both. We negotiate on Accept: connectors send `text/event-stream`
// and get SSE (the Streamable-HTTP-native framing); plain HTTP callers (curl,
// tests) asking for `application/json` get a single JSON object.
function wantsSse(accept: string): boolean {
  return accept.includes("text/event-stream");
}

// Render one or more JSON-RPC responses as an SSE body. Each response is its own
// `message` event; the stream ends after (this server pushes nothing further).
function sseBody(responses: object[]): string {
  return responses
    .map((r) => `event: message\ndata: ${JSON.stringify(r)}\n\n`)
    .join("");
}

Deno.serve(async (req) => {
  // CORS preflight.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // ── auth: our own shared-secret, on EVERY request, before any MCP handling ──
  const expected = Deno.env.get("CAPTURE_TOKEN");
  if (!expected) {
    // Misconfiguration, not the caller's fault — never a 401.
    return json({ error: "server not configured" }, 500);
  }
  if (!safeEqual(presentedToken(req), expected)) {
    return json({ error: "unauthorized" }, 401);
  }

  // We do not push server-initiated messages, so there is no GET SSE stream to
  // open; the spec permits answering GET with 405.
  if (req.method === "GET") {
    return json({ error: "method not allowed" }, 405);
  }

  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  // ── parse the JSON-RPC message (or batch array) ──
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return json(
      { jsonrpc: "2.0", id: null, error: { code: PARSE_ERROR, message: "invalid JSON body" } },
      400,
    );
  }

  try {
    const isBatch = Array.isArray(parsed);
    const messages = (isBatch ? parsed : [parsed]) as JsonRpcMessage[];

    // Process each message; notifications yield no response.
    const responses: object[] = [];
    for (const msg of messages) {
      const res = await handleMessage(msg);
      if (res !== null) responses.push(res);
    }

    // Input was solely notifications/responses → 202 Accepted, no body.
    if (responses.length === 0) {
      return new Response(null, { status: 202, headers: corsHeaders });
    }

    const accept = req.headers.get("accept") ?? "";
    if (wantsSse(accept)) {
      return new Response(sseBody(responses), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // JSON response: a single object for one message, an array for a batch.
    return json(isBatch ? responses : responses[0]);
  } catch (err) {
    // Last-resort catch — never leak a stack trace to the caller.
    const message = err instanceof Error ? err.message : "unexpected error";
    return json(
      { jsonrpc: "2.0", id: null, error: { code: INTERNAL_ERROR, message } },
      500,
    );
  }
});
