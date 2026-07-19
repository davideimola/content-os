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
import { parse as parseCsv } from "jsr:@std/csv/parse";

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
  {
    name: "archive_idea",
    description:
      "Archive an Idea (reversible) — a duplicate or a repudiated spark. Removes it from the live pool; never deletes.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The Idea id." },
        reason: { type: "string", description: "Why it is archived (duplicate / repudiated)." },
        duplicate_of: { type: "string", description: "Optional id of the Idea this one duplicates." },
      },
      required: ["id", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "block_piece",
    description:
      "Record that one Piece is blocked by another (e.g. a LinkedIn amplifier blocked by the blog it sneak-peeks).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The blocked Piece (e.g. the LinkedIn amplifier)." },
        blocked_by: { type: "string", description: "The blocking Piece (e.g. the blog)." },
      },
      required: ["id", "blocked_by"],
      additionalProperties: false,
    },
  },
  {
    name: "set_piece_artifact",
    description: "Set a Piece's artifact_url — the pointer to its Factory draft (PR / MDX).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The Piece id." },
        url: { type: "string", description: "The Factory draft URL." },
      },
      required: ["id", "url"],
      additionalProperties: false,
    },
  },
  {
    name: "ingest_linkedin_metrics",
    description:
      "Ingest a LinkedIn per-post export CSV for a month (replaces that month's posts). The CSV needs columns date, post_url, impressions, reactions, comments, reshares (any order; extras ignored).",
    inputSchema: {
      type: "object",
      properties: {
        month: { type: "string", description: "Snapshot month as YYYY-MM." },
        csv_text: { type: "string", description: "The raw LinkedIn per-post export CSV text." },
      },
      required: ["month", "csv_text"],
      additionalProperties: false,
    },
  },
  {
    name: "record_site_metrics",
    description: "Record a month's site numbers (upsert). At least one of visitors / page_views.",
    inputSchema: {
      type: "object",
      properties: {
        month: { type: "string", description: "Snapshot month as YYYY-MM." },
        visitors: { type: "integer", description: "Unique visitors for the month." },
        page_views: { type: "integer", description: "Page views for the month." },
      },
      required: ["month"],
      additionalProperties: false,
    },
  },
  {
    name: "flag_mix",
    description: "Flag vs Side counts over Pieces + Talks (the ~70% Flag target).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "cadence_status",
    description: "Cadence floor coverage: this week's LinkedIn slot and this month's blog (Pieces).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_metrics",
    description: "A month's ingested LinkedIn per-post metrics plus its site numbers.",
    inputSchema: {
      type: "object",
      properties: { month: { type: "string", description: "Month as YYYY-MM." } },
      required: ["month"],
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

async function archiveIdea(args: Record<string, unknown> | undefined) {
  if (!nonEmptyString(args?.id)) return toolError("id is required");
  if (!nonEmptyString(args?.reason)) return toolError("reason is required");
  const duplicateOf = typeof args?.duplicate_of === "string" ? args.duplicate_of : null;
  const { data, error } = await db().rpc("archive_idea", {
    p_id: args!.id,
    p_reason: args!.reason,
    p_duplicate_of: duplicateOf,
  });
  if (error) return toolError(`archive_idea failed: ${error.message}`);
  const row = firstRow(data);
  return toolOk(`Archived idea ${row?.id}`, { idea: row });
}

async function blockPiece(args: Record<string, unknown> | undefined) {
  if (!nonEmptyString(args?.id)) return toolError("id is required");
  if (!nonEmptyString(args?.blocked_by)) return toolError("blocked_by is required");
  const { data, error } = await db().rpc("block_piece", {
    p_blocked_id: args!.id,
    p_blocker_id: args!.blocked_by,
  });
  if (error) return toolError(`block_piece failed: ${error.message}`);
  const row = firstRow(data);
  return toolOk(`Blocked piece ${row?.id} by ${row?.blocked_by_piece_id}`, { piece: row });
}

async function setPieceArtifact(args: Record<string, unknown> | undefined) {
  if (!nonEmptyString(args?.id)) return toolError("id is required");
  if (!nonEmptyString(args?.url)) return toolError("url is required");
  const { data, error } = await db().rpc("set_piece_artifact", {
    p_id: args!.id,
    p_url: args!.url,
  });
  if (error) return toolError(`set_piece_artifact failed: ${error.message}`);
  const row = firstRow(data);
  return toolOk(`Set artifact on piece ${row?.id}`, { piece: row });
}

// ── metrics: deterministic LinkedIn CSV parse (ported from internal/metrics) ──
const LINKEDIN_COLUMNS = ["date", "post_url", "impressions", "reactions", "comments", "reshares"];

// "YYYY-MM" -> "YYYY-MM-01" (a real month first-day), or null if malformed.
function monthToFirstDay(m: unknown): string | null {
  if (typeof m !== "string") return null;
  const match = m.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const mm = Number(match[2]);
  if (mm < 1 || mm > 12) return null;
  return `${m}-01`;
}

function isYmd(s: string): boolean {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function parseCount(s: string): number | null {
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  return n < 0 ? null : n;
}

// Header-matched columns in any order (extras ignored); strict YYYY-MM-DD dates
// and non-negative integer counts; maps the export's `reshares` to the DB
// `shares`. Returns validated rows for ingest_linkedin_metrics, or a message.
function parseLinkedInCsv(text: string): { rows: Record<string, unknown>[] } | { error: string } {
  let records: string[][];
  try {
    records = parseCsv(text, { trimLeadingSpace: true }) as string[][];
  } catch (e) {
    return { error: `could not read the CSV: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (records.length === 0) return { error: "the CSV is empty (no header row)" };

  const idx: Record<string, number> = {};
  const seen = new Set<string>();
  records[0].forEach((name, i) => {
    const key = name.trim().toLowerCase();
    if (key === "") return;
    if (seen.has(key)) return; // duplicate flagged below
    seen.add(key);
    idx[key] = i;
  });
  for (const name of records[0]) {
    const key = name.trim().toLowerCase();
    if (key !== "" && records[0].filter((n) => n.trim().toLowerCase() === key).length > 1) {
      return { error: `duplicate column "${key}" in the header` };
    }
  }
  for (const col of LINKEDIN_COLUMNS) {
    if (!(col in idx)) {
      return { error: `missing required column "${col}" (need: ${LINKEDIN_COLUMNS.join(", ")})` };
    }
  }

  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < records.length; i++) {
    const rec = records[i];
    const line = i + 1;
    const field = (col: string) => (rec[idx[col]] ?? "").trim();

    const date = field("date");
    if (!isYmd(date)) return { error: `row ${line}: date "${date}" is not a valid YYYY-MM-DD date` };
    const url = field("post_url");
    if (url === "") return { error: `row ${line}: post_url is empty` };

    const counts: Record<string, number> = {};
    for (const col of ["impressions", "reactions", "comments", "reshares"]) {
      const n = parseCount(field(col));
      if (n === null) return { error: `row ${line}: ${col} "${field(col)}" is not a non-negative integer` };
      counts[col] = n;
    }
    rows.push({
      posted_on: date,
      post_url: url,
      impressions: counts.impressions,
      reactions: counts.reactions,
      comments: counts.comments,
      shares: counts.reshares, // export `reshares` -> DB `shares`
    });
  }
  return { rows };
}

async function ingestLinkedinMetrics(args: Record<string, unknown> | undefined) {
  const month = monthToFirstDay(args?.month);
  if (!month) return toolError("month is required as YYYY-MM");
  if (!nonEmptyString(args?.csv_text)) return toolError("csv_text is required");
  const parsed = parseLinkedInCsv(args!.csv_text as string);
  if ("error" in parsed) return toolError(parsed.error);
  const { data, error } = await db().rpc("ingest_linkedin_metrics", { p_month: month, p_rows: parsed.rows });
  if (error) return toolError(`ingest_linkedin_metrics failed: ${error.message}`);
  const inserted = typeof data === "number" ? data : firstRow(data);
  return toolOk(`Ingested ${inserted} LinkedIn post(s) for ${args!.month}`, { month, inserted });
}

async function recordSiteMetrics(args: Record<string, unknown> | undefined) {
  const month = monthToFirstDay(args?.month);
  if (!month) return toolError("month is required as YYYY-MM");
  const visitors = Number.isInteger(args?.visitors) ? (args!.visitors as number) : null;
  const pageViews = Number.isInteger(args?.page_views) ? (args!.page_views as number) : null;
  if (visitors === null && pageViews === null) {
    return toolError("at least one of visitors / page_views is required");
  }
  const { data, error } = await db().rpc("record_site_metrics", {
    p_month: month,
    p_visitors: visitors,
    p_page_views: pageViews,
  });
  if (error) return toolError(`record_site_metrics failed: ${error.message}`);
  return toolOk(`Recorded site metrics for ${args!.month}`, { site: firstRow(data) });
}

async function flagMix() {
  const { data, error } = await db().from("flag_mix").select("*").single();
  if (error) return toolError(`flag_mix failed: ${error.message}`);
  return toolOk(JSON.stringify(data), { flag_mix: data });
}

async function cadenceStatus() {
  const { data, error } = await db().from("cadence_status").select("*").single();
  if (error) return toolError(`cadence_status failed: ${error.message}`);
  return toolOk(JSON.stringify(data), { cadence_status: data });
}

async function getMetrics(args: Record<string, unknown> | undefined) {
  const month = monthToFirstDay(args?.month);
  if (!month) return toolError("month is required as YYYY-MM");
  const client = db();
  const [posts, site] = await Promise.all([
    client.from("metrics_linkedin_posts")
      .select("posted_on,post_url,impressions,reactions,comments,shares,clicks,piece_id")
      .eq("month", month).order("posted_on", { ascending: true }),
    client.from("metrics_site").select("month,visitors,page_views").eq("month", month).maybeSingle(),
  ]);
  if (posts.error) return toolError(`get_metrics failed: ${posts.error.message}`);
  if (site.error) return toolError(`get_metrics failed: ${site.error.message}`);
  const payload = { linkedin: posts.data ?? [], site: site.data };
  return toolOk(JSON.stringify(payload), payload);
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
    case "archive_idea": return archiveIdea(args);
    case "block_piece": return blockPiece(args);
    case "set_piece_artifact": return setPieceArtifact(args);
    case "ingest_linkedin_metrics": return ingestLinkedinMetrics(args);
    case "record_site_metrics": return recordSiteMetrics(args);
    case "flag_mix": return flagMix();
    case "cadence_status": return cadenceStatus();
    case "get_metrics": return getMetrics(args);
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
