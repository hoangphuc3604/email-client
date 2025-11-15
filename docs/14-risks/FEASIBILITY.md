# Feasibility & Risks

## Technical Feasibility
- Frontend built with Next.js 14 confirmed.
- Backend FastAPI stack aligns with team expertise.
- MongoDB available via existing Atlas subscription.
- OAuth credentials manageable with current Google org setup.

## Key Risks
- **R1**: API contract changes may break TypeScript client.  
  _Mitigation_: Generate TS client from OpenAPI; run contract tests in CI.
- **R2**: Mongo performance for large mailboxes.  
  _Mitigation_: Implement indexes, evaluate sharding for >1M messages.
- **R3**: AI provider cost overruns.  
  _Mitigation_: Add rate limiting, caching; evaluate open-source models.
- **R4**: Compliance gap (GDPR, data residency).  
  _Mitigation_: Add export/delete features early; document data flows.
- **R5**: Team bandwidth for aggressive timeline.  
  _Mitigation_: Focused sprint scope, consult cross-team resources.

> Review monthly with leadership.

