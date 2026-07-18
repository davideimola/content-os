-- Content OS — initial schema (ADR-0014, docs/design/supabase-foundations.md).
-- Tiers: Idea -> {Piece, Talk} (many-to-many); Talk -> Engagement -> Event.
-- Ideas are a live pool judged at the output; proposals are always persisted.

-- ── extensions ───────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;   -- gen_random_bytes for ids

-- ── helpers ──────────────────────────────────────────────────────────────────
-- Stripe-style prefixed ids: '<prefix>_<24 hex>'. Legible by type, non-enumerable.
create or replace function gen_prefixed_id(prefix text)
returns text language sql volatile as $$
  select prefix || '_' || encode(gen_random_bytes(12), 'hex');
$$;

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── enums ────────────────────────────────────────────────────────────────────
create type idea_status        as enum ('live', 'archived');
create type flag_side          as enum ('flag', 'side');
create type piece_channel      as enum ('blog', 'linkedin');
create type piece_state        as enum ('proposed', 'slotted', 'in_production', 'published', 'declined');
create type talk_state         as enum ('proposed', 'in_production', 'ready', 'declined');
create type engagement_kind    as enum ('cfp', 'direct');
create type engagement_outcome as enum ('to_submit', 'submitted', 'accepted', 'rejected', 'confirmed');

