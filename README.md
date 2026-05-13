# velmoraa

velmoraa is a full-stack social media product. The current version is a deployed web app with a FastAPI backend and a Next.js frontend. The next major phase is a native Kotlin Android app with reels, filters, effects, voice calls, and video calls.

This repository is a monorepo so the full project can be shown, developed, and deployed from one place.

## Repository Structure

```text
velmoraa/
  backend/        FastAPI API, PostgreSQL models, media storage, face search
  frontend-web/   Current Next.js web frontend
  android/        Kotlin Android app workspace placeholder and roadmap
  docs/           Product roadmap and implementation notes
  docker-compose.yml
```

## Current Product

- User registration and login with email/password and Google OAuth
- Onboarding with username, profile picture, demographics, and face-search opt-in
- Home feed with posts, likes, comments, and real timestamps
- User profiles with private account support
- Post creation with image/video upload
- Post deletion for post owners
- Account deletion from settings
- Stories with view and delete support
- Notifications for likes, comments, follows, and face match events
- Direct messaging
- Find by Face discovery
- Google Cloud Storage/S3 media handling through a backend proxy
- Responsive web layout with mobile navigation

## Planned Native Mobile App

The Android app will be built in Kotlin and will use the existing backend API first. Backend rewrites are not needed before mobile work starts.

Planned stack:

- Kotlin
- Jetpack Compose
- Retrofit or Ktor Client
- Coil for image loading
- Media3/ExoPlayer for video and reels
- CameraX for capture, recording, and filters
- WebRTC for voice and video calls
- WebSockets for chat, call signaling, typing, and live updates

Planned mobile features:

- Login/register/onboarding
- Feed, profiles, posts, likes, comments
- Upload image/video posts
- Stories
- Messages and notifications
- Find by Face
- Reels
- Camera filters and effects
- Voice calls
- Video calls
- Realtime presence and call status

## Tech Stack

### Backend

- FastAPI
- Uvicorn
- SQLAlchemy
- PostgreSQL
- pgvector
- DeepFace
- OpenCV headless
- Google Cloud Storage
- boto3 for S3-compatible fallback
- WebSockets

### Web Frontend

- Next.js 16 App Router
- React 19
- TypeScript
- NextAuth
- Tailwind CSS

## Local Development

Start the database:

```bash
docker compose up -d
```

Start the backend:

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Start the web frontend:

```bash
cd frontend-web
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Environment Variables

### Web Frontend

Create `frontend-web/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_PROXY_GCS_MEDIA=true
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace-with-a-long-random-secret
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
```

### Backend

Create backend environment variables locally or in the deployment platform:

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
JWT_SECRET=replace-with-a-long-random-secret
GCS_BUCKET_NAME=your-gcs-bucket
GCS_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
MEDIA_DELIVERY_MODE=proxy
```

Optional S3-compatible variables:

```env
S3_BUCKET_NAME=your-bucket
S3_ENDPOINT_URL=https://storage.googleapis.com
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION_NAME=us-east-1
```

## Deployment

Current deployment model:

- Web frontend: Render
- Backend API: Hugging Face Spaces
- Media: Google Cloud Storage
- Database: PostgreSQL with pgvector

For Render, set the root directory to `frontend-web`.

For Hugging Face Spaces, deploy the contents of `backend/` with the existing Dockerfile and required secrets.

## Important API Routes

- `GET /health`
- `GET /media/{key}`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/sync`
- `POST /onboarding`
- `GET /feed`
- `POST /posts`
- `GET /posts/{post_id}`
- `DELETE /posts/{post_id}`
- `POST /posts/{post_id}/like`
- `POST /posts/{post_id}/comment`
- `GET /users/{username}`
- `GET /users/{username}/posts`
- `POST /users/{username}/follow`
- `GET /notifications`
- `GET /notifications/unread-count`
- `POST /messages/send`
- `GET /messages/{username1}/{username2}`
- `WebSocket /ws/{username}`

## Media Handling

Uploads go to Google Cloud Storage or S3-compatible storage when configured. The backend returns proxied paths like `/media/<key>`, and the frontend resolves all media with `mediaUrl()`.

This avoids broken images when buckets are private or when a deployment platform blocks direct storage URLs.

## Verification

Frontend:

```bash
cd frontend-web
npx tsc --noEmit
```

Backend:

```bash
cd backend
python -m py_compile main.py database.py models.py s3_utils.py face_utils.py
```

## Security Notes

- Do not commit `.env`, `.env.local`, service account JSON, OAuth secrets, JWT secrets, or access tokens.
- Local uploaded media is ignored by Git.
- Rotate any token that was accidentally exposed in a Git remote URL or terminal output.
- Keep `MEDIA_DELIVERY_MODE=proxy` when the storage bucket is private.

