// PROTOTYPE — THROWAWAY. Do not merge to main. (wayfinder ticket #86)
//
// Synthetic stuck cases for `?demo=1`. The real Pipeline holds 8 Pieces and none
// of them currently trips a flag rule, so without these the flags render as an
// empty state. Fabricated: ids prefixed `proto-`, titles prefixed [DEMO].
// Nothing is written anywhere — these exist only for the render.
//
// Lives outside prototype-flow.tsx because that file is "use client" and the
// page is a Server Component (a client module's exports can't be called there).

import type { Piece } from "@/lib/pipeline";

export function demoPieces(today: string): Piece[] {
  const shift = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const base = {
    blocked_by_piece_id: null,
    artifact_url: null,
    linkedin_post_url: null,
    created_at: `${shift(-40)}T09:00:00Z`,
    updated_at: `${shift(-9)}T09:00:00Z`,
  };
  return [
    {
      ...base,
      id: "proto-overdue",
      title: "[DEMO] Why Your Threat Model Is a Wish List",
      channel: "blog",
      flag_side: "flag",
      state: "ready",
      publish_date: shift(-6),
      artifact_url: "https://github.com/davideimola/davideimola.dev/pull/999",
    },
    {
      ...base,
      id: "proto-missed",
      title: "[DEMO] The Tech Lead Who Stopped Reviewing Code",
      channel: "linkedin",
      flag_side: "side",
      state: "slotted",
      publish_date: shift(-3),
    },
    {
      ...base,
      id: "proto-empty-slot",
      title: "[DEMO] Supply Chain Security for People Who Ship on Friday",
      channel: "blog",
      flag_side: "flag",
      state: "slotted",
      publish_date: shift(4),
    },
    {
      ...base,
      id: "proto-unmeasurable",
      title: "[DEMO] What Argus Found in Its First Week",
      channel: "linkedin",
      flag_side: "flag",
      state: "published",
      publish_date: shift(-12),
      updated_at: `${shift(-12)}T09:00:00Z`,
    },
    {
      ...base,
      id: "proto-stale",
      title: "[DEMO] Nobody Reads Your Runbook",
      channel: "blog",
      flag_side: "side",
      state: "proposed",
      publish_date: null,
      updated_at: `${shift(-40)}T09:00:00Z`,
    },
  ];
}
