"use client";

// The Engagement tier's detail drawers — the tier had none anywhere in the console,
// so a row for an Event or a CFP deadline had nothing to open (#111).
//
// `CfpDetail` is where a submission's **outcome** is recorded (#119): it is the drawer
// every submission row opens, on the Talks sheet and on the Calendar alike, so the one
// fact has one place it is set. `EventDetail` stays read-only — an Event's own details
// have no edit verb, deliberately (#114).
//
// Each takes a **required** `trigger` (the shared opener contract, `DetailTrigger`):
// unlike a Piece / Idea / Talk, an Event and a CFP have no canonical card in the
// console, so there is no default opener to fall back to — the caller always brings
// its own row.

import { CalendarClock, CalendarOff, Link2, MapPin, Mic } from "lucide-react";
import { useState, useTransition } from "react";

import { CopyId } from "@/components/copy-id";
import { DetailSheet, type DetailTrigger } from "@/components/detail/detail-sheet";
import { formatDate, OutcomeBadge, StateBadge } from "@/components/pipeline";
import { Button } from "@/components/ui/button";
import { setEngagementOutcome } from "@/lib/actions";
import type { EngagementOutcome, EngagementTalk, EventRecord } from "@/lib/pipeline";
import type { CfpSubmission } from "@/lib/rows";

// The Calendar's spine is a date: a CFP with no deadline and an Event with no start
// date are simply not dated facts, so they never reach the by-date view. Say both
// halves — that it has none, and what that costs — wherever one shows.
function MissingDateNote({ kind }: { kind: "deadline" | "date" }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
      <CalendarOff aria-hidden className="mt-px size-3.5 shrink-0" />
      <span>No {kind} — which is why it does not appear on the Calendar.</span>
    </p>
  );
}

function ReadOnlyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground border-t pt-4 text-xs">{children}</p>;
}

// A `cfp` submission's four outcomes, in the order it moves through them. The verb has
// **no transition guard** on purpose (#114): an outcome records a decision made outside
// the system, so a mis-tapped `rejected` has to be repairable and a conference moving a
// talk off its waitlist is not a contract violation. So every value is offered, and the
// current one is the one that reads as pressed. `confirmed` is absent because it is the
// `direct` kind's only legal outcome and this drawer only ever holds a `cfp`
// (`cfpSubmission` filters on the kind) — the verb refuses the pair anyway.
const CFP_OUTCOMES: EngagementOutcome[] = ["to_submit", "submitted", "accepted", "rejected"];

function OutcomeControl({ id, current }: { id: string; current: EngagementOutcome }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {CFP_OUTCOMES.map((outcome) => (
          // The current value stays focusable rather than being disabled: disabling it
          // takes it out of the tab order, so a keyboard or screen-reader user tabs the
          // group and never meets the state they are in. Pressing it is a no-op instead —
          // it would write the value it already has and bump `updated_at` for nothing.
          <Button
            key={outcome}
            size="xs"
            variant={outcome === current ? "default" : "outline"}
            aria-pressed={outcome === current}
            disabled={pending}
            onClick={() => {
              if (outcome === current) return;
              setError(null);
              startTransition(async () => {
                const res = await setEngagementOutcome(id, outcome);
                if (!res.ok) setError(res.error);
              });
            }}
          >
            {outcome.replace("_", " ")}
          </Button>
        ))}
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

// One Talk taken to an Event: its own readiness (the answer to "are the slides
// done?") beside the submission's outcome, which is a different fact.
function TalkLine({ talk }: { talk: EngagementTalk }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <Mic aria-hidden className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
        <span className="flex-1 text-sm leading-snug font-medium text-pretty">
          {talk.talkTitle}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pl-5">
        <StateBadge state={talk.talkState} />
        <OutcomeBadge outcome={talk.outcome} />
        {/* The submission's deadline, or the bare fact that it has none — the full
            "and that is why it is not on the Calendar" belongs in the CFP's own
            drawer, not stamped on every line of an Event that *is* on the Calendar. */}
        {talk.deadline ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            deadline {formatDate(talk.deadline)}
          </span>
        ) : (
          <span className="text-xs text-amber-600 dark:text-amber-400">no deadline</span>
        )}
      </div>
    </div>
  );
}

