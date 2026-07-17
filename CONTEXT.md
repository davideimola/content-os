# Content OS

Davide Imola's personal editorial system: planning, calendar, cadence, metrics, and reminders for his content (blog, LinkedIn, talks). It orchestrates the editorial work — the actual production happens in the Factories (`davideimola.dev`, `presentations`).

## Language

**Positioning**:
Davide's public flag: "I build AI agents for cybersecurity, and I share everything I learn building them". Every piece of content either reinforces it or is deliberate Side content.
_Avoid_: brand, niche, tagline

**Flag content**:
Content that directly reinforces the Positioning. Mix target: a clear majority of output (~70%, indicative quota).
_Avoid_: main pillar, focus, core content

**Side content**:
Legitimate off-flag content (leadership, OSS/community, Go/tooling, retrospectives) that adds variety and authenticity without diluting the Positioning.
_Avoid_: off-topic, filler

**Canonical home**:
The blog on davideimola.dev — where long-form content permanently lives and search finds it.
_Avoid_: main channel, website

**Amplifier**:
LinkedIn — where content earns reach. A post must deliver its full value natively in the feed; links are footnotes, never the point.
_Avoid_: social channel, promo channel

**Talk**:
A conference appearance treated as editorial work: it has a CFP/deadline, preparation, and generates derived content for the other channels.
_Avoid_: event, speech

**Pipeline**:
The single editorial backlog: every idea, proposal, and in-flight piece across all channels, tracked as GitHub issues on `content-os`. Each in-flight piece links its production artifact in the relevant Factory.
_Avoid_: backlog, content plan, board

**Factory**:
A repo where content gets produced with its own writing skills: `davideimola.dev` (blog posts, LinkedIn content) and `presentations` (talks, CFPs, slides). Factories keep their production artifacts; they never hold the editorial pipeline.
_Avoid_: content repo, downstream repo

**Cadence**:
The publishing floor Davide commits to defend: 1 LinkedIn post per week, 1 blog post per month. A floor to protect, never a ceiling; the reminders guard it.
_Avoid_: schedule, frequency, quota

**Recycle**:
Re-surfacing on-voice material content-os already holds — a parked Idea, or an angle derived from a published blog or an upcoming Talk — to defend the Cadence floor on a dry week. It never invents a new topic; it only re-surfaces what already passed the voice bar.
_Avoid_: generate, brainstorm, suggest

**Idea**:
A raw, unjudged content spark, captured as a content-os issue in under thirty seconds. No format, no channel, no quality bar at capture time — capture first, judge later.
_Avoid_: draft, proposal, note

**CFP**:
A call-for-papers opportunity, tracked on content-os with its deadline and outcome (to submit / submitted / accepted / rejected). The talk brief it reuses lives in the `presentations` Factory.
_Avoid_: call, submission (for the opportunity itself)

**Calendar**:
The by-date view over the Pipeline — what publishes when, plus CFP and talk deadlines — maintained as a GitHub Projects board on content-os. Issues stay the source of truth.
_Avoid_: board, content plan

**Beat**:
One of the three scheduled proactive sessions: weekly planning (Monday), cadence guard (Thursday), monthly review. A Beat works the Pipeline on its own and pings Davide on Telegram when there is something for him.
_Avoid_: cron job, reminder (the ping is the message, the Beat is the session)

**Desk**:
The interactive counterpart to a Beat: an on-demand editorial session Davide opens himself to work the Pipeline by hand, present in the loop — where a Beat runs on a schedule and pings him because he is absent. It plans by the same editorial judgement as the Monday Beat, but the judging is a live conversation rather than an autonomous one, and it changes nothing until Davide approves the plan.
_Avoid_: interactive Beat, console, dashboard

**Metrics snapshot**:
The monthly capture of channel data (LinkedIn analytics export, site analytics numbers), stored in the repo and crossed with the Calendar by the monthly review to judge what worked.
_Avoid_: report, stats dump
