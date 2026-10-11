# AgentTrust — Product Context and Development Brief

## Vision
Build a location-aware, nationwide property-agent directory and marketplace for Kenya. Visitors discover agents and their contact information, evaluate credibility through transparent reputation indicators and community feedback, and see clearly labeled, location-targeted advertisements. The platform aims to reduce impersonation and fraudulent agent behavior; it must not claim to guarantee safety.

## Scope and audiences
- Geographic scope: all 47 Kenyan counties from launch; support county, sub-county, town, neighborhood and flexible service areas.
- Visitors: search agents, filter by location, read reviews and contact agents.
- Agents: register, manage profiles and service areas, submit verification materials, respond to reviews and manage advertising (future milestone).
- Administrators/moderators: verify identities, moderate content, investigate complaints and approve ads.

## Confirmed technical direction
- SQL Server for local development (user-confirmed); retain MySQL compatibility for a future migration. MySQL is not required to run locally.
- Node.js / Express REST API.
- React + TypeScript intended for the frontend, although the downloaded starter may be plain JavaScript. Check repository reality before changing it.
- Local-first development. cPanel was discussed but explicitly postponed; hosting provider is not currently a constraint.
- Browser Geolocation API for optional device location; allow manual selection instead.
- ORM: Prisma was proposed, not necessarily implemented. Inspect project before adopting.
- Tailwind CSS was proposed for UI, not necessarily implemented.

## Core features
1. Agent directory: names, images, phone, WhatsApp, agency affiliation, public contact details, service areas, verification badge/status and reviews.
2. Geographic discovery: nationwide search; filters by county, town and neighborhood; agents may serve multiple areas; nearby results when user grants location permission.
3. Community feedback: ratings, written reviews, commendations and complaints, with moderation and anti-abuse controls.
4. Reputation: explainable score based on substantiated evidence and quality feedback, distinct from identity verification. New agents should show insufficient data rather than a misleading low score.
5. Advertising: paid featured profiles, homepage placements and campaigns targeted by geography; clear sponsored labels and independent trust rankings.
6. Administration: agent approvals, credential verification, content moderation, complaint resolution, advertising approval and basic metrics.

## Location data design
Use normalized location records (county/sub-county/town/neighborhood as appropriate), a many-to-many agent service-area table and optional latitude/longitude for distance queries. Distinguish an agent's office point from the geographic areas they serve. Seed all 47 counties with verified names; don't invent comprehensive town/neighborhood data. Use spatial indexing or suitable coordinate filtering if needed; avoid assuming MySQL has PostGIS features.

## Trust model (proposal, not finalized)
Illustrative weighted components: verified customer feedback 40%, complaint resolution 25%, service reliability 20%, community commendations 15%. These are exploratory weights, not a validated fraud model. Avoid raw averages that unfairly favor few reviews; use confidence adjustments and display evidence/sample size. Serious complaints require review and an agent response/appeal process. Verification status is independently assessed. Never sell trust score improvements.

## Suggested entities
Users, Agents, Locations, AgentServiceAreas, Reviews, Complaints, Verifications, Advertisements, AdvertisementLocations, AdImpressions, AgentScores. Adapt names to actual existing schema and use migrations rather than destructive replacement.

## Suggested milestones
1. Audit existing starter; make local setup reliable, including MySQL schema, env template, seed data and API/UI smoke tests.
2. Agent registration/authentication, profile editing and multi-location service areas.
3. Reviews, commendations, moderation, identity verification and explainable reputation scoring.
4. Geolocation-based discovery and location-targeted advertising.
5. Admin dashboard, abuse prevention, observability, production hardening and eventual hosting.

## Product rules
- Never present fictional demo agents or ratings as verified real people.
- Sponsored results must be visibly labeled and separated from independent reputation signals.
- Keep public agent contacts distinct from private user information and credential documents.
- Minimize location retention, request consent for device geolocation and offer manual fallback.
- Design for nationwide coverage even if early seed data is limited.

## Immediate Codex instruction
Inspect the existing repository and report (a) current stack and working features, (b) gaps against this brief, (c) exact local startup instructions, and (d) a recommended first implementation milestone. Then proceed with the smallest safe implementation step.
