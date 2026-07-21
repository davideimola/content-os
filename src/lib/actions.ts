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
  revalidatePath("/");
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
