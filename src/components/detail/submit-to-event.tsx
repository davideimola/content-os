"use client";

// The console's first **creation** surface (#119): submit a Talk to a conference.
//
// **Talk-first, one drawer.** When a CFP opens the question is "which talk do I send",
// not "which conference exists" — so the flow hangs off the Talk whose sheet Davide is
// looking at, and the Talk is never picked here. The prototype tested the two
// alternatives and lost with both: an event-first spine buries the question, and a
// three-step wizard spends three screens on three fields (PROTOTYPE-VERDICT, Q7).
//
// **Two verbs, one gate.** An Event that does not exist yet is created inline — the
// picker is a creatable single-select, the same shape as the Theme tagger Davide steers
// by — and then the submission is created against it. `create_event` returns the new id
// for exactly this (#114), and when the second call fails the id is **kept**, so a retry
// submits against the Event that already exists instead of minting a twin. There is no
// verb that deletes an Event, which makes that the difference between a repair and
// permanent debris.

import { Combobox } from "@base-ui/react/combobox";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useState, useTransition } from "react";

import { DetailSheet } from "@/components/detail/detail-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createEngagement, createEvent } from "@/lib/actions";
import type { EventRecord, Talk } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

// The sentinel id for the synthetic "Create «query»" row — base-ui's Combobox has no
// built-in creatable, so an item is injected and materialized on submit. Same technique
// as `ThemeTagger`, single-select here because a submission goes to one conference.
const CREATE_ID = "__create__";
type Option = { id: string; label: string };