-- ── tables ───────────────────────────────────────────────────────────────────
create table ideas (
  id              text primary key default gen_prefixed_id('idea'),
  body            text not null,                 -- the spark, verbatim
  title           text,                          -- short readable summary (optional)
  status          idea_status not null default 'live',
  archived_reason text,                          -- set when archived (dedup / repudiated)
  duplicate_of    text references ideas(id),      -- archived duplicate -> its twin
  source          text,                          -- 'skill' | 'app' | 'manual'
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table talks (
  id         text primary key default gen_prefixed_id('talk'),
  title      text not null,
  flag_side  flag_side not null,
  state      talk_state not null default 'proposed',
  brief_url  text,                               -- TALK.md in the presentations Factory
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table events (
  id         text primary key default gen_prefixed_id('event'),
  name       text not null,
  starts_on  date,
  ends_on    date,
  location   text,
  url        text,
  roles      text[] not null default '{}',        -- organizer, mc, ...; speaking is derived
  is_public  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table engagements (
  id           text primary key default gen_prefixed_id('eng'),
  talk_id      text not null references talks(id),
  event_id     text not null references events(id),
  kind         engagement_kind not null default 'cfp',
  outcome      engagement_outcome not null default 'to_submit',
  deadline     date,                              -- cfp only
  cfp_link     text,                              -- cfp only
  answers_path text,                              -- cfp only (gitignored, in presentations)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint engagement_outcome_matches_kind check (
    (kind = 'direct' and outcome = 'confirmed') or
    (kind = 'cfp'    and outcome in ('to_submit', 'submitted', 'accepted', 'rejected'))
  )
);

create table pieces (
  id                  text primary key default gen_prefixed_id('piece'),
  title               text not null,
  channel             piece_channel not null,
  flag_side           flag_side not null,
  state               piece_state not null default 'proposed',
  publish_date        date,
  blocked_by_piece_id text references pieces(id),
  engagement_id       text references engagements(id),  -- accepted-talk announcement / recap
  artifact_url        text,                              -- Factory artifact (PR / MDX)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Idea -> output, many-to-many (the correlated pool feeds outputs; an Idea is not consumed).
create table piece_sources (
  piece_id text not null references pieces(id) on delete cascade,
  idea_id  text not null references ideas(id)  on delete cascade,
  primary key (piece_id, idea_id)
);

create table talk_sources (
  talk_id text not null references talks(id) on delete cascade,
  idea_id text not null references ideas(id) on delete cascade,
  primary key (talk_id, idea_id)
);

create table metrics_linkedin_posts (
  id          text primary key default gen_prefixed_id('mlp'),
  piece_id    text references pieces(id),          -- nullable: not every post maps to a Piece
  month       date not null,
  post_url    text,
  posted_on   date,
  impressions int,
  reactions   int,
  comments    int,
  shares      int,
  clicks      int,
  created_at  timestamptz not null default now()
);

create table metrics_site (
  id         text primary key default gen_prefixed_id('mst'),
  month      date not null unique,                 -- from the Umami API
  visitors   int,
  page_views int,
  created_at timestamptz not null default now()
);

-- ── updated_at triggers ──────────────────────────────────────────────────────
create trigger trg_ideas_updated       before update on ideas       for each row execute function set_updated_at();
create trigger trg_talks_updated        before update on talks        for each row execute function set_updated_at();
create trigger trg_events_updated       before update on events       for each row execute function set_updated_at();
create trigger trg_engagements_updated  before update on engagements  for each row execute function set_updated_at();
create trigger trg_pieces_updated       before update on pieces       for each row execute function set_updated_at();

-- ── views ────────────────────────────────────────────────────────────────────
-- Public read surface for davideimola.dev (anon). Only public events + the accepted
-- engagement's talk title; base tables stay private behind RLS.
create view public_events as
  select e.id, e.name, e.starts_on, e.ends_on, e.location, e.url, e.roles,
         t.id as talk_id, t.title as talk_title
  from events e
  left join engagements eng on eng.event_id = e.id and eng.outcome = 'accepted'
  left join talks t on t.id = eng.talk_id
  where e.is_public;

-- Flag mix (~70% target), over Pieces AND Talks (Talks count here, not Cadence).
create view flag_mix as
  with mix as (select flag_side from pieces union all select flag_side from talks)
  select count(*) filter (where flag_side = 'flag') as flag,
         count(*) filter (where flag_side = 'side') as side,
         count(*) as total
  from mix;

-- Cadence floor (Pieces only): this week's LinkedIn slot + this month's blog.
create view cadence_status as
  select
    exists (
      select 1 from pieces
      where channel = 'linkedin' and (
        (state = 'published' and publish_date >= date_trunc('week', current_date)) or
        (state in ('slotted', 'in_production')
         and publish_date between current_date and (date_trunc('week', current_date) + interval '6 days'))
      )
    ) as linkedin_week_covered,
    exists (
      select 1 from pieces
      where channel = 'blog'
        and publish_date >= date_trunc('month', current_date)
        and state in ('slotted', 'in_production', 'published')
    ) as blog_month_covered;

-- The Beats' staleness signal: proposals awaiting a pursue/decline (Ideas are never "unjudged").
create view untriaged_proposals as
  select 'piece'::text as kind, id, title from pieces where state = 'proposed'
  union all
  select 'talk'::text  as kind, id, title from talks  where state = 'proposed';

-- ── capture door (the only verb the insert-only token may call) ───────────────
create or replace function capture_idea(p_body text, p_title text default null, p_source text default 'app')
returns ideas
language plpgsql
security definer
set search_path = public
as $$
declare
  new_idea ideas;
begin
  insert into ideas (body, title, source)
  values (p_body, p_title, coalesce(p_source, 'app'))
  returning * into new_idea;
  return new_idea;
end;
$$;

-- ── RLS: deny-by-default; expose only the public view + the capture verb to anon ─
alter table ideas                  enable row level security;
alter table talks                  enable row level security;
alter table events                 enable row level security;
alter table engagements            enable row level security;
alter table pieces                 enable row level security;
alter table piece_sources          enable row level security;
alter table talk_sources           enable row level security;
alter table metrics_linkedin_posts enable row level security;
alter table metrics_site           enable row level security;

-- service_role (CLI / skills) bypasses RLS. anon gets ONLY the public view + capture_idea.
grant select on public_events to anon;
grant execute on function capture_idea(text, text, text) to anon;
