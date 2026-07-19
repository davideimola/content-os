// content-os MCP — the operations adapter for AI apps (ADR-0015).
//
// Grew out of the insert-only capture door: same narrow, hand-rolled JSON-RPC
// over Streamable HTTP, but now the SINGLE operations surface for the skills and
// any AI app (Claude, Perplexity, …). It is a THIN adapter — it exposes reads
// (over tables/views) and the write RPC verbs as tools, and holds no logic of
// its own, so its behaviour cannot drift from the Postgres contract
// (docs/design/supabase-foundations.md) — the tool input enums are a convenience
// mirror for the caller; the DB stays the validator. The front end talks to the
// same RPCs directly via PostgREST; this server is the door for MCP-only clients.
//
// Trust model (ADR-0015 — one server, one token, no gates; personal backlog):
//   - This function authenticates callers itself with the shared `CAPTURE_TOKEN`
//     secret (deployed with verify_jwt = false so Supabase's own JWT gate is off).
//   - It talks to the DB with the SERVICE_ROLE key, so it can call the privileged
//     verbs. The single token is the whole trust boundary — a leaked token can
//     edit one's own content Pipeline (reversible), which is the accepted risk.
//     The REST `capture-idea` function stays anon insert-only for REST clients.
//
// Why hand-rolled JSON-RPC and not the MCP SDK: the official SDK's Streamable
// HTTP transport is written against Node's `http` req/res objects and manages
// sessions, an awkward fit for Deno's fetch-style `Request`/`Response` and the
// ephemeral, stateless edge runtime. The MCP surface we need is tiny
// (initialize / initialized / tools/list / tools/call), so a minimal, stateless
// JSON-RPC 2.0 handler is more reliable and easier to debug.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// ── server identity ──────────────────────────────────────────────────────────
const SERVER_NAME = "content-os";
const SERVER_VERSION = "0.2.0";
// The newest protocol version we understand; we echo back the client's own
// requested version when it sends one, and fall back to this otherwise.
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

// ── the tools this server exposes ────────────────────────────────────────────
// Descriptions are the single source the calling LLM reads — keep them precise.
const CHANNEL_ENUM = ["blog", "linkedin"] as const;
const FLAG_SIDE_ENUM = ["flag", "side"] as const;

const IDEA_IDS_PROP = {
  type: "array",
  items: { type: "string" },
  description: "Optional source Idea ids to link (piece_sources / talk_sources).",
} as const;

const TOOLS = [
  {
    name: "capture_idea",
    description:
      "File a raw content idea onto the Pipeline; the spark is stored verbatim, no judgement.",
    inputSchema: {
      type: "object",
      properties: {
        spark: { type: "string", description: "The raw idea text, stored verbatim as the idea body." },
        title: { type: "string", description: "Optional short readable summary of the idea." },
        source: { type: "string", description: 'Optional origin tag; defaults to "app".' },
      },
      required: ["spark"],
      additionalProperties: false,
    },
  },
  {
    name: "list_ideas",
    description:
      "List the live Idea pool (status = live), oldest first. The raw material the Desk correlates into proposals.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_proposals",
    description:
      "List the current proposals awaiting a decision: Pieces and Talks in state 'proposed'. Each item carries its kind ('piece' | 'talk').",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_calendar",
    description:
      "List the scheduled Pieces on the Calendar (slotted / in_production / published, with a publish_date), earliest first.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "spawn_piece",
    description:
      "Create a 'proposed' Piece (a dated output on a cadence channel) and link its source Ideas, in one transaction.",
    inputSchema: {
      type: "object",
      properties: {
        channel: { type: "string", enum: [...CHANNEL_ENUM], description: "blog or linkedin." },
        flag_side: { type: "string", enum: [...FLAG_SIDE_ENUM], description: "flag or side (editorial mix)." },
        title: { type: "string", description: "The Piece title." },
        idea_ids: IDEA_IDS_PROP,
      },
      required: ["channel", "flag_side", "title"],
      additionalProperties: false,
    },
  },
  {
    name: "slot_piece",
    description: "Slot a Piece on the Calendar: set state = 'slotted' and its publish_date. Also reslots.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The Piece id." },
        publish_date: { type: "string", description: "Publish date, YYYY-MM-DD." },
      },
      required: ["id", "publish_date"],
      additionalProperties: false,
    },
  },
  {
    name: "deslot_piece",
    description: "Pull a Piece off the Calendar: back to state = 'proposed', publish_date cleared.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "The Piece id." } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "decline_piece",
    description: "Decline a proposed Piece: state = 'declined', kept on the record so it is not re-proposed.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "The Piece id." } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "spawn_talk",
    description:
      "Create a 'proposed' Talk (a dateless editorial object) and link its source Ideas, in one transaction.",
    inputSchema: {
      type: "object",
      properties: {
        flag_side: { type: "string", enum: [...FLAG_SIDE_ENUM], description: "flag or side (editorial mix)." },
        title: { type: "string", description: "The Talk title." },
        idea_ids: IDEA_IDS_PROP,
      },
      required: ["flag_side", "title"],
      additionalProperties: false,
    },
  },
  {
    name: "decline_talk",
    description: "Decline a proposed Talk: state = 'declined', kept on the record so it is not re-proposed.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "The Talk id." } },
      required: ["id"],
      additionalProperties: false,
    },
  },
] as const;

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

