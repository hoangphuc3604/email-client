# Product docs — `docs/01-product`

This folder hosts the canonical product documentation for the Email Client project. File numbering reflects drafting and review priority (lower numbers first).

## File index
- `01-ONE_PAGER.md` — Executive summary and MVP positioning.
- `02-SRS.md` — Functional & non-functional requirements.
- `03-SRS_CHANGELOG.md` — Versioned edits to the SRS.
- `04-MVP_SCOPE.md` — In/out scope for parity release.
- `05-EPICS.md` — Epics mapped to milestones and owners.
- `06-USER_STORIES.md` — High-level stories ready for ticketing.
- `06b-USER_STORIES_DETAILED.md` — Story elaborations, UX notes, edge cases.
- `07-ACCEPTANCE_CRITERIA.md` — Consolidated criteria for QA.
- `08-METRICS_KPIS.md` — North-star and leading metrics.
- `09-ROADMAP.md` — Milestore timeline.
- `10-VISION_AND_OKRS.md` — Vision statement and quarterly OKRs.
- `11-RELEASE_CRITERIA.md` — Gate checklist for production releases.
- `12-ADR_INDEX.md` + `ADR/` — Architecture decision records.
- `13-MEETINGS_README.md` + `MEETINGS/` — Meeting templates & notes.
- `14-TEMPLATES_USER_STORY.md` / `15-TEMPLATES_ACCEPTANCE_TEST.md` — Copy-once templates.
- `16-SPRINT_PLAN.md` — Short-term plan with velocity targets.
- `diagrams/` — Mermaid-based system diagrams (architecture, flows, journeys).

## Contribution guidelines
- Maintain numeric prefixes when adding new top-level docs.
- Update `03-SRS_CHANGELOG.md` alongside any SRS change.
- Record cross-functional decisions as ADRs and update `12-ADR_INDEX.md`.
- Follow PR rules in `docs/process/WORKFLOW.md`.

## Publishing
- Docs are rendered via the internal Docusaurus site (pipeline TBD).
- Treat this folder as source of truth for PM, engineering, and design.

> Created: 2025-11-13

