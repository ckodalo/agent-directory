# AgentTrust starter

Local marketplace MVP: nationwide agent discovery, optional browser geolocation, approved review summaries, sponsored advertisements, agent accounts and profile publication approval. Public review submission, identity verification workflows, payment processing, account recovery and email verification are not implemented. Do not publicly launch until these workflows, privacy controls and abuse handling are ready.

## Run locally (no hosting required)

Prerequisites: Node.js 22.12+, a running local SQL Server, and Microsoft ODBC Driver 18 for SQL Server. Windows authentication is the default.

1. Create a dedicated database: `sqlcmd -S localhost -E -C -b -Q "IF DB_ID('agenttrust') IS NULL CREATE DATABASE agenttrust"`.
2. Import the SQL Server schema: `sqlcmd -S localhost -E -C -b -d agenttrust -i sql/schema.sqlserver.sql`. The script can be rerun without duplicating seed locations.
3. Copy `.env.example` to `.env`. For the default local instance, use `DB_HOST=localhost`, `DB_NAME=agenttrust`, and `DB_AUTH=windows`. For a named instance, set `DB_INSTANCE` (for example, `SQLEXPRESS`) and omit `DB_PORT`. For SQL login authentication, use `DB_AUTH=sql` and supply `DB_USER` and `DB_PASSWORD`. Trusting a self-signed certificate is for local development only.
4. Run `npm install`, `npm run db:migrate`, `npm run auth:setup`, and `npm run dev` in the project directory. `auth:setup` generates a session secret in your ignored `.env` without printing it.
5. Open `http://localhost:3000` and check `http://localhost:3000/api/health`.

The directory starts empty. Add test agents, service areas and approved advertisements in SQL Server to populate it. The frontend uses **React** in `src/main.jsx`, with styles in `src/styles.css`. Vite provides development hot reload through the Express server; API routes remain in `server.js`. Database connections live in `database.js`, and directory queries live in `directory.js`. No cPanel setup is needed for local development.

## Switching to MySQL later

MySQL support is retained. Create a MySQL 8 database with `CREATE DATABASE agenttrust CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`, then import `sql/schema.sql` with `mysql -u root -p agenttrust < sql/schema.sql`.

