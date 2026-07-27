// PROTOTYPE — THROWAWAY. Do not merge to main. (wayfinder ticket #104)
//
// The seven situations #104 lists, as data. Each is a shape the *decided*
// contract permits — not an invented case — so the timeline can be judged
// against what it will actually have to render.
//
// Fabricated: ids prefixed `case-`, nothing is written anywhere. Lives outside
// the client component so the Server Component page can build it.

import type { Piece } from "@/lib/pipeline";

// The fields #89 / #91 / #95 decided and #93 has not built yet. The flow is a
// *derived* view (#95 dec.1), so it can only be judged against the facts it
// derives from — which means the prototype must carry them.
export type ProtoPiece = Piece & {
  /** #89 dec.4 — the post copy, `linkedin` only. Its landing is the "written" fact. */
  body: string | null;
  /** #89 dec.3 / #95 dec.4 — the rendered asset, uploaded in the same gesture as the copy. */
  asset_name: string | null;
  /** #91 — smallint 0–23, `linkedin` only, required to slot. An instruction, not an instant. */
  publish_hour: number | null;
  /** #89 dec.9 — "I'll send this one myself". Keeps its date; the cron skips it. */
  manual: boolean;
  /** #95 dec.6 — from the append-only event log: when it entered `ready`. */
  ready_at: string | null;
  /** #96 — this Piece's month was never ingested, so its figures understate (#95 dec.5). */
  metrics_gap: boolean;

  // ── prototype-only, so the bench can name what it is showing ──
  caseKey: string;
  caseTitle: string;
  caseExpectation: string;
};

const COPY_LI = `𝐖𝐡𝐚𝐭 𝐀𝐫𝐠𝐮𝐬 𝐟𝐨𝐮𝐧𝐝 in its first week

Seven repos, 41 findings, and exactly one that mattered: a signing key sitting in a CI log (rotated within the hour).

The pattern nobody expects — the scary finding is never the CVE, it's the thing your pipeline prints on purpose.

Full write-up on the blog. Use speaker_10OFF at reactjsday if you want the long version in person.

#DevSecOps #OSDay26`;

const COPY_EARLY = `The scary finding is never the CVE — it's the thing your pipeline prints on purpose.

(Still working out where this one goes. Argus gave me three weeks of evidence and I only need one line of it.)

#DevSecOps`;

