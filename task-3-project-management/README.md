# CodeAlpha Projects - Task 3

A full-stack collaborative project management application. Task 1 (e-commerce) and Task 2 (social) remain separate projects.

## Run locally

Requires Node.js 24 or later. SQLite is included with Node; no database service is needed.

```sh
npm install
npm run build
npm start
```

Open http://localhost:3200. The initial sign-in screen includes **Explore demo workspace**. To work privately, create an account instead.

## Features

- Registration, sign-in and sign-out with hashed passwords and revocable, HTTP-only cookie sessions.
- Private group projects, project-owner controls and membership by existing account email.
- Kanban board with drag-and-drop between statuses, list view and month calendar.
- Task creation, editing, deletion, assignments, priorities, labels, due dates and checklists.
- Task conversations, personal task view, notifications and read/unread state.
- Socket.IO project updates scoped to authenticated members.
- Optimistic version checks prevent silent overwrites from concurrent task edits.
- Persistent SQLite database, foreign keys, atomic writes and ownership checks.
- Responsive navigation and task drawer, keyboard controls, reduced-motion support and a Three.js animated sign-in scene.
- Workspace-wide search, project search, assignee/priority filters and sorting by due date, priority or creation time.
- Full-width workspace with collapsible projects navigation and a project overview showing progress, deadlines and members.

## Collaborating

1. Each teammate creates an account on the same running server.
2. The project owner opens **Invite** and enters the teammate's registered email.
3. The project appears for that teammate immediately. All project members can edit tasks and comment.

This is direct membership, not an outgoing email invitation. No email service is configured. New personal accounts have no access to demo or other users' private projects unless added by an owner.

## Demo accounts

The demo is seeded once into an empty database. It includes three fictional projects and public demonstration accounts:

| Email | Password |
| --- | --- |
| hamza@demo.codealpha.test | DemoPass123! |
| sara@demo.codealpha.test | DemoPass123! |
| ali@demo.codealpha.test | DemoPass123! |

Do not put private information in the shared demo. Its dates are relative to first initialization. These credentials are demonstration-only, not real user credentials.

## Architecture

- `server.js`: Express REST API, auth, SQLite schema and seeds, Socket.IO rooms.
- `public/app.js`: browser application and views.
- `public/styles.css`: responsive layout and visual system.
- `public/scene.js`: Three.js scene with pointer response and pause control.
- `data/projects.sqlite`: generated runtime data, excluded from source control.
- `tests/api.test.js`: isolated integration suite, never mutates the normal database.
- `scripts/build.js`: copies installed browser libraries into `public/vendor`.
- `scripts/package.js`: creates a clean GitHub-ready source folder and ZIP.

## Verification

```sh
npm test
```

Tests cover registration/login/logout, project creation, member-only access, owner-only membership/deletion, assignment, task updates, optimistic concurrency, invalid dates, comments, notifications, live WebSocket delivery, cross-origin mutation rejection, persistent reads and deletion.

## Configuration and deployment

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3200` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address; use `0.0.0.0` in a container |
| `DB_PATH` | `data/projects.sqlite` | SQLite file on persistent storage |
| `COOKIE_SECURE` | unset | Set to `true` behind public HTTPS |

Use an always-on Node.js 24 host with WebSocket support and a persistent volume. Build with `npm ci && npm run build`, start with `npm start`, and mount the database volume at the configured `DB_PATH`. A Dockerfile is included. Configure HTTPS on the hosting provider.

**This is not a static Netlify upload.** Netlify's ephemeral function filesystem cannot persist this SQLite database and its functions do not host this Socket.IO server. Public deployment requires the host above, or a deliberate conversion to managed cloud storage and a hosted real-time service. No public Task 3 deployment is included yet.

Before production use with sensitive data, add verified email and recovery, distributed rate limiting, backups, observability and an appropriate data retention policy. Current authentication throttling is per-process; this app is intended for a single persistent Node instance.

## GitHub submission

Run `npm run package`. Upload the generated **task-3-project-management** folder to the existing `codealpha_tasks` repository, alongside the previous tasks. Do not upload `node_modules`, the database, caches or server logs. Submit that folder's GitHub URL for Task 3.

## Visual assets

Fonts: Inter and IBM Plex Mono via Google Fonts. Icons: Lucide. Sample photography: Unsplash. The 3D scene is generated locally with Three.js. Vendor libraries are local after the build; sample photography and fonts require internet access and have layout-safe fallbacks. On mobile, the board uses status tabs to display one complete column at a time.
