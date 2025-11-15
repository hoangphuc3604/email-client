# Risk Log

| ID | Description | Impact | Likelihood | Owner | Status | Mitigation |
|----|-------------|--------|------------|-------|--------|------------|
| R1 | OAuth redirect mismatch causes login failures | High | Medium | Backend Lead | Open | Align URIs, integration tests |
| R2 | Mongo storage costs exceed budget | Medium | Low | DevOps | Open | Enable compression, data retention policy |
| R3 | AI provider downtime disrupts summaries | Medium | Medium | AI Lead | Open | Implement graceful fallback, cache |
| R4 | SMTP relay rate limits emails | High | Low | Backend Lead | Open | Queue retries, negotiate higher limits |
| R5 | Security review flags token handling | High | Medium | Security Officer | Open | Conduct internal pen-test |

> Update weekly during sprint review.