export function protoCases(today: string): ProtoPiece[] {
  const shift = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  const base = {
    blocked_by_piece_id: null,
    artifact_url: null,
    linkedin_post_url: null,
    body: null,
    asset_name: null,
    publish_hour: null,
    manual: false,
    ready_at: null,
    metrics_gap: false,
    created_at: `${shift(-18)}T09:12:00Z`,
    updated_at: `${shift(-1)}T18:40:00Z`,
  };

  return [
    {
      ...base,
      caseKey: "1",
      caseTitle: "blog ready — PR open, unmerged",
      caseExpectation: "the merge publishes it",
      id: "case-1-blog-ready",
      title: "Introducing Argus: a second pair of eyes on your supply chain",
      channel: "blog",
      flag_side: "flag",
      state: "ready",
      publish_date: shift(3),
      artifact_url: "https://github.com/davideimola/davideimola.dev/pull/214",
      ready_at: `${shift(-1)}T18:40:00Z`,
    },
    {
      ...base,
      caseKey: "2",
      caseTitle: "linkedin ready — copy + asset + hour, unflagged",
      caseExpectation: "goes out at 11:00 (the cron's own precondition set, #91)",
      id: "case-2-li-ready",
      title: "Argus week one — the finding that mattered",
      channel: "linkedin",
      flag_side: "flag",
      state: "ready",
      publish_date: shift(1),
      publish_hour: 11,
      body: COPY_LI,
      asset_name: "argus-week-1.png",
      ready_at: `${shift(0)}T07:05:00Z`,
    },
    {
      ...base,
      caseKey: "3",
      caseTitle: "linkedin ready — manual flag raised (#89 dec.9)",
      caseExpectation: "the cron will never fire; only the ship Beat pings",
      id: "case-3-li-manual",
      title: "Thanks to the OSDay crew — and the two people who found the bug",
      channel: "linkedin",
      flag_side: "side",
      state: "ready",
      publish_date: shift(2),
      publish_hour: 11,
      body: COPY_LI,
      asset_name: "osday-carousel.pdf",
      manual: true,
      ready_at: `${shift(0)}T21:18:00Z`,
    },
    {
      ...base,
      caseKey: "4",
      caseTitle: "linkedin slotted — dated and houred, no copy",
      caseExpectation: "nothing written yet",
      id: "case-4-li-slotted",
      title: "Why your threat model is a wish list",
      channel: "linkedin",
      flag_side: "flag",
      state: "slotted",
      publish_date: shift(5),
      publish_hour: 11,
    },
    {
      ...base,
      caseKey: "5",
      caseTitle: "proposed carrying the copy, no date (#89 dec.6)",
      caseExpectation: "legitimate — activation must NOT hide this",
      id: "case-5-proposed-copy",
      title: "The finding your pipeline prints on purpose",
      channel: "linkedin",
      flag_side: "flag",
      state: "proposed",
      publish_date: null,
      body: COPY_EARLY,
    },
    {
      ...base,
      caseKey: "6",
      caseTitle: "proposed, bare",
      caseExpectation: "must render NOTHING — and look deliberate, not broken",
      id: "case-6-proposed-bare",
      title: "Something about reviewing other people's Dockerfiles",
      channel: "linkedin",
      flag_side: "side",
      state: "proposed",
      publish_date: null,
      created_at: `${shift(-4)}T11:30:00Z`,
      updated_at: `${shift(-4)}T11:30:00Z`,
    },
    {
      ...base,
      caseKey: "7",
      caseTitle: "published — only what is observable",
      caseExpectation: "the date, and the manual flag where raised. Numbers stay in metrics.",
      id: "case-7-published",
      title: "GoLab recap: three talks I'm still thinking about",
      channel: "linkedin",
      flag_side: "side",
      state: "published",
      publish_date: shift(-9),
      publish_hour: 11,
      body: COPY_LI,
      asset_name: "golab-recap.png",
      manual: true,
      linkedin_post_url:
        "https://www.linkedin.com/feed/update/urn:li:activity:7472570052525854722/",
      ready_at: `${shift(-10)}T20:02:00Z`,
      metrics_gap: true,
    },
  ];
}

// Widen a *real* Piece to the decided shape, for the density question (#104's
// "all cards vs kanban"). Everything #93 has not built yet is honestly `null`,
// so the flow suppresses exactly where the data is genuinely absent today —
// which is the whole point of seeing this over the live Pipeline rather than
// over seven hand-picked cases.
export function widenPiece(p: Piece): ProtoPiece {
  return {
    ...p,
    body: null,
    asset_name: null,
    publish_hour: null,
    manual: false,
    ready_at: null,
    metrics_gap: false,
    caseKey: "live",
    caseTitle: "live Pipeline",
    caseExpectation: "",
  };
}

// The ticket's first open question: `declined` sits off the four-rung route.
// Two shapes, because they are not the same question:
//   d1 — declined straight out of `proposed`: no production facts at all
//   d2 — declined *after* the copy landed: facts exist, and the ladder had got
//        somewhere the contract does not record
export function protoDeclinedCases(today: string): ProtoPiece[] {
  const all = protoCases(today);
  const shift = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const copyCase = all.find((c) => c.caseKey === "3");
  if (!copyCase) throw new Error("case 3 missing");

  return [
    {
      ...all[5],
      caseKey: "d1",
      caseTitle: "declined out of proposed — no facts",
      caseExpectation: "does the question even arise here?",
      id: "case-d1-declined-bare",
      title: "A post about semantic versioning, probably",
      state: "declined",
    },
    {
      ...copyCase,
      caseKey: "d2",
      caseTitle: "declined after the copy landed — facts exist",
      caseExpectation: "it had got somewhere; the contract does not record where",
      id: "case-d2-declined-written",
      title: "The Kubernetes take I decided not to publish",
      state: "declined",
      publish_date: null,
      publish_hour: null,
      manual: false,
      updated_at: `${shift(-2)}T16:20:00Z`,
    },
  ];
}
