# Route index

Paths below include `/api`. Uploaded files are also served publicly at `/uploads` by `content.js`. See linked handlers for request validation and response fields.

Access labels describe explicitly registered middleware; handlers may perform additional checks.

## [src.js](../src.js)

| Method | Path               | Access                  |
| ------ | ------------------ | ----------------------- |
| GET    | `/api/health`      | Public / handler checks |
| POST   | `/api/auth/login`  | Public / handler checks |
| GET    | `/api/dashboard`   | Admin                   |
| GET    | `/api/assessments` | Admin                   |
| POST   | `/api/assessments` | Admin                   |

## [platform.js](../platform.js)

| Method | Path                                                  | Access                  |
| ------ | ----------------------------------------------------- | ----------------------- |
| POST   | `/api/account/login`                                  | Public / handler checks |
| GET    | `/api/account/me`                                     | Signed-in account       |
| POST   | `/api/account/check-in`                               | Signed-in account       |
| GET    | `/api/users`                                          | Admin                   |
| POST   | `/api/users`                                          | Admin                   |
| PATCH  | `/api/users/:id`                                      | Admin                   |
| GET    | `/api/stories`                                        | Admin                   |
| GET    | `/api/public/stories`                                 | Public / handler checks |
| POST   | `/api/stories`                                        | Admin                   |
| PATCH  | `/api/stories/:id`                                    | Admin                   |
| GET    | `/api/coins`                                          | Admin                   |
| PATCH  | `/api/coins/settings`                                 | Admin                   |
| POST   | `/api/coins/adjust`                                   | Admin                   |
| GET    | `/api/discussions`                                    | Admin                   |
| GET    | `/api/account/discussions`                            | Signed-in account       |
| POST   | `/api/account/discussions`                            | Signed-in account       |
| PATCH  | `/api/discussions/:id`                                | Admin                   |
| PATCH  | `/api/account/discussions/:id`                        | Signed-in account       |
| GET    | `/api/public/courses`                                 | Public / handler checks |
| GET    | `/api/account/courses`                                | Signed-in account       |
| POST   | `/api/account/courses/:id/purchase`                   | Signed-in account       |
| POST   | `/api/account/courses/:id/pre-test`                   | Signed-in account       |
| POST   | `/api/account/courses/:id/lessons/:lessonId/complete` | Signed-in account       |
| POST   | `/api/account/courses/:id/lessons/:lessonId/test`     | Signed-in account       |
| POST   | `/api/account/courses/:id/game`                       | Signed-in account       |
| POST   | `/api/account/courses/:id/exam`                       | Signed-in account       |

## [content.js](../content.js)

| Method | Path                                       | Access |
| ------ | ------------------------------------------ | ------ |
| POST   | `/api/uploads/video`                       | Admin  |
| POST   | `/api/uploads/image`                       | Admin  |
| GET    | `/api/tests`                               | Admin  |
| POST   | `/api/tests`                               | Admin  |
| PATCH  | `/api/tests/:id`                           | Admin  |
| GET    | `/api/courses`                             | Admin  |
| POST   | `/api/courses`                             | Admin  |
| PATCH  | `/api/courses/:id`                         | Admin  |
| POST   | `/api/courses/:id/lessons`                 | Admin  |
| PATCH  | `/api/courses/:courseId/lessons/:lessonId` | Admin  |
| PATCH  | `/api/courses/:id/pre-test`                | Admin  |
| PATCH  | `/api/courses/:id/test`                    | Admin  |

## [study.js](../study.js)

| Method | Path                               | Access                  |
| ------ | ---------------------------------- | ----------------------- |
| PATCH  | `/api/account/profile`             | Signed-in account       |
| GET    | `/api/public/practice`             | Public / handler checks |
| GET    | `/api/account/practice`            | Signed-in account       |
| POST   | `/api/account/practice/:id/start`  | Signed-in account       |
| POST   | `/api/account/practice/:id/answer` | Signed-in account       |
| GET    | `/api/public/surveys`              | Public / handler checks |
| GET    | `/api/surveys`                     | Admin                   |
| POST   | `/api/surveys`                     | Admin                   |
| PATCH  | `/api/surveys/:id`                 | Admin                   |
| POST   | `/api/account/surveys/:id`         | Signed-in account       |

## [extras.js](../extras.js)

| Method | Path                      | Access                  |
| ------ | ------------------------- | ----------------------- |
| GET    | `/api/account/screenings` | Signed-in account       |
| POST   | `/api/account/screenings` | Signed-in account       |
| GET    | `/api/games`              | Admin                   |
| GET    | `/api/public/games`       | Public / handler checks |
| POST   | `/api/games`              | Admin                   |
| PATCH  | `/api/games/:id`          | Admin                   |

## [analytics.js](../analytics.js)

| Method | Path                  | Access            |
| ------ | --------------------- | ----------------- |
| GET    | `/api/analytics`      | Admin             |
| POST   | `/api/account/events` | Signed-in account |

## [categories.js](../categories.js)

| Method | Path                     | Access                  |
| ------ | ------------------------ | ----------------------- |
| GET    | `/api/public/categories` | Public / handler checks |
| GET    | `/api/categories`        | Admin                   |
| POST   | `/api/categories`        | Admin                   |
| PATCH  | `/api/categories/:id`    | Admin                   |

## [account-safety.js](../account-safety.js)

| Method | Path                             | Access                  |
| ------ | -------------------------------- | ----------------------- |
| POST   | `/api/account/register`          | Public / handler checks |
| GET    | `/api/public/policy`             | Public / handler checks |
| GET    | `/api/policy`                    | Admin                   |
| PATCH  | `/api/policy`                    | Admin                   |
| POST   | `/api/account/delete`            | Signed-in account       |
| POST   | `/api/account/reports`           | Signed-in account       |
| POST   | `/api/account/blocks`            | Signed-in account       |
| GET    | `/api/account/blocks`            | Signed-in account       |
| POST   | `/api/account/blocks/:id/remove` | Signed-in account       |
| GET    | `/api/reports`                   | Admin                   |
| PATCH  | `/api/reports/:id`               | Admin                   |

## [youth-health.js](../youth-health.js)

| Method | Path                                  | Access                  |
| ------ | ------------------------------------- | ----------------------- |
| GET    | `/api/public/membership-options`      | Public / handler checks |
| GET    | `/api/youth-health-members`           | Admin                   |
| POST   | `/api/public/membership-applications` | Public / handler checks |
