# Developer guide

Start with the [README](../README.md) for installation and local credentials.
This service uses Express 4 and JavaScript ES modules. `npm start` runs `src.js`.
There is no transpiler or separate build step.

## Where to make a change

| File                | Responsibility                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src.js`            | Startup, CORS, admin authentication, dashboard, legacy assessments, route registration and final error handler |
| `lib/http.js`       | Async error forwarding and the single-process mutation queue                                                   |
| `lib/store.js`      | First-run database seed, loading, defaults and atomic file replacement                                         |
| `platform.js`       | Learner authentication, user management, stories, discussions, coins and course progress                       |
| `content.js`        | Admin course/test authoring, question validation, uploads and media serving                                    |
| `course-access.js`  | Shared course ownership and free Premium eligibility rules                                                     |
| `study.js`          | Profession-based practice, test attempts, restarting and recommendations                                       |
| `extras.js`         | Doctor-owned screenings, surveys and configurable mini-games                                                   |
| `analytics.js`      | Learning events, question results, weak-topic plans and reports                                                |
| `account-safety.js` | Registration, deletion, reporting, blocking and policy details                                                 |
| `categories.js`     | Category taxonomy stored separately in `categories.json`                                                       |
| `youth-health.js`   | External Youth Health membership application/list integration                                                  |
| `test/`             | Isolated integration tests and pure-function analytics tests                                                   |
| `seed-*.js`         | Optional sample-content scripts; these change the server they connect to                                       |

Use the [route index](ROUTES.md) to find the exact handler. Most route modules
receive dependencies rather than opening their own database. `platformRoutes`
creates learner helpers and registers the study, analytics, extras and safety
modules. Keep route-registration order when moving handlers.

## How a request works

1. CORS and JSON parsing run first.
2. The mutation queue serializes POST/PATCH requests, except admin login and uploads.
3. The route's `auth`/`admin` middleware verifies an admin token, or `account`
   verifies a learner session. Both re-read the active user from storage.
4. The handler validates input, reads data, changes it and awaits `save(data)`.
5. Errors with a `status` property return that status and message. Unexpected
   errors return a generic 500 response. Async handlers are forwarded to this
   error handler by `installAsyncHandlers`.

Protected requests send `Authorization: Bearer <token>`. Admin login is
`/api/auth/login`; learner login is `/api/account/login`. Logging in does not
replace authorization on subsequent requests. Use the route's middleware, not
caller-supplied IDs or roles, to identify who is acting.

`db()` loads and normalizes the base database. The `read()` helper in
`platform.js` also supplies defaults for platform collections. Helpers such as
`accountView` omit credentials and build the client-facing account response.
Do not return raw users or question answer keys in public catalog responses.

## Storage model and important rules

- `db.json` holds users, courses, tests, assessments, discussions, stories and
  other feature collections. Categories have a separate file/store.
- `progress[userId][courseId]` tracks course completion; `practice` tracks test
  practice. See their handlers for the current JSON shape.
- `ledger` records coin movements; balance is derived from these entries.
  Reward references prevent duplicate credit. Keep those checks on retries.
- `purchases` records course access obtained with earned coins. Premium is a
  free contribution award, not a paid subscription. The legacy `paymentStatus`
  field must not decide Premium access.
- `assessments` includes screenings with `doctorId`. The account screening API
  filters by the authenticated doctor. The legacy admin assessments API remains
  available separately.
- Anonymous discussion identity remains server-side. `replyOwners` and original
  reply indices support moderation; never expose hidden account identities.
- `learningEvents` stores learning evidence; no historical events can be inferred
  for activity that was never recorded.

Writes use a temporary file plus rename. This prevents a partially written final
file, but does not make the system a multi-process database. The in-memory queue
only coordinates this one Node process. Do not run multiple replicas or write
these files from another process. New mutation HTTP methods require corresponding
queue and async-handler support in `lib/http.js`.

Uploaded media is stored under `UPLOAD_DIR` or `DATA_DIR/uploads`, and URLs are
currently public. Tokens do not protect a known media URL. Do not commit runtime
records, credentials, patient information or uploads.

## Changing a feature

1. Find its handler in the route index and read the related integration test.
2. Validate input before mutation. Preserve ownership, access and reward checks.
3. Extend the corresponding test using its temporary database/mock upstream.
   Never point tests or seed scripts at production.
4. Update the route index if routes change; update this guide if responsibilities move.
5. Run `npm run format`, `npm run format:check` and `npm test`.

The tests launch isolated API processes on ports 4192–4197 (see individual files
for their configuration). If a test cannot start, check for a conflicting local
server. Test startup failures can also mean restricted local socket permissions.
CI installs the lockfile dependencies, checks formatting and runs all tests.

## Troubleshooting

- Missing JWT secret or admin password: run `npm run setup` once, then inspect
  your ignored `.env`. Existing users are not reset by changing seed credentials.
- Browser CORS error: add the exact frontend origin to `ALLOWED_ORIGINS` and
  restart. Do not use a wildcard as a substitute for configuration.
- 401: session is invalid/expired or the account is inactive/deleted. Sign in again.
- 403: inspect the required role, content access and ownership checks.
- Lost media after deploy: mount persistent storage and retain `UPLOAD_DIR`.
- External membership error: inspect `youth-health.js`; that service is separate
  from Youth Med authentication. Tests mock it to avoid real submissions.

Before production, review persistent backups, restore procedures, deletion and
retention policy, registration/login rate limiting, private media access, HTTPS
and operational moderation. This cleanup does not certify production readiness.
