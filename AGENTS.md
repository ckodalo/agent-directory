# Codex Instructions — AgentTrust

Read `docs/PROJECT_CONTEXT.md` before planning or implementing features. Treat it as product intent; inspect the actual repository before assuming any feature exists.

## Confirmed decisions
- Build a nationwide Kenya property-agent directory and marketplace, not just Nairobi.
- Develop locally first. Hosting is deferred; do not optimize for cPanel yet.
- Use **SQL Server for local development**, as confirmed by the user. Retain MySQL support for a future migration; do not introduce another database without explicit approval.
- JavaScript ecosystem: Node.js + Express backend. React + TypeScript is the intended frontend direction, but the downloaded starter may currently use plain JavaScript; inspect before migrating.
- Use environment variables for credentials and secrets; never commit `.env`.
- Favor small, tested, incremental changes over wholesale rewrites.

## Workflow
1. Inspect package.json, README, schema, routes and UI to determine current implementation.
2. Summarize what is implemented, missing, and potentially inconsistent with the product spec.
3. Propose the smallest useful next milestone, then implement it with tests where feasible.
4. Preserve existing working behavior; document database migrations and run commands.
5. Distinguish verified features from planned features. Never fabricate agent identities, ratings or verification claims as real data.
6. Ask before destructive database operations, external service purchases or major architectural changes.

## Security and integrity
- Treat user reviews and allegations as unverified until moderated. Provide dispute and appeal workflows.
- Verification status and reputation score are separate. Advertising must not influence trust score or organic rankings without clear sponsorship labels.
- Rate-limit sensitive endpoints, validate input, enforce role-based access, secure passwords and sessions, and avoid exposing private verification documents.
- Browser geolocation requires user permission and HTTPS in production; provide manual location selection and minimize storage of precise coordinates.
