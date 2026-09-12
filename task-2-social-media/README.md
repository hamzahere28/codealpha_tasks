# CodeAlpha Social Media Platform

Task 2 full-stack social media app with profiles, posts, comments, likes, and follow/unfollow.

**Live demo:** https://codealpha-social-platform-5574484.netlify.app

**Task 1 demo:** https://codealpha-ecommerce-store-5574484.netlify.app

## Features

- User registration and login
- Profile cards with follower/following counts
- Create posts with a mood label
- Like and unlike posts
- Add comments to posts
- Follow and unfollow users
- Persistent Netlify Blobs storage in production; JSON-file storage for local development
- Professional responsive UI with animated 3D visual styling

## Social Club Redesign

- New DM Sans / Space Grotesk typography, compact navigation, responsive feed and community footer.
- Interactive Three.js sculpture with pause/play and reduced-motion support; libraries are served locally.
- Search posts and people, filter by topic, view followed creators, and sort by popularity.
- Private account bookmarks that persist across reloads.
- Image attachments (PNG, JPEG, WebP up to 550 KB), expandable replies and copyable post links.
- Editable profiles, owner-only post deletion with confirmation, and server-side sign-out.
- Empty states, input validation, loading protection and accessible native dialogs.

## Verification

Run `npm test` for the isolated API integration checks. Tests use a temporary copy of the database and do not change the real community data.

Production uses Netlify Functions and a site-wide Netlify Blobs store. Strongly consistent reads and conditional writes protect concurrent updates. Login tokens are stored as SHA-256 digests with a seven-day expiry; sign-out revokes the token. Passwords are salted and hashed. The clean demo seed contains no personal accounts or active sessions.

Local development creates `data/db.json` from `data/seed.json` on first run. This file is private and ignored by Git. Google Fonts and the editorial Unsplash image require internet access.

## Demo Accounts

- `hamza@example.com` / `password123`
- `areeba@example.com` / `password123`
- `sara@example.com` / `password123`

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3100`.

## Build and Deploy

```bash
npm ci
npm test
npm run build
```

For a Git-connected Netlify project, use these settings:

- Base directory: `task-2-social-media` when this project is inside the `codealpha_tasks` repository.
- Build command: `npm run build`
- Publish directory: `public`
- Functions directory: `netlify/functions`

`netlify.toml` supplies the routing and functions configuration. Netlify provides the Blobs connection at runtime; no account token belongs in frontend code or the repository. For manual API releases, `npm run deploy:netlify` reads a deployment token from the environment or a hidden terminal prompt.

## GitHub Submission

1. Open your existing `codealpha_tasks` repository.
2. Choose **Add file > Upload files**.
3. Drag the prepared **task-2-social-media** folder into the upload area. Preserve the folder, so Task 1 stays separate.
4. Set the commit message to `Add Task 2 social media platform` and commit.
5. Put this live demo URL in the repository About section. Submit the repository URL in the task submission form.

Upload the source folder, not a ZIP. Exclude `node_modules`, `.npm-cache`, `.netlify`, `.deploy`, `.env`, logs, and private `data/db.json`.