function EventPicker({
  events,
  value,
  onChange,
}: {
  events: EventRecord[];
  value: Option | null;
  onChange: (option: Option | null) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim();
  const qLower = q.toLowerCase();
  const matching = events
    .filter((e) => e.name.toLowerCase().includes(qLower))
    .map((e) => ({ id: e.id, label: e.name }));
  // `create_event` is deliberately NOT get-or-create by name — two conferences can share
  // a name across years (#114) — so the create row appears only when nothing matches
  // exactly, and picking the existing Event stays the easier of the two.
  const showCreate = q.length > 0 && !events.some((e) => e.name.toLowerCase() === qLower);
  const items: Option[] = showCreate ? [...matching, { id: CREATE_ID, label: q }] : matching;

  return (
    <Combobox.Root
      items={items}
      value={value}
      onValueChange={(next: Option | null) => onChange(next)}
      inputValue={query}
      onInputValueChange={(v: string) => setQuery(v)}
      filter={null}
      itemToStringLabel={(item: Option) => item.label}
      itemToStringValue={(item: Option) => item.label}
      isItemEqualToValue={(a: Option, b: Option) => a.id === b.id}
    >
      <div className="border-input focus-within:border-ring focus-within:ring-ring/50 flex min-h-8 w-full items-center gap-1 rounded-lg border bg-transparent px-1.5 py-1 text-sm transition-colors focus-within:ring-3 dark:bg-input/30">
        <Combobox.Input
          placeholder="Conference — pick or create…"
          aria-label="Conference"
          className="placeholder:text-muted-foreground min-w-24 flex-1 bg-transparent px-1 outline-none"
        />
        <Combobox.Trigger
          aria-label="Open events"
          className="text-muted-foreground hover:text-foreground inline-flex size-5 items-center justify-center rounded-sm [&>svg]:size-4"
        >
          <ChevronsUpDown />
        </Combobox.Trigger>
      </div>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="z-50">
          <Combobox.Popup className="bg-popover text-popover-foreground data-ending-style:opacity-0 data-starting-style:opacity-0 max-h-64 w-[var(--anchor-width)] overflow-y-auto rounded-lg border p-1 shadow-md transition-opacity">
            <Combobox.Empty className="text-muted-foreground px-2 py-1.5 text-sm">
              {q.length > 0 ? "No matching event." : "No events yet — type to create one."}
            </Combobox.Empty>
            <Combobox.List>
              {(item: Option) => (
                <Combobox.Item
                  key={item.id}
                  value={item}
                  className="data-highlighted:bg-muted data-highlighted:text-foreground flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                >
                  {item.id === CREATE_ID ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Plus className="size-3.5" />
                      Create “{item.label}”
                    </span>
                  ) : (
                    <>
                      <Combobox.ItemIndicator className="flex size-3.5 items-center justify-center">
                        <Check className="size-3.5" />
                      </Combobox.ItemIndicator>
                      {item.label}
                    </>
                  )}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

// One labelled field, so the form reads as a list of questions rather than a wall. Not a
// `<label>`: the control is a child rather than a `for` target (the picker is a composite
// widget, not one input), so each control carries its own `aria-label` and this is the
// visible caption beside it.
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="text-muted-foreground text-[0.7rem]">{hint}</span> : null}
    </div>
  );
}

export function SubmitToEvent({
  talk,
  events,
  className,
}: {
  talk: Talk;
  events: EventRecord[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [option, setOption] = useState<Option | null>(null);
  // The Event fields, revealed only when one is being created — an existing Event's
  // details are not editable through any verb, so showing them for a picked Event would
  // offer an edit that cannot happen.
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [location, setLocation] = useState("");
  const [url, setUrl] = useState("");
  const [deadline, setDeadline] = useState("");
  const [cfpLink, setCfpLink] = useState("");
  // The id of an Event this flow already created: the resume point if the submission
  // failed after the Event landed (nothing can delete an Event).
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const creatingEvent = option?.id === CREATE_ID;

  function reset() {
    setOption(null);
    setStartsOn("");
    setEndsOn("");
    setLocation("");
    setUrl("");
    setDeadline("");
    setCfpLink("");
    setCreatedEventId(null);
    setError(null);
  }

  function submit() {
    if (!option) return;
    setError(null);
    startTransition(async () => {
      let eventId = option.id;
      if (creatingEvent) {
        if (createdEventId) {
          eventId = createdEventId; // a retry: the Event is already on the record
        } else {
          const created = await createEvent({
            name: option.label,
            startsOn,
            endsOn,
            location,
            url,
          });
          if (!created.ok) {
            setError(created.error);
            return;
          }
          setCreatedEventId(created.id);
          eventId = created.id;
        }
      }

      const res = await createEngagement({ talkId: talk.id, eventId, deadline, cfpLink });
      if (!res.ok) {
        setError(
          createdEventId || creatingEvent
            ? `${res.error} — the Event was created; submitting again will reuse it.`
            : res.error
        );
        return;
      }
      setOpen(false);
      reset();
    });
  }

  return (
    <>
      <Button
        size="xs"
        variant="outline"
        className={cn("w-fit", className)}
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Plus />
        Submit to an event
      </Button>

      <DetailSheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
        title="Submit to an event"
        description={talk.title}
      >
        <div className="flex flex-col gap-3">
          <Field
            label="Conference"
            hint={
              creatingEvent
                ? "New conference — it will be created, then submitted to."
                : "Two conferences can share a name across years, so pick the right one."
            }
          >
            <EventPicker
              events={events}
              value={option}
              onChange={(next) => {
                // Changing the conference drops the resume point: an Event created by a
                // failed attempt belongs to the name that was typed then, and reusing its
                // id against a different name would file the submission at the wrong
                // conference — silently, and with no verb able to move it.
                if (next?.label !== option?.label) setCreatedEventId(null);
                setOption(next);
              }}
            />
          </Field>

          {creatingEvent ? (
            <div className="border-muted flex flex-col gap-2.5 border-l-2 pl-3">
              <Field label="Starts">
                <Input
                  type="date"
                  value={startsOn}
                  onChange={(e) => setStartsOn(e.target.value)}
                  className="w-auto"
                  aria-label="Event start date"
                />
              </Field>
              <Field label="Ends">
                <Input
                  type="date"
                  value={endsOn}
                  onChange={(e) => setEndsOn(e.target.value)}
                  className="w-auto"
                  aria-label="Event end date"
                />
              </Field>
              <Field label="Location">
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Verona, Italy"
                  aria-label="Event location"
                />
              </Field>
              <Field label="Event URL">
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                  aria-label="Event URL"
                />
              </Field>
            </div>
          ) : null}

          {/* The one moment a deadline can be given: no verb sets one on an existing
              submission, and without a deadline the submission never reaches the
              Calendar. Said here rather than discovered later. */}
          <Field
            label="CFP deadline"
            hint="Without one the submission carries no date and never appears on the Calendar — and it cannot be added afterwards."
          >
            <Input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-auto"
              aria-label="CFP deadline"
            />
          </Field>

          <Field label="CFP link">
            <Input
              value={cfpLink}
              onChange={(e) => setCfpLink(e.target.value)}
              placeholder="https://…"
              aria-label="CFP link"
            />
          </Field>

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button size="sm" onClick={submit} disabled={pending || !option}>
              {creatingEvent && !createdEventId ? "Create event & submit" : "Create submission"}
            </Button>
            <span className="text-muted-foreground text-xs">
              Born <span className="font-medium">to submit</span> — the outcome is recorded as it
              moves.
            </span>
          </div>

          {error ? <p className="text-destructive text-xs">{error}</p> : null}
        </div>
      </DetailSheet>
    </>
  );
}
