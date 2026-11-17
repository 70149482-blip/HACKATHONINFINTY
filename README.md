# NovaWorks Project CRM - AI Meeting to Project CRM

A simple Project Management CRM for NovaWorks Technologies. The administrator pastes a meeting transcript, the AI creates the projects and tasks (managers, developers, deadlines, estimated hours), and everything is saved. Each user only sees the work they are allowed to see.

## Team
- Team name: **FILL IN: your team name**
- Four members and responsibilities: **FILL IN: name and role of each of the 4 members**
- Repository: **FILL IN: your GitHub URL**

## What Works
All minimum features are complete:
- Login / logout with the ten supplied demo accounts (no signup, as allowed).
- Admin home with all project cards and **Create from Transcript**.
- Read-only team directory (names, roles, specializations, skills).
- Project list and project detail (client, manager, deadline, tasks).
- Task rows with title, description, assigned agent, deadline, estimated hours.
- Manager view (only their projects) and agent **My Tasks** view (only their tasks and the related projects).
- Saved records in a database (they survive a refresh and a server restart).
- AI conversion with loading state, success result, and clear errors. If the AI result has a missing or invalid required field, **nothing is saved**, the problems are listed, and the admin can edit the result and click **Revalidate and save**.
- All-or-nothing save using a database transaction. The button is disabled while processing, and the server also rejects a second request from the same admin while one is running.
- Access rules are enforced **on the server for every request**, not only by hiding buttons.

Not included (not required): signup, forgot password, user management screens, cost calculation, progress monitoring, editing projects/tasks.

## Technology Stack
- Frontend: plain HTML, CSS and JavaScript (no build step), served by the backend
- Backend: Node.js 18 or newer with Express 4
- Database: SQLite (file database through `better-sqlite3`, created automatically)
- AI: Anthropic Claude API (default model `claude-sonnet-5-5`, configurable)
- Authentication/session approach: email + password checked against a bcrypt hash; a signed JWT stored in an `httpOnly` cookie. The user and role are always read from the database using that cookie, never from anything the browser sends.

## Links
- Live application: **FILL IN: URL, or write "Not deployed"**
- Demo video: **FILL IN: accessible recording URL (required because the database is local)**

