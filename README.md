# AgentTrust starter

Public directory MVP: search agents by name/agency/location, optional browser geolocation, approved reviews summary, approved sponsored advertisements. No login, review submission, verification workflow, payment processing or admin interface yet. Do not publicly launch until those workflows, privacy controls and moderation are implemented.

## Run locally (no hosting required)

Prerequisites: Node.js 20+ and a running MySQL 8 server.

1. In MySQL, create a database: `CREATE DATABASE agenttrust CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
2. Import the schema: `mysql -u root -p agenttrust < sql/schema.sql`.
3. Copy `.env.example` to `.env`, set `DB_NAME=agenttrust`, and supply your local MySQL credentials.
4. Run `npm install` and `npm run dev` in the project directory.
5. Open `http://localhost:3000` and check `http://localhost:3000/api/health`.

The directory starts empty. Add test agents, service areas and approved advertisements in MySQL to populate it. This starter currently uses **plain JavaScript in public/app.js**, not React; it can be migrated to React as the interface grows. No cPanel setup is needed for local development.

## Important limitations
- MVP read-only public API; adding reviews and agents must be protected by authentication, anti-spam checks, authorization and moderation.
- Browser location is permission-based and requires HTTPS (except localhost). Nearby search uses agent coordinates; manual location searches use service areas.
- Ads are labeled Sponsored and cannot change agent reputation.
- Do not treat a verified badge as proof of safety until a documented verification process exists.
- Add pagination, audit logs, image validation, privacy policy and abuse handling before production.
