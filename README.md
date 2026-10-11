# AgentTrust starter

Public directory MVP: search agents by name/agency/location, optional browser geolocation, approved reviews summary, approved sponsored advertisements. No login, review submission, verification workflow, payment processing or admin interface yet. Do not publicly launch until those workflows, privacy controls and moderation are implemented.

## Run locally (no hosting required)

Prerequisites: Node.js 22.12+, a running local SQL Server, and Microsoft ODBC Driver 18 for SQL Server. Windows authentication is the default.

1. Create a dedicated database: `sqlcmd -S localhost -E -C -b -Q "IF DB_ID('agenttrust') IS NULL CREATE DATABASE agenttrust"`.
2. Import the SQL Server schema: `sqlcmd -S localhost -E -C -b -d agenttrust -i sql/schema.sqlserver.sql`. The script can be rerun without duplicating seed locations.
3. Copy `.env.example` to `.env`. For the default local instance, use `DB_HOST=localhost`, `DB_NAME=agenttrust`, and `DB_AUTH=windows`. For a named instance, set `DB_INSTANCE` (for example, `SQLEXPRESS`) and omit `DB_PORT`. For SQL login authentication, use `DB_AUTH=sql` and supply `DB_USER` and `DB_PASSWORD`. Trusting a self-signed certificate is for local development only.
4. Run `npm install`, `npm run db:migrate`, and `npm run dev` in the project directory.
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

## Database checks

Run `npm test` for query validation. After importing the SQL Server schema and running migrations, run `npm run test:db`. This integration check creates temporary agents, reviews, and ads in the configured database, verifies hierarchy matching, pagination, approved ratings, nearby results and geographic ads, and removes its records afterward. Use a local development database.

## Production build

Run `npm run build`, then `npm start`. Express serves the compiled React frontend from `dist/` alongside the API. Keep your local `.env` configured for the database. Commit `package-lock.json` for reproducible dependency installation; generated `dist/` files are ignored.

## Installable app (PWA)

The production build includes a web app manifest, app icons, and a Workbox service worker. Supported browsers offer installation; the header shows Install AgentTrust when an install prompt is available. On iPhone/iPad, use Safari's Share menu and Add to Home Screen. Installation depends on browser support. Production requires HTTPS; localhost is supported for local testing.

Test installation and offline fallback with `npm run build` and `npm start`, after stopping any development server on the same port (or selecting another `PORT`). Service workers are disabled in `npm run dev` so cached files do not interfere with hot reload. After visiting the built app online and allowing the service worker to activate, disconnect and reload to see the offline screen. The open app also hides agent results when the browser reports it is offline and refetches upon reconnection.

Only static assets, icons, and the offline page are cached. Navigation and all `/api/` requests are network-only; API responses carry `Cache-Control: no-store`. Reviews, verification status, listings, advertisements, and precise search coordinates are not stored in service-worker caches. An Update available button activates a new worker and reloads the app. Run `npm run test:pwa` to validate the built manifest, PNG icons, and generated caching rules. Run `npm run icons:generate` to regenerate icons from the source artwork.

## Important limitations
- MVP read-only public API; adding reviews and agents must be protected by authentication, anti-spam checks, authorization and moderation.
- Browser location is permission-based and requires HTTPS (except localhost). Nearby search uses agent coordinates; manual location searches use service areas.
- Ads are labeled Sponsored and cannot change agent reputation.
- Do not treat a verified badge as proof of safety until a documented verification process exists.
- Add pagination, audit logs, image validation, privacy policy and abuse handling before production.