Set `DB_CLIENT=mysql`, `DB_HOST`, `DB_PORT=3306`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` in `.env`, then restart the server. The query layer selects the correct parameter, row-limit, and date syntax for each engine. Switching the driver does not copy existing records: export and import your data separately, preserving IDs, relationships, status values, and timestamps.

Run `npm run db:migrate` against MySQL after importing its base schema. MySQL 8.0.17+ is required for the discovery queries. SQL Server remains the supported, tested local development setup; MySQL compatibility has not been tested against a live MySQL instance here.

## Nationwide discovery

Run `npm run db:migrate` on an existing database before starting the updated app. Migration `001-discovery` adds location types, parent relationships, indexes, and all 47 counties without replacing existing records. Completed migrations are recorded in `schema_migrations`; individual steps are repeatable if an interrupted migration must be retried. Run migrations from one process at a time.

County names and codes in `sql/counties.json` were checked against the [State Department for Devolution county list](https://www.devolution.go.ke/county-information). Names use ASCII punctuation and omit the County suffix. The four existing Nairobi areas are preserved; comprehensive sub-county, town, and neighborhood data is not seeded. Additional verified locations may be inserted with `location_type` and `parent_id`; keep parents in the same county, avoid cycles, and keep the hierarchy county/sub-county/town/neighborhood. An intermediate level may be omitted when not known. The legacy `county` text column remains for manual text search compatibility.

Agents can serve multiple areas. County filters include service areas below that county; specific area filters also include agents explicitly serving an ancestor area. Agent latitude/longitude describe the office, independently of service areas. Nearby results are ordered by office distance. Agents without approved reviews show "No reviews yet"; averages are review summaries, not reputation scores.

Ads use the same selected location hierarchy. Nearby advertising matches known location points within the selected radius and campaigns targeting their ancestors, plus untargeted national campaigns. Where no nearby area coordinates are known, only national campaigns appear; no county boundaries or reverse-geocoding service are assumed. Precise device coordinates are held in browser memory and sent for that search, not saved to the database.

`GET /api/agents?page=1&page_size=12` returns `{ items, total, page, page_size, total_pages }`. Items include `service_areas`. Legacy callers without pagination parameters still receive an array, limited to 100 records. Optional filters: `q`, `location` (text), `location_id` (county or area ID), `lat`, `lng`, `radius` (km). Coordinates must be supplied together; page sizes are limited to 100. `GET /api/locations` returns the location hierarchy. `GET /api/ads` accepts the same geographic filters. A structured location takes precedence over coordinates for ad targeting when both are supplied. Approved reviews of unpublished agents are not exposed.

The homepage has one search bar: `q` matches an agent name, agency, service-area name or service-area county. Location and nearby-radius controls live in the sidebar (behind Filters on mobile), with removable active-location indicators. Search uses text matching, not natural-language parsing; existing explicit API location filters remain supported.

Location discovery now has a persistent desktop sidebar and an expandable mobile filter view. Selecting a county or child area immediately narrows results; breadcrumbs and Back let visitors move up, and All Kenya clears the location. Agent cards distinguish directly listed service areas from wider ancestor coverage. Missing child data is shown explicitly, never invented.

Run `npm run db:migrate` for additive migrations `003-location-evidence` and `004-kisumu-locations`. Moderators can use Agent account > Locations to add sub-counties, towns and neighborhoods under existing parents. Each moderator addition requires a source URL and confirmation of the name/parent relationship; the source and creating moderator are stored privately in `location_evidence`. The server validates hierarchy order, derives the county from the parent, rejects sibling duplicates and enforces moderator access, CSRF and rate limiting. Existing locations are unchanged; editing/deleting locations is not part of this milestone. The sourced seed adds only Kisumu > Kisumu West > Maseno, based on Plate 13 in the [Kisumu CIDP III 2023-2027](https://www.kisumu.go.ke/wp-content/uploads/KISUMU-CIDP-III-2023-2027.pdf); seed provenance is recorded in the migration rather than attributed to a moderator. No agents are reassigned to these new locations. Rent/Buy and property specialties remain planned.

## Database checks

Run `npm test` for query validation. After importing the SQL Server schema and running migrations, run `npm run test:db`. This integration check creates temporary agents, reviews, and ads in the configured database, verifies hierarchy matching, pagination, approved ratings, nearby results and geographic ads, and removes its records afterward. Use a local development database.

## Agent accounts and profile approvals

Migration `002-onboarding` adds users, persistent sessions, profile ownership, publication states and an audit log. Existing agent records and IDs are preserved; existing published profiles stay published and are not automatically assigned to a user.

Choose Agent account to register or sign in. Passwords must contain 12–128 characters and are hashed with salted scrypt (N=32768, r=8, p=1). Cookies are HttpOnly, SameSite=Lax, with an eight-hour expiry; login and registration regenerate sessions. Write requests require a session-bound CSRF token, and registration/login attempts are rate-limited. Sessions are held in the selected database, not in browser storage. `NODE_ENV=production` or `SESSION_COOKIE_SECURE=true` requires HTTPS for session cookies. Keep `SESSION_SECRET` private and stable across restarts; changing it invalidates existing signed cookies.

New profiles start as unpublished drafts. Agents can edit their name, agency, biography, public contacts, optional office coordinates and up to 50 service areas. A contact number and at least one service area are required before submission. Saving changes to an approved profile unpublishes it and requires resubmission. Concurrent edits and approvals use profile versions and database transactions. Changing the agent name resets identity verification to unverified.

Register the intended moderator account, then run `npm run moderator:promote -- email@example.com` locally. This changes only that existing account's role; no moderator account or password is seeded. Its Agent account screen includes the approval queue. Moderators can approve pending profiles or reject them with feedback, but cannot moderate their own profiles. Publication approval never grants identity verification or changes review ratings. Actions are recorded in `profile_actions`.

Run `npm run test:accounts` for registration, login, CSRF, session revocation, ownership, profile versioning, rejection/resubmission and approval integration tests. The test uses temporary accounts and profiles and removes them afterward. Use the local development database.

Account recovery, email verification, credential-document submission, full dispute/appeal workflows and session administration remain future milestones. Expired sessions cannot authenticate; database sessions are cleaned when sessions are saved.

### Local approval fixtures

After migrations, run `npm run db:seed:agents` to add five fictional profiles across Nairobi, Kisumu, Nakuru, Uasin Gishu and Mombasa. They start pending and unpublished, with test-data biographies, no contact details, no login accounts, no reviews and no identity verification. The script refuses production mode and non-local database hosts. It is repeatable and preserves existing fixture statuses rather than resetting approved profiles. These fixtures bypass the normal submission contact requirement only for local queue testing; real account submissions still require a contact number. Approve or reject them from the moderator account's Approval queue. Remove these test profiles before deploying or copying the database into a real service.

## Production build

The directory uses locally bundled Inter, compact agent tiles, white/light-gray surfaces and teal actions. Biographies and approved reviews open under Profile details; sponsorship remains separate. Run `npm run test:ui` with the built server at `http://localhost:3001` (or set `UI_BASE_URL` to another running instance). The browser checks use installed Microsoft Edge, browser-only agent fixtures, four viewport widths and screenshots in ignored `test-results/`.

Run `npm run build`, then `npm start`. Express serves the compiled React frontend from `dist/` alongside the API. Keep your local `.env` configured for the database. Commit `package-lock.json` for reproducible dependency installation; generated `dist/` files are ignored.

## Installable app (PWA)

The production build includes a web app manifest, app icons, and a Workbox service worker. Supported browsers offer installation; the header shows Install AgentTrust when an install prompt is available. On iPhone/iPad, use Safari's Share menu and Add to Home Screen. Installation depends on browser support. Production requires HTTPS; localhost is supported for local testing.

Test installation and offline fallback with `npm run build` and `npm start`, after stopping any development server on the same port (or selecting another `PORT`). Service workers are disabled in `npm run dev` so cached files do not interfere with hot reload. After visiting the built app online and allowing the service worker to activate, disconnect and reload to see the offline screen. The open app also hides agent results when the browser reports it is offline and refetches upon reconnection.

Only static assets, icons, and the offline page are cached. Navigation and all `/api/` requests are network-only; API responses carry `Cache-Control: no-store`. Reviews, verification status, listings, advertisements, and precise search coordinates are not stored in service-worker caches. An Update available button activates a new worker and reloads the app. Run `npm run test:pwa` to validate the built manifest, PNG icons, and generated caching rules. Run `npm run icons:generate` to regenerate icons from the source artwork.

## Important limitations
- Public discovery APIs remain read-only. Agent profile writes require authentication, CSRF protection and ownership; publication requires moderator approval. Review submission is not available yet.
- Browser location is permission-based and requires HTTPS (except localhost). Nearby search uses agent coordinates; manual location searches use service areas.
- Ads are labeled Sponsored and cannot change agent reputation.
- Do not treat a verified badge as proof of safety until a documented verification process exists.
- Add pagination, audit logs, image validation, privacy policy and abuse handling before production.