// An Event's drawer: the conference itself, plus every Talk taken to it with that
// Talk's own readiness — a conference in three weeks with nothing written says so.
export function EventDetail({
  event,
  talks,
  trigger,
}: {
  event: EventRecord;
  talks: EngagementTalk[];
  trigger: DetailTrigger;
}) {
  const [open, setOpen] = useState(false);
  const ends = event.ends_on && event.ends_on !== event.starts_on ? event.ends_on : null;

  return (
    <>
      {trigger(() => setOpen(true))}

      <DetailSheet open={open} onOpenChange={setOpen} title={event.name} description="Event">
        <div className="flex">
          <CopyId id={event.id} />
        </div>

        <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Dates</dt>
          <dd>
            {formatDate(event.starts_on) ?? (
              <span className="text-muted-foreground italic">none</span>
            )}
            {ends ? ` → ${formatDate(ends)}` : ""}
          </dd>
          <dt className="text-muted-foreground">Where</dt>
          <dd>
            {event.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden className="size-3.5 shrink-0" />
                {event.location}
              </span>
            ) : (
              <span className="text-muted-foreground italic">not recorded</span>
            )}
          </dd>
          {event.roles.length > 0 ? (
            <>
              <dt className="text-muted-foreground">Roles</dt>
              <dd>{event.roles.join(" · ")}</dd>
            </>
          ) : null}
          {event.url ? (
            <>
              <dt className="text-muted-foreground">Link</dt>
              <dd>
                <a
                  href={event.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary inline-flex items-center gap-1 break-all underline underline-offset-2"
                >
                  <Link2 aria-hidden className="size-3.5 shrink-0" />
                  {event.url}
                </a>
              </dd>
            </>
          ) : null}
        </dl>

        {event.starts_on ? null : <MissingDateNote kind="date" />}

        <div className="flex flex-col gap-2 border-t pt-4">
          <p className="text-sm font-medium">Talks here</p>
          {talks.length === 0 ? (
            <p className="text-muted-foreground text-xs">Nothing submitted to this Event.</p>
          ) : (
            talks.map((t) => <TalkLine key={t.engagementId} talk={t} />)
          )}
        </div>

        <ReadOnlyNote>
          An Event's own details are not editable from the console — no verb edits one. A
          submission's outcome is set in its own drawer, and a Talk's readiness in the Talk's.
        </ReadOnlyNote>
      </DetailSheet>
    </>
  );
}

// A CFP submission's drawer: one Talk taken to one conference — its deadline, its
// outcome, its Talk's readiness and the CFP link. Takes the whole submission, since
// the Engagement alone says nothing about which conference or Talk it is.
export function CfpDetail({
  submission,
  trigger,
}: {
  submission: CfpSubmission;
  trigger: DetailTrigger;
}) {
  const { engagement, event, talk } = submission;
  const [open, setOpen] = useState(false);

  return (
    <>
      {trigger(() => setOpen(true))}

      <DetailSheet
        open={open}
        onOpenChange={setOpen}
        title={talk?.talkTitle ?? "CFP"}
        description={event ? `CFP · ${event.name}` : "CFP"}
      >
        <div className="flex">
          <CopyId id={engagement.id} />
        </div>

        <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Deadline</dt>
          <dd>
            {engagement.deadline ? (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <CalendarClock aria-hidden className="size-3.5 shrink-0" />
                {formatDate(engagement.deadline)}
              </span>
            ) : (
              <span className="text-muted-foreground italic">none</span>
            )}
          </dd>
          <dt className="text-muted-foreground">Outcome</dt>
          <dd>
            <OutcomeBadge outcome={engagement.outcome} />
          </dd>
          <dt className="text-muted-foreground">Talk</dt>
          <dd>
            {talk ? (
              <StateBadge state={talk.talkState} />
            ) : (
              <span className="text-muted-foreground italic">not found</span>
            )}
          </dd>
          {event ? (
            <>
              <dt className="text-muted-foreground">Event</dt>
              <dd className="flex flex-col items-start gap-1">
                <span className="leading-snug text-pretty">{event.name}</span>
                <span className="text-muted-foreground text-xs">
                  {formatDate(event.starts_on) ?? "no date"}
                  {event.location ? ` · ${event.location}` : ""}
                </span>
              </dd>
            </>
          ) : null}
          {engagement.cfp_link ? (
            <>
              <dt className="text-muted-foreground">CFP</dt>
              <dd>
                <a
                  href={engagement.cfp_link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary inline-flex items-center gap-1 break-all underline underline-offset-2"
                >
                  <Link2 aria-hidden className="size-3.5 shrink-0" />
                  {engagement.cfp_link}
                </a>
              </dd>
            </>
          ) : null}
        </dl>

        {/* Why this submission cannot be found on the Calendar — and, honestly, that it
            cannot be fixed from here. The contract can give a deadline only at creation:
            there is no `set_engagement_deadline` / `edit_engagement` verb (a gap reported
            with #114 and felt here), and inventing one with a raw table write would put
            the console outside the contract it exists to be a client of. */}
        {engagement.deadline ? null : (
          <div className="flex flex-col gap-1.5">
            <MissingDateNote kind="deadline" />
            <p className="text-muted-foreground pl-5 text-xs">
              A deadline can only be given when the submission is created — no verb sets one
              afterwards.
            </p>
          </div>
        )}

        {/* The outcome is the fact Davide keeps instead of remembering (#119). */}
        <div className="flex flex-col gap-2 border-t pt-4">
          <p className="text-sm font-medium">Record the outcome</p>
          <p className="text-muted-foreground text-xs">
            Where the submission stands. Any value, any time: a conference can move a talk off its
            waitlist, so this has to be correctable and not a one-way ladder.
          </p>
          <OutcomeControl id={engagement.id} current={engagement.outcome} />
        </div>
      </DetailSheet>
    </>
  );
}
