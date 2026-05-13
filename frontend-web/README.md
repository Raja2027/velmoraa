# velmoraa

velmoraa is a full-stack social media app inspired by modern photo sharing platforms. It includes user accounts, profiles, posts, stories, comments, likes, notifications, direct messages, private accounts, Google Cloud Storage media handling, and face-based discovery.

## Live Deployment

- Frontend: deployed on Render
- Backend API: deployed on Hugging Face Spaces
- Media storage: Google Cloud Storage, served through the backend media proxy

## Tech Stack

- Next.js 16 App Router
- React 19
- NextAuth for Google and credentials login
- TypeScript
- Tailwind CSS
- FastAPI backend
- PostgreSQL with pgvector
- DeepFace/OpenCV for face embeddings
- Google Cloud Storage or S3-compatible storage for media
- WebSocket support for messaging

## Main Features

- Account registration and login with email/password or Google OAuth
- Onboarding flow with username, demographics, profile picture, and facial search opt-in
- Profile pages with posts, follower/following stats, private account support, and settings access on mobile
- Feed with posts from followed users, likes, comments, and timestamps
- Post upload with image/video support
- Profile picture upload
- Post delete for post owners
- Account delete from settings
- Stories with view/delete support
- Notifications for likes, comments, follows, and face match events
- Direct messaging between users
- "Find by Face" discovery using uploaded image/video embeddings
- Media proxy for Google Cloud Storage URLs so images work reliably on Render/Hugging Face

## Project Structure

```text
frontend/
  src/
    app/
      api/auth/[...nextauth]/route.ts   NextAuth config
      page.tsx                          Home feed
      [username]/page.tsx               User profile and post modal
      messages/page.tsx                 Direct messages
      notifications/page.tsx            Notifications
      search-image/page.tsx             Find by Face
      settings/page.tsx                 Account settings
    components/
      Sidebar.tsx                       Desktop/mobile navigation
      StoriesBar.tsx                    Stories UI
    lib/
      api.ts                            API/media URL helpers
      time.ts                           Timestamp formatting
backend/
  main.py                               FastAPI routes
  models.py                             SQLAlchemy models
  database.py                           Database connection
  s3_utils.py                           GCS/S3/local media handling
  face_utils.py                         Face embedding/search helpers
```

## Frontend Environment Variables

Create `frontend/.env.local` for local development:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_PROXY_GCS_MEDIA=true
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace-with-a-long-random-secret
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
```

For Render, set the same variables in the Render dashboard. `NEXT_PUBLIC_API_URL` should point to the Hugging Face backend URL.

## Backend Environment Variables

Set these on Hugging Face Spaces or in a local `.env` file:

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

Start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## Deployment Notes

### Render Frontend

Use these settings:

- Root directory: `frontend`
- Build command: `npm install && npm run build`
- Start command: `npm run start`
- Environment: set all frontend variables listed above

### Hugging Face Backend

The backend is deployed from the separate Hugging Face Space folder:

```text
C:\Download\backend\enstagram
```

When backend files are changed in this workspace, copy the updated backend files into that folder before pushing the Space.

## Important API Routes

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
- `GET /media/{key}`

## Media Handling

Uploads are stored in Google Cloud Storage/S3 when configured. The backend returns proxied media paths such as `/media/<key>` so the frontend can display images and videos even when the storage bucket is private.

The frontend helper `mediaUrl()` also rewrites legacy `/uploads/...` and public Google Cloud Storage URLs through the backend proxy.

## Face Search

Users can opt in to facial discovery during onboarding. The backend stores pgvector embeddings and uses DeepFace/OpenCV to find visually similar users. Face search is opt-in and depends on the user's uploaded reference media.

## Verification

Useful checks before deployment:

```bash
cd frontend
npx tsc --noEmit
```

```bash
cd backend
python -m py_compile main.py database.py models.py s3_utils.py face_utils.py
```

On Windows, if `py_compile` cannot write to `__pycache__`, use a no-bytecode syntax check instead.

## Security Notes

- Do not commit `.env.local`, service account JSON, OAuth secrets, JWT secrets, or access tokens.
- Rotate any token that was accidentally placed in a Git remote URL or terminal history.
- Keep `MEDIA_DELIVERY_MODE=proxy` when the bucket is private.
- Use a strong `NEXTAUTH_SECRET` and `JWT_SECRET` in production.

