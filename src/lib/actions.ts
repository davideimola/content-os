"use server";

import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/supabase/server";

// Every write is a call to a defined RPC verb (ADR-0015/0016): the UI holds no
// persistence logic of its own and cannot become a second source of truth. These
// run server-side with the service_role key (never shipped to the browser).
export type ActionResult = { ok: true } | { ok: false; error: string };

async function callVerb(verb: string, params: Record<string, unknown>): Promise<ActionResult> {
  const { error } = await supabaseAdmin().rpc(verb, params);
  if (error) return { ok: false, error: error.message };
  // Revalidate the whole app: a write shows up across every view (the board, the
  // calendar, the overview counts), not just the page it was triggered from.
  revalidatePath("/", "layout");
  return { ok: true };
}

// slot_piece(p_id, p_publish_date): proposed/reslot -> slotted, put on the Calendar.
export async function slotPiece(id: string, publishDate: string): Promise<ActionResult> {
  if (!publishDate) return { ok: false, error: "A publish date is required to slot." };
  return callVerb("slot_piece", { p_id: id, p_publish_date: publishDate });
}

// deslot_piece(p_id): slotted -> proposed, pulled off the Calendar.
export async function deslotPiece(id: string): Promise<ActionResult> {
  return callVerb("deslot_piece", { p_id: id });
}

// decline_piece(p_id): keep the proposal on the record, off the Calendar.
export async function declinePiece(id: string): Promise<ActionResult> {
  return callVerb("decline_piece", { p_id: id });
}

// publish_piece(p_id): slotted -> published (the Piece is shipped, live). Guarded
// server-side to slotted-only; keeps its publish_date for the monthly Review.
export async function publishPiece(id: string): Promise<ActionResult> {
  return callVerb("publish_piece", { p_id: id });
}

// set_piece_artifact(p_id, p_url): point a Piece at its Factory draft (PR / MDX).
export async function setPieceArtifact(id: string, url: string): Promise<ActionResult> {
  if (!url.trim()) return { ok: false, error: "A URL is required." };
  return callVerb("set_piece_artifact", { p_id: id, p_url: url.trim() });
}

// decline_talk(p_id): keep the Talk proposal on the record.
export async function declineTalk(id: string): Promise<ActionResult> {
  return callVerb("decline_talk", { p_id: id });
}

// archive_idea(p_id, p_reason): archive a duplicate/repudiated Idea (reason required).
export async function archiveIdea(id: string, reason: string): Promise<ActionResult> {
  if (!reason.trim()) return { ok: false, error: "A reason is required to archive." };
  return callVerb("archive_idea", { p_id: id, p_reason: reason.trim() });
}

// ── free-text edits (ADR-0016 edit verbs) ────────────────────────────────────
// edit_idea(p_id, p_title, p_body): the summary title + the verbatim body.
export async function editIdea(id: string, title: string, body: string): Promise<ActionResult> {
  if (!body.trim()) return { ok: false, error: "The body cannot be empty." };
  return callVerb("edit_idea", { p_id: id, p_title: title, p_body: body });
}

// edit_piece(p_id, p_title): rename a Piece.
export async function editPiece(id: string, title: string): Promise<ActionResult> {
  if (!title.trim()) return { ok: false, error: "A title is required." };
  return callVerb("edit_piece", { p_id: id, p_title: title });
}

// edit_talk(p_id, p_title): rename a Talk.
export async function editTalk(id: string, title: string): Promise<ActionResult> {
  if (!title.trim()) return { ok: false, error: "A title is required." };
  return callVerb("edit_talk", { p_id: id, p_title: title });
}
