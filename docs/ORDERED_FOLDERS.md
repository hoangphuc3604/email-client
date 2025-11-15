# Ordered Docs — priority list

This checklist orders the documentation areas for the Email Client project. Author or update documents in this order so the most critical context exists first.

1. product/ — One-pager, SRS, MVP scope, roadmap (defines product positioning and near-term scope)
2. api/ — FastAPI contract-first specs (keeps web/app teams aligned)
3. architecture/ — System architecture diagram, data flows, deployment model
4. dev/ — Local setup, contribution rules, coding standards
5. infra/ — CI/CD, container images, deployment runbooks
6. qa/ — Test strategy, acceptance checklist, regression suites
7. ops/ — Monitoring, on-call playbooks, SLOs/SLAs
8. security/ — Threat model, data handling, secrets policy
9. ux/ — Personas, journeys, accessibility, wireframes
10. user/ — Admin guide, external FAQ, onboarding notes
11. analytics/ — Event schema, KPIs, instrumentation plan
12. business/ — Pricing, billing, data-retention commitments
13. releases/ — Release process and template
14. risks/ — Risk register and feasibility notes
15. research/ — Market/competitor insights
16. legal/ — Terms, privacy, compliance needs
17. maintenance/ — Tech debt register, long-term maintenance plan
18. techdebt/ — Archival/EOL policies and backlog tracking

Notes
- Keep folder prefixes in sync with this list to avoid merge conflicts with doc tooling.
- Run `scripts/rename-doc-folders.ps1` if you prefer to adjust numbering in bulk (script not yet ported for this repo).
- Update this file whenever priorities or document sets change.

> Created: 2025-11-13

