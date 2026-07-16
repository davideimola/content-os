# Editorial pipeline centralized on content-os

Davide's content work spans two production repos ("Factories": `davideimola.dev` for blog/LinkedIn, `presentations` for talks/CFPs), and before this decision each tracked its own work in its own issues. We decided that the entire editorial pipeline — ideas, proposals, calendar slots, CFP tracking — lives as GitHub issues on `content-os`, the single editorial HQ. Factories keep only their production artifacts (blog PRs with MDX, talk brief issues + Slidev folders), linked from the content-os issue that owns the piece.

## Considered Options

- **Everything on content-os** (chosen): one place to look, and talks/social-only content — which have no natural home in a website repo — get a home.
- **Split** (ideas here, production issues in each Factory): no skill changes, but two-three trackers to keep aligned by hand.
- **Status quo** (pipeline stays on `davideimola.dev`): minimum effort, but the HQ would not be the source of truth.

## Consequences

- The writing skills in `davideimola.dev` (`editorial-route`, `write-blog-post`, `social-post`) must be updated to read/write issues on `davideimola/content-os` (`gh --repo`).
- `talk-forge`/`cfp-submit` keep their brief issues on `presentations` (production artifacts); only CFP opportunity tracking moves here.
- Open blog issues on `davideimola.dev` need a one-time migration.
