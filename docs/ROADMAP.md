# velmoraa Roadmap

## Phase 1: Clean Monorepo

- Keep backend and web frontend in one GitHub repo.
- Add a common README for presenting the project.
- Keep generated files, local media, and secrets out of Git.
- Preserve the current web deployment path.

## Phase 2: Stabilize Backend API

- Standardize response shapes for Android and web.
- Add API docs for auth, feed, posts, profiles, messages, notifications, media, and face search.
- Tighten CORS for production domains.
- Add stronger validation and consistent error handling.
- Add pagination for feed, profile posts, messages, and notifications.

## Phase 3: Kotlin Android MVP

- Create Android project with Kotlin and Jetpack Compose.
- Implement auth, session, feed, profile, post detail, create post, notifications, and messages.
- Use existing backend routes first.
- Add offline-friendly image/video caching.

## Phase 4: Reels and Camera

- Add vertical video feed.
- Use Media3/ExoPlayer for playback.
- Add CameraX recording.
- Upload recorded videos to existing backend media routes.

## Phase 5: Filters and Effects

- Add camera preview filters.
- Add image/video effects pipeline.
- Decide whether heavy effects run on-device or server-side.

## Phase 6: Voice and Video Calls

- Add WebRTC signaling routes.
- Add call state over WebSocket.
- Add voice call UI.
- Add video call UI.
- Add missed call and call notification handling.

## Phase 7: Production Hardening

- Rate limits.
- Report/block flows.
- Better privacy controls.
- Push notifications.
- Background upload reliability.
- Observability and logs.

