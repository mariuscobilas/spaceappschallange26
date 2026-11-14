---
name: code-reviewer
description: >-
  Runs pre-PR security and code quality audits: checking for leaked secrets, prompt injection,
  SQL injection, dead code, unchecked nulls, and schema divergence.
---

# Code & Security Reviewer Skill

Pre-pull-request audit checklist for the 2-person team to catch regressions and security vulnerabilities before merging.

## Automated Checks to Run

```bash
# 1. Typecheck the entire codebase
pnpm run build

# 2. Verify shared JSON contract fixtures
node .agents/skills/api-contract-sync/scripts/validate-payloads.mjs

# 3. Check for secrets or keys in git diff
git diff --cached | grep -iE "(api_key|secret|password|bearer|token)"
```

## Review Checklist

### 1. Security & Credentials
- [ ] No hardcoded API keys, JWT secrets, or DB passwords in code.
- [ ] Environment variables documented in `.env.example`.
- [ ] Input parameters sanitized against SQL injection (using SQLAlchemy bound parameters).
- [ ] LLM prompt templates sanitized against user prompt injection.

### 2. Contract Parity
- [ ] Did an endpoint change? If yes, are `shared/src/types` and `shared/python/schemas.py` updated?
- [ ] Are mock JSON payloads updated in `shared/payloads/`?

### 3. Frontend Checklist (`apps/web`)
- [ ] No unhandled Promise rejections or missing error boundaries.
- [ ] No hydration mismatches (check browser console).
- [ ] Uses `pnpm` exclusively.

### 4. Backend Checklist (`apps/api`)
- [ ] No blocking I/O calls inside `async def` routes.
- [ ] CORS permits `http://localhost:3000`.
- [ ] All request bodies validated via Pydantic schemas.
- [ ] Model weights (>10MB) not added to git staging.

