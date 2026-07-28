"use client";

// The Engagement tier's detail drawers — the tier had none anywhere in the console,
// so a row for an Event or a CFP deadline had nothing to open (#111).
//
// Both are **read-only**: the verbs that create an Event, create a submission or
// record an outcome do not exist yet, and neither does anything that advances a
// Talk's readiness. They show facts; nothing here writes.
//
// Each takes a **required** `trigger` (the shared opener contract, `DetailTrigger`):
// unlike a Piece / Idea / Talk, an Event and a CFP have no canonical card in the
// console, so there is no default opener to fall back to — the caller always brings
// its own row.

import { CalendarClock, CalendarOff, Link2, MapPin, Mic } from "lucide-react";
import { useState } from "react";

import { CopyId } from "@/components/copy-id";
import { DetailSheet, type DetailTrigger } from "@/components/detail/detail-sheet";
import { formatDate, OutcomeBadge, StateBadge } from "@/components/pipeline";
import type { Engagement, EngagementTalk, EventRecord } from "@/lib/pipeline";

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
        {talk.deadline ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            deadline {formatDate(talk.deadline)}
          </span>
        ) : null}
      </div>
      {talk.deadline ? null : (
        <div className="pl-5">
          <MissingDateNote kind="deadline" />
        </div>
      )}
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
          Read-only — an Event's details, a submission's outcome and a Talk's readiness are not
          editable from the console yet.
        </ReadOnlyNote>
      </DetailSheet>
    </>
  );
}

// A CFP submission's drawer: one Talk taken to one conference — its deadline, its
// outcome, its Talk's readiness and the CFP link.
export function CfpDetail({
  engagement,
  event,
  talk,
  trigger,
}: {
  engagement: Engagement;
  event: EventRecord | null;
  talk: EngagementTalk | null;
  trigger: DetailTrigger;
}) {
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

        {engagement.deadline ? null : <MissingDateNote kind="deadline" />}

        <ReadOnlyNote>
          Read-only — recording an outcome and advancing a Talk's readiness are not available from
          the console yet.
        </ReadOnlyNote>
      </DetailSheet>
    </>
  );
}
