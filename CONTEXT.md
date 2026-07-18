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
A first-class editorial object — a brief and deck — correlated from one or more Ideas; a sibling of Piece, **not** a kind of it. Dateless and delivered zero or more times through its Engagements; it carries a Flag/Side (counting toward the Flag mix, not Cadence) and runs proposed → in-production → ready (or declined).
_Avoid_: event, speech, talk Piece

**Pipeline**:
The single editorial backlog, in tiers: **Ideas** (a live pool of sparks); the **Pieces** and **Talks** correlated from them; and the **Engagements** through which a Talk reaches an Event. Each Piece and Talk links its production artifact in the relevant Factory.
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
A raw content spark, captured in under thirty seconds — no format, no channel, no quality bar. Ideas form a **persistent pool**: an Idea stays **live** by default (it may never be used, and is never rejected) and goes **archived** only when a duplicate or repudiated. Outputs are proposed by correlating the pool, not by judging a single Idea.
_Avoid_: draft, proposal, note

**Piece**:
A single dated output on a cadence channel — a blog post or a LinkedIn post — correlated from one or more Ideas (Talks are a separate type), or tied to an Engagement (an accepted-talk announcement). Its lifecycle is proposed → slotted → in-production → published (or declined); a proposal is always kept on the record so it is not re-proposed. It carries a channel, publish date, and production artifact, and can block a sibling Piece (a blog blocks the LinkedIn Piece that amplifies it).
_Avoid_: post, content, item

**Engagement**:
One instance of a Talk taken to an Event, of kind **cfp** (a call-for-papers submission, with a deadline and outcome to submit / submitted / accepted / rejected) or **direct** (a self-organized slot, outcome confirmed). One Talk has **many** Engagements; the accepted one is the single link between a Talk and an Event — the same talk delivered more than once, each pitch tuned to its Event.
_Avoid_: booking, gig

**CFP**:
An Engagement of kind **cfp** — the call-for-papers case. Its calibrated answers live in the `presentations` Factory; only its deadline and outcome are editorial.
_Avoid_: call, submission (for the opportunity itself)

**Event**:
A conference or meetup, with its dates, location, and the **roles** Davide holds there (organizer, MC, …); *speaking* is not a role but is derived from an accepted Engagement. An Event marked public surfaces on davideimola.dev.
_Avoid_: conference (as the generic term), venue

**Calendar**:
The by-date view over the Pipeline — what publishes when, plus CFP deadlines and conference dates. A projection over the Pipeline, never a separate source of truth.
_Avoid_: board, content plan

**Beat**:
One of the three scheduled reminders — weekly planning (Monday), cadence guard (Thursday), monthly review. A Beat detects staleness from observable facts (the last published Piece, untriaged proposals, missing metrics) and pings Davide on Telegram to run the interactive session that does the work — the Desk (planning) or the Review (monthly). It never judges or changes the Pipeline itself.
_Avoid_: cron job, autonomous planner

**Desk**:
The interactive planning session Davide opens himself to work the Pipeline by hand, present in the loop — judging new Ideas and slotting the week by the editorial signal framework, in a live conversation, changing nothing until he approves. Its scheduled Beat is only a reminder that nudges him to open it; its monthly sibling is the Review. In the session he reviews the outputs correlation proposes from the Idea pool — pursuing or declining each — rather than judging Ideas one by one.
_Avoid_: interactive Beat, console, dashboard

**Review**:
The interactive counterpart to the monthly Beat — an on-demand session Davide opens to turn a month's metrics into next month's steer: it runs the Metrics snapshot ritual, crosses the numbers with the Calendar, and reports the mix and Cadence against their targets with number-cited recommendations. The Review is to the monthly what the Desk is to the week.
_Avoid_: report, digest, dashboard

**Metrics snapshot**:
The monthly capture of channel data (LinkedIn analytics export, site analytics numbers), stored with the Pipeline and crossed with the Calendar by the monthly review to judge what worked.
_Avoid_: report, stats dump