## Requirements
- Node.js 18 or newer (check with `node -v`) and npm
- An Anthropic API key (https://console.anthropic.com/)
- Internet access (the AI call goes to `api.anthropic.com`)
- No separate database server is needed

## Run Locally
Everything runs as one process on one port. You need only one terminal, and it must stay open.

1. Clone this repository and enter its directory:
   ```sh
   git clone <YOUR_REPOSITORY_URL>
   cd <YOUR_PROJECT_DIRECTORY>
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Copy the example environment file:
   ```sh
   cp .env.example .env
   ```
   (Windows PowerShell: `copy .env.example .env`)
4. Open `.env` and set `ANTHROPIC_API_KEY` to your key and `SESSION_SECRET` to any long random text.
5. The database is created automatically (`data/novaworks.db`). No manual database step.
6. Tables are created automatically on every start (safe to repeat).
7. Seed the ten demo users (optional, because `npm start` also does it; re-running never duplicates users):
   ```sh
   npm run seed
   ```
8. Start the app:
   ```sh
   npm start
   ```
   Open http://localhost:3000 in your browser.

## Environment Variables
| Variable | Purpose | Where configured |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | AI provider credential | backend only (`.env`) |
| `ANTHROPIC_MODEL` | AI model name (default `claude-sonnet-5-5`) | backend |
| `SESSION_SECRET` | Signs the login cookie | backend |
| `DB_PATH` | SQLite file location (default `./data/novaworks.db`) | backend |
| `PORT` | Port to listen on (default `3000`) | backend |
| `COOKIE_SECURE` | Set `true` only when served over HTTPS | backend |

`.env.example` contains placeholders only. `.env` and `data/` are in `.gitignore`. No secret is ever sent to the browser.

## Demo Login Accounts
Fictional identifiers, not real mailboxes. The seeder (`npm run seed`, also run automatically on `npm start`) creates them and sets the password to `Demo123!`.

| Role | Name | Demo email | Password |
| --- | --- | --- | --- |
| Admin | Admin | admin@novaworks.example | Demo123! |
| Manager | Ayesha Khan | ayesha@novaworks.example | Demo123! |
| Manager | Bilal Ahmed | bilal@novaworks.example | Demo123! |
| Manager | Hina Malik | hina@novaworks.example | Demo123! |
| Agent | Ali Raza | ali@novaworks.example | Demo123! |
| Agent | Hamza Shah | hamza@novaworks.example | Demo123! |
| Agent | Sara Noor | sara@novaworks.example | Demo123! |
| Agent | Usman Tariq | usman@novaworks.example | Demo123! |
| Agent | Zain Abbas | zain@novaworks.example | Demo123! |
| Agent | Maryam Asif | maryam@novaworks.example | Demo123! |

The login page also has quick-fill buttons for these accounts.

## How Judges Can Test
1. Log in as `admin@novaworks.example`; open **Create from Transcript**.
2. The supplied transcript is in `transcripts/meeting_transcript.txt`. Click **Load supplied transcript** to paste it automatically (or paste the text yourself).
3. Click **Create from Transcript**; expect three projects and twelve tasks (about 10 to 40 seconds).
4. Open **UrbanCart Website**: manager Ayesha, deadline 20 Oct 2026, four tasks, 40 hours.
5. Log out and log in as Ayesha: only UrbanCart appears.
6. Log in as Ali: **My Tasks** shows only his three UrbanCart tasks.
7. Log in as Hamza: his two API tasks span UrbanCart and QuickServe.
8. While logged in as Ali or Ayesha, try opening a project that is not theirs (for example by pasting another project's `#/project/<id>` link): the app shows "Project not found". The API (`/api/projects/<id>`) returns 404 too.
9. Refresh the page: all data remains.
10. Edit the transcript (for example change the QuickServe integration estimate to 12 hours and the date to 23 October) and create again to see the changed values come through the AI.

**Resetting between tests:** as admin, click **Delete generated projects and tasks** on the Create from Transcript page, or run `npm run reset`. Both delete projects and tasks only; the ten users are kept. Create from Transcript always adds new projects, so reset first to avoid duplicates.

## Automated Tests
```sh
npm test
```
Runs 8 tests against a temporary database with a **mocked** AI reply (no API key needed): seeding, login, admin-only creation, 3 projects / 12 tasks / 40-46-38 hours, per-role access, 404 on other people's projects, all-or-nothing save on bad AI output, correction and revalidation, and reset.

## Deployment Details
- Deployment status: **FILL IN: Live / Local only**
- Frontend host: same as the backend (the backend serves the frontend)
- Backend host: **FILL IN: e.g. Render / Railway, URL**
- Database: SQLite file (local). See limitation below for hosting.
- Deployed branch/commit: **FILL IN**

### How We Deployed (if you deploy)
1. No frontend build is needed; the backend serves `public/`.
2. Create a Node web service from the repository. Build command: `npm install`. Start command: `npm start`.
3. Set the environment variables above on the platform (names only here: `ANTHROPIC_API_KEY`, `SESSION_SECRET`, `COOKIE_SECURE=true`, optionally `ANTHROPIC_MODEL`, `DB_PATH`).
4. Attach a persistent disk and point `DB_PATH` to it (for example `/var/data/novaworks.db`), otherwise data is lost on every redeploy.
5. Tables and the ten demo users are created automatically on start.
6. Frontend and backend share one origin, so no CORS or API URL setting is needed.
7. Judges log in with the accounts above and use **Create from Transcript**.

If the project is local only, state that here and provide the demo video.

## Known Limitations
- Uses SQLite, not a hosted database, so the extra deployment marks for a hosted database (for example Aiven PostgreSQL) are not claimed.
- AI conversion needs a valid API key and internet. A quota or network problem shows a clear error and saves nothing.
- Creating from the same transcript twice creates duplicate projects (use the reset button first).
- Editing created projects/tasks is not implemented (optional in the challenge).

## Submission Summary
- Source repository: **FILL IN**
- Live link or local demo video: **FILL IN**
- Setup and seed commands: documented above (`npm install`, `npm run seed`, `npm start`)
- Demo login accounts: documented above
- Features completed: login/logout, admin transcript creation, team directory, projects and tasks, manager and agent views, role-based access on the server, persistence
