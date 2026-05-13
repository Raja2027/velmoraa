# velmoraa Android

This folder is reserved for the native Kotlin Android app.

## Direction

The Android app should use the existing FastAPI backend first. The first mobile version should focus on reaching feature parity with the current web app, then add mobile-native features like reels, filters, voice calls, and video calls.

## Proposed Stack

- Kotlin
- Jetpack Compose
- Material 3
- Retrofit or Ktor Client
- Kotlinx Serialization
- Coil
- Media3/ExoPlayer
- CameraX
- WebRTC
- WebSockets
- Room for local cache
- DataStore for settings/session state

## Suggested Package Areas

```text
app/
  data/
    api/
    models/
    repository/
  domain/
  ui/
    auth/
    feed/
    profile/
    create/
    messages/
    notifications/
    face_search/
    reels/
    calls/
  core/
    navigation/
    media/
    session/
```

## First Milestone

- Login/register
- Session persistence
- Home feed
- Profile page
- Post detail
- Like/comment
- Image/video rendering
- Create post
- Notifications
- Messages list and chat

## Later Milestones

- Reels feed
- Camera filters
- Effects
- Voice calls
- Video calls
- Live presence
- Push notifications

