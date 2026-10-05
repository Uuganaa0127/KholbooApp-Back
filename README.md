# Youth Med backend

Express API for the Youth Med learning app and React admin. This repository
contains the backend only; the Flutter app and React admin are separate projects.

## Local setup

Use Node.js 22 or newer and npm.

```sh
npm ci
npm run setup
npm start
```

Run setup once. It creates a private `.env` with a random signing secret and
admin password, and writes login details to `LOCAL-ACCESS.md` in this directory.
Both files are ignored by Git. Setup refuses to overwrite an existing `.env`.
On first startup the API creates its database and admin account. Changing
`ADMIN_PASSWORD` later does not reset an existing account's password.

Health check: `http://127.0.0.1:4100/api/health`.
Admin login: `POST /api/auth/login` with `email` and `password`.
Learner login: `POST /api/account/login` with `email` and `password`.

The React admin can proxy `/api` and `/uploads` to this service. Set Flutter's
`API_BASE_URL` to a reachable URL ending in `/api`, for example:

```sh
flutter run --dart-define=API_BASE_URL=http://127.0.0.1:4100/api
```

For Android emulator use `http://10.0.2.2:4100/api`. Physical devices need a
reachable host; release builds need HTTPS.

## Features

- Admin and learner authentication, account editing and membership status.
- Main courses, subcourses, video/image uploads, quizzes and final exams.
- Premium course access, progress, coin purchases and completion rewards.
- Tests, clinical cases, attempts, recommendations, surveys and mini-games.
- News stories, categories and discussion moderation.
- Coin settings, daily check-in and admin adjustments.
- Doctor-owned screening history and learning analytics.
- Youth Health membership application forwarding and published member listing.
  This integration does not provide shared Youth Health login.

Route implementations are in `src.js`, `platform.js`, `content.js`, `study.js`,
`extras.js`, `analytics.js`, `categories.js` and `youth-health.js`.

## Configuration and storage

See `.env.example`. `JWT_SECRET` needs at least 32 characters and initial
`ADMIN_PASSWORD` at least 12. `ALLOWED_ORIGINS` is a comma-separated allowlist of
web origins. `HOST` defaults to loopback and `PORT` defaults to 4100.

Data and uploads live in `data/` unless `DATA_DIR` is configured. They are runtime
records and must not be committed. This repository includes no local accounts,
patient records, uploaded media or production credentials. The tiny test video
in `test/fixtures` is a synthetic upload fixture.

This is a single-process, JSON-file storage implementation. Deploy with persistent
storage, backups and HTTPS; do not run multiple replicas against these files.
Production rollout still requires an operational and security review, including
retention/deletion workflows, rate limiting and upload handling.

## Verification

```sh
npm test
```

Tests create temporary databases and start isolated API processes. They cover
course/test authoring, answers, uploads, premium access, rewards, discussions,
categories, analytics, screening ownership and membership integration. Membership
tests use a mock upstream rather than submitting real applications.

## Optional sample content

With a local server running and its admin credentials in `.env`:

```sh
node seed-games.js
node seed-study-content.js
node seed-learning-cycle.js
```

These scripts create sample learning content. Review examples before using them
for clinical education. `seed-demo-content.js` additionally requires
`DEMO_ASSET_DIR` pointing to the separate Flutter app's assets directory; media
assets are not included here.

## Course video storage

Admin → Courses → add/edit subcourse → upload an MP4 or WebM (up to 250 MB),
then save the subcourse. The API returns an `/uploads/...` URL saved on that lesson.
The Flutter lesson player streams this URL and supports byte-range seeking.
Use MP4 with H.264 video and AAC audio for broad device compatibility.

By default files live under `DATA_DIR/uploads`. Set `UPLOAD_DIR` to an absolute
path on a persistent mounted disk if media should live separately from the JSON
database. Keep this disk across deployments and include it in backups. An
ordinary ephemeral hosting filesystem will lose uploads on redeploy. No cloud
bucket is provisioned by this setting. The `/uploads` route currently serves
files by URL publicly; private premium video delivery requires signed URLs or
an authenticated media gateway before production distribution.