// ── DB access ────────────────────────────────────────────────────────────────
// The service_role key: this server is the trust boundary (the shared token),
// so it needs to call the privileged verbs. RLS is bypassed by design.
function db(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// ── MCP tool result helpers ──────────────────────────────────────────────────
// A tool FAILURE is reported inside a successful JSON-RPC result with
// `isError: true` (so the model sees the message), not as a JSON-RPC error.
function toolError(message: string) {
  return { content: [{ type: "text", text: message }], isError: true };
}

// A tool SUCCESS: a human/LLM-readable text plus a structured object. `text`
// carries the JSON payload too, so tools-only clients still see the data.
function toolOk(text: string, structured: Record<string, unknown>) {
  return { content: [{ type: "text", text }], structuredContent: structured, isError: false };
}

// PostgREST returns a single composite (a `returns <table>` RPC) as an object,
// but tolerate an array shape just in case.
function firstRow(data: unknown) {
  return Array.isArray(data) ? data[0] : data;
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

// ── tool handlers ────────────────────────────────────────────────────────────
async function callCaptureIdea(args: Record<string, unknown> | undefined) {
  const spark = typeof args?.spark === "string" ? args.spark : "";
  if (spark.trim().length === 0) {
    return toolError("spark is required and must be a non-empty string");
  }
  const title = typeof args?.title === "string" ? args.title : null;
  const source = typeof args?.source === "string" ? args.source : "";

  const { data, error } = await db().rpc("capture_idea", {
    p_body: spark,
    p_title: title ?? null,
    p_source: source || "app",
  });
  if (error) return toolError(`capture failed: ${error.message}`);
  const id = firstRow(data)?.id ?? null;
  return toolOk(
    id ? `Captured idea ${id}` : "Captured idea (id unavailable)",
    { id },
  );
}

async function listIdeas() {
  const { data, error } = await db()
    .from("ideas")
    .select("id,title,body,source,created_at")
    .eq("status", "live")
    .order("created_at", { ascending: true });
  if (error) return toolError(`list_ideas failed: ${error.message}`);
  return toolOk(JSON.stringify(data ?? []), { ideas: data ?? [] });
}

async function listProposals() {
  // Read the contracted untriaged_proposals view (single definition of "a
  // proposal", shared with the Beats) — no proposal logic in the adapter.
  const { data, error } = await db()
    .from("untriaged_proposals")
    .select("kind,id,title,channel,flag_side,created_at")
    .order("created_at", { ascending: true });
  if (error) return toolError(`list_proposals failed: ${error.message}`);
  return toolOk(JSON.stringify(data ?? []), { proposals: data ?? [] });
}

async function listCalendar() {
  // "On the Calendar" = actually scheduled, so exclude proposed/declined even if
  // a stale publish_date lingers. Matches the cadence_status view's state set.
  const { data, error } = await db()
    .from("pieces")
    .select("id,title,channel,flag_side,state,publish_date")
    .not("publish_date", "is", null)
    .in("state", ["slotted", "in_production", "published"])
    .order("publish_date", { ascending: true });
  if (error) return toolError(`list_calendar failed: ${error.message}`);
  return toolOk(JSON.stringify(data ?? []), { calendar: data ?? [] });
}

async function spawnPiece(args: Record<string, unknown> | undefined) {
  if (!nonEmptyString(args?.title)) return toolError("title is required");
  const idea_ids = Array.isArray(args?.idea_ids) ? args!.idea_ids : [];
  const { data, error } = await db().rpc("spawn_piece", {
    p_channel: args!.channel,
    p_flag_side: args!.flag_side,
    p_title: args!.title,
    p_idea_ids: idea_ids,
  });
  if (error) return toolError(`spawn_piece failed: ${error.message}`);
  const row = firstRow(data);
  return toolOk(`Spawned piece ${row?.id}`, { piece: row });
}

async function slotPiece(args: Record<string, unknown> | undefined) {
  if (!nonEmptyString(args?.id)) return toolError("id is required");
  if (!nonEmptyString(args?.publish_date)) return toolError("publish_date is required (YYYY-MM-DD)");
  const { data, error } = await db().rpc("slot_piece", {
    p_id: args!.id,
    p_publish_date: args!.publish_date,
  });
  if (error) return toolError(`slot_piece failed: ${error.message}`);
  const row = firstRow(data);
  return toolOk(`Slotted piece ${row?.id} on ${row?.publish_date}`, { piece: row });
}

// The id-only write verbs (deslot / decline) share one shape: validate the id,
// call the RPC, return the affected row. `key` is the result field and the noun;
// `past` is the past-tense verb for the message.
async function idVerb(
  rpc: string,
  args: Record<string, unknown> | undefined,
  key: "piece" | "talk",
  past: string,
) {
  if (!nonEmptyString(args?.id)) return toolError("id is required");
  const { data, error } = await db().rpc(rpc, { p_id: args!.id });
  if (error) return toolError(`${rpc} failed: ${error.message}`);
  const row = firstRow(data);
  return toolOk(`${past} ${key} ${row?.id}`, { [key]: row });
}

async function spawnTalk(args: Record<string, unknown> | undefined) {
  if (!nonEmptyString(args?.title)) return toolError("title is required");
  const idea_ids = Array.isArray(args?.idea_ids) ? args!.idea_ids : [];
  const { data, error } = await db().rpc("spawn_talk", {
    p_flag_side: args!.flag_side,
    p_title: args!.title,
    p_idea_ids: idea_ids,
  });
  if (error) return toolError(`spawn_talk failed: ${error.message}`);
  const row = firstRow(data);
  return toolOk(`Spawned talk ${row?.id}`, { talk: row });
}

// Route a tools/call to its handler. Unknown tool is a tool error, not a
// protocol error, so the caller's model still gets a readable message.
function callTool(name: unknown, args: Record<string, unknown> | undefined) {
  switch (name) {
    case "capture_idea": return callCaptureIdea(args);
    case "list_ideas": return listIdeas();
    case "list_proposals": return listProposals();
    case "list_calendar": return listCalendar();
    case "spawn_piece": return spawnPiece(args);
    case "slot_piece": return slotPiece(args);
    case "deslot_piece": return idVerb("deslot_piece", args, "piece", "Deslotted");
    case "decline_piece": return idVerb("decline_piece", args, "piece", "Declined");
    case "spawn_talk": return spawnTalk(args);
    case "decline_talk": return idVerb("decline_talk", args, "talk", "Declined");
    default: return Promise.resolve(toolError(`unknown tool: ${String(name)}`));
  }
}

// ── JSON-RPC 2.0 dispatch ────────────────────────────────────────────────────
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
        protocolVersion:
          typeof msg.params?.protocolVersion === "string"
            ? msg.params.protocolVersion
            : DEFAULT_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions:
          "The Content OS operations adapter. Read the Pipeline with list_ideas / " +
          "list_proposals / list_calendar; act with spawn_piece / slot_piece / " +
          "deslot_piece / decline_piece / spawn_talk / decline_talk; capture raw " +
          "sparks with capture_idea. Editorial judgement lives in the caller's skill, " +
          "not here.",
      });

    // MCP keep-alive.
    case "ping":
      return ok({});

    case "tools/list":
      return ok({ tools: TOOLS });

    case "tools/call": {
      const args = msg.params?.arguments as Record<string, unknown> | undefined;
      return ok(await callTool(msg.params?.name, args));
    }

    default:
      return err(METHOD_NOT_FOUND, `method not found: ${method}`);
  }
}

// ── Streamable HTTP transport ────────────────────────────────────────────────
// The spec lets the server answer a request either as one JSON object or as an
// SSE stream, and requires the client to support both. We negotiate on Accept:
// connectors send `text/event-stream` and get SSE; plain HTTP callers (curl,
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
