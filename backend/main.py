from fastapi import FastAPI, Depends, UploadFile, File, HTTPException, Form, WebSocket, WebSocketDisconnect, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from contextlib import asynccontextmanager
from sqlalchemy import inspect, text
from fastapi.staticfiles import StaticFiles
import os
import json
import asyncio
from datetime import datetime, timedelta
from typing import Dict

from database import engine, Base, get_db
import models
from face_utils import (
    FALLBACK_DISTANCE_CUTOFF,
    SEARCH_DISTANCE_CUTOFF,
    get_face_embedding,
    get_robust_video_embedding,
    get_search_face_candidates,
    is_low_quality_query,
    match_confidence,
    match_level,
    update_embedding_buffer,
)

# ── Background: delete expired stories every hour ──────────────────────────
async def cleanup_expired_stories():
    while True:
        try:
            cutoff = datetime.utcnow() - timedelta(hours=24)
            from database import SessionLocal
            db = SessionLocal()
            expired = db.query(models.Story).filter(models.Story.created_at < cutoff).all()
            for story in expired:
                db.delete(story)  # cascade deletes views, likes, comments
            if expired:
                db.commit()
                print(f"[Cleanup] Deleted {len(expired)} expired stories")
            db.close()
        except Exception as e:
            print(f"[Cleanup] Error: {e}")
        await asyncio.sleep(3600)  # run every hour


def ensure_schema():
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS follow_requests (
                follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (follower_id, following_id)
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS follow_requests_following_idx ON follow_requests (following_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS user_embeddings_vector_idx ON user_embeddings USING hnsw (embedding_vector vector_cosine_ops)"))
        conn.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()
    Base.metadata.create_all(bind=engine)
    ensure_schema()
    # Start background cleanup task
    task = asyncio.create_task(cleanup_expired_stories())
    yield
    task.cancel()  # clean shutdown

from sqlalchemy import text

from fastapi.staticfiles import StaticFiles
import os

app = FastAPI(title="velmoraa API", version="1.0.0", lifespan=lifespan)

# Configure local directory for fallback uploads.
os.makedirs("public/uploads", exist_ok=True)
import os
os.makedirs("public/uploads", exist_ok=True)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to the velmoraa API"}

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/media/{key:path}")
def get_uploaded_media(key: str):
    try:
        from s3_utils import get_media_bytes
        data, content_type = get_media_bytes(key)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Media not found")
    except Exception as e:
        print(f"[Media] Failed to load {key}: {e}")
        raise HTTPException(status_code=500, detail="Failed to load media")

    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )

@app.get("/uploads/{key:path}")
def get_legacy_uploaded_media(key: str):
    return get_uploaded_media(key)



from pydantic import BaseModel
from typing import Optional

class AuthSyncRequest(BaseModel):
    google_id: Optional[str] = None
    email: str
    name: str
    image: str

@app.post("/auth/sync")
def sync_user(req: AuthSyncRequest, db: Session = Depends(get_db)):
    """
    Syncs a user from NextAuth Google Sign-In to our database.
    If the user exists, syncs google_id. If not, returns needs_registration.
    """
    if req.google_id:
        existing_user = db.query(models.User).filter(
            (models.User.google_id == req.google_id) | (models.User.email == req.email)
        ).first()
    else:
        existing_user = db.query(models.User).filter(
            models.User.email == req.email
        ).first()

    if existing_user:
        if not existing_user.google_id and req.google_id:
            existing_user.google_id = req.google_id
            db.commit()
        return {
            "message": "User synced",
            "user_id": existing_user.id,
            "is_onboarded": existing_user.is_onboarded,
            "username": existing_user.username,
            "needs_registration": False,
        }

    # User doesn't exist — don't auto-create, tell frontend to register
    return {
        "message": "User not found",
        "needs_registration": True,
        "email": req.email,
        "name": req.name,
        "image": req.image,
    }

@app.get("/auth/check-username")
def check_username(username: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == username).first()
    return {"available": user is None}

@app.post("/onboarding")
async def complete_onboarding(
    email: str = Form(...),
    username: str = Form(...),
    date_of_birth: str = Form(...),
    nationality: str = Form(...),
    language: str = Form(...),
    discoverable: str = Form("false"),
    file: UploadFile = File(None),
    video_file: UploadFile = File(None),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Check if username is taken by someone else
    existing = db.query(models.User).filter(models.User.username == username).first()
    if existing and existing.id != user.id:
        raise HTTPException(status_code=400, detail="Username already taken")
        
    user.username = username
    user.date_of_birth = date_of_birth
    user.nationality = nationality
    user.language = language
    user.is_onboarded = True
    
    if file:
        try:
            # Upload profile picture to S3 (no embeddings extracted from this anymore)
            from s3_utils import upload_file_to_s3
            media_url = await upload_file_to_s3(file)
            user.profile_picture = media_url
        except Exception as e:
            print("Failed to process profile picture:", e)

    existing_embedding = db.query(models.UserEmbedding).filter(models.UserEmbedding.user_id == user.id).first()
    if discoverable.lower() == "true":
        if not video_file:
            raise HTTPException(status_code=400, detail="A short face video is required for image search opt-in")

        try:
            video_bytes = await video_file.read()
            embedding_result = get_robust_video_embedding(video_bytes)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            print("Failed to process video:", e)
            raise HTTPException(status_code=500, detail="Internal server error during face enrollment")

        user.discoverable_by_image = True
        if existing_embedding:
            existing_embedding.embedding_vector = embedding_result.embedding
            existing_embedding.buffer_vectors = embedding_result.buffer_vectors
        else:
            db.add(models.UserEmbedding(
                user_id=user.id,
                embedding_vector=embedding_result.embedding,
                buffer_vectors=embedding_result.buffer_vectors
            ))
        print(
            f"[Onboarding] Stored robust embedding for {user.username}. "
            f"Frames used: {embedding_result.frames_used}, candidates: {embedding_result.candidates_seen}, "
            f"quality: {embedding_result.average_quality:.3f}"
        )
    else:
        user.discoverable_by_image = False
        if existing_embedding:
            db.delete(existing_embedding)
    
    db.commit()
    return {"message": "Onboarding complete"}


import bcrypt
from s3_utils import upload_file_to_s3

@app.post("/auth/register")
async def register_user(
    email: str = Form(...),
    name: str = Form(...),
    username: str = Form(...),
    password: str = Form(...),
    date_of_birth: str = Form(""),
    file: UploadFile = File(...),
    discoverable_by_image: str = Form("false"),
    video_file: UploadFile = File(None),
    db: Session = Depends(get_db)
):
    # Check if email already exists
    if db.query(models.User).filter(models.User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    # Check if username already exists
    if db.query(models.User).filter(models.User.username == username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    # Validate
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")

    # Upload profile picture
    try:
        media_url = await upload_file_to_s3(file)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload profile picture: {str(e)}")

    is_discoverable = discoverable_by_image.lower() == "true"
    embedding_result = None

    if is_discoverable:
        if not video_file:
            raise HTTPException(status_code=400, detail="A short face video is required to opt-in to Find by Face")
        try:
            video_bytes = await video_file.read()
            print(f"[register] Video file received: filename={video_file.filename}, content_type={video_file.content_type}, size={len(video_bytes)} bytes")
            if len(video_bytes) == 0:
                raise HTTPException(status_code=400, detail="Video file is empty. Please record again.")
            embedding_result = get_robust_video_embedding(video_bytes)
            print(f"[register] Embedding extracted successfully!")
        except ValueError as e:
            print(f"[register] ValueError during video processing: {e}")
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            print(f"[register] Exception during video processing: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail="Internal server error during face extraction")

    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user = models.User(
        email=email,
        username=username,
        password_hash=hashed,
        date_of_birth=date_of_birth,
        is_onboarded=True,
        profile_picture=media_url,
        discoverable_by_image=is_discoverable,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    if is_discoverable and embedding_result:
        db.add(models.UserEmbedding(
            user_id=user.id,
            embedding_vector=embedding_result.embedding,
            buffer_vectors=embedding_result.buffer_vectors
        ))
        db.commit()

    return {"message": "Account created", "username": user.username}


# ── JWT Authentication ──────────────────────────────────────────────────────
import jwt
from datetime import timezone

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 72

def create_access_token(user: models.User) -> str:
    payload = {
        "sub": user.email,
        "username": user.username,
        "user_id": user.id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def get_current_user(db: Session = Depends(get_db), token: str = None):
    """Dependency that extracts user from Authorization header."""
    from fastapi import Request
    return None  # placeholder, real impl below

from fastapi import Request

async def get_current_user_from_request(request: Request, db: Session = Depends(get_db)):
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    token = auth_header.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        email = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = db.query(models.User).filter(models.User.email == email).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


class LoginRequest(BaseModel):
    email: str
    password: str

@app.post("/auth/login")
def login_user(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == req.email).first()
    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not bcrypt.checkpw(req.password.encode("utf-8"), user.password_hash.encode("utf-8")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user)
    return {
        "message": "Login successful",
        "username": user.username,
        "email": user.email,
        "is_onboarded": user.is_onboarded,
        "token": token,
    }

@app.post("/auth/token")
def get_token(req: LoginRequest, db: Session = Depends(get_db)):
    """Mobile-friendly token endpoint. Same as login but returns only the token."""
    user = db.query(models.User).filter(models.User.email == req.email).first()
    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not bcrypt.checkpw(req.password.encode("utf-8"), user.password_hash.encode("utf-8")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {
        "access_token": create_access_token(user),
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "profile_picture": user.profile_picture,
            "discoverable_by_image": user.discoverable_by_image,
        },
    }

@app.get("/auth/me")
async def get_me(user: models.User = Depends(get_current_user_from_request)):
    """Returns the current authenticated user's profile."""
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "profile_picture": user.profile_picture,
        "discoverable_by_image": user.discoverable_by_image,
        "is_onboarded": user.is_onboarded,
    }

@app.post("/auth/check-email")
def check_email(req: dict, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == req.get("email", "")).first()
    if not user:
        raise HTTPException(status_code=404, detail="No account found with this email")
    return {"exists": True}

@app.post("/opt-in")
async def opt_in_facial_search(
    email: str = Form(...),
    video_file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Allows an existing user to opt-in to facial search by uploading a short video.
    """
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    video_bytes = await video_file.read()
    try:
        embedding_result = get_robust_video_embedding(video_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print("Failed to process opt-in video:", e)
        raise HTTPException(status_code=500, detail="Internal server error during face enrollment")

    # Update user
    user.discoverable_by_image = True

    # Save or update embedding
    existing_embedding = db.query(models.UserEmbedding).filter(models.UserEmbedding.user_id == user.id).first()
    if existing_embedding:
        existing_embedding.embedding_vector = embedding_result.embedding
        existing_embedding.buffer_vectors = embedding_result.buffer_vectors
    else:
        new_embedding = models.UserEmbedding(
            user_id=user.id,
            embedding_vector=embedding_result.embedding,
            buffer_vectors=embedding_result.buffer_vectors
        )
        db.add(new_embedding)
        
    db.commit()
    return {
        "message": "Successfully opted in to facial search",
        "frames_used": embedding_result.frames_used,
        "quality": round(embedding_result.average_quality, 3),
    }


@app.post("/account/privacy")
def update_account_privacy(
    email: str = Form(...),
    is_private: bool = Form(...),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_private = is_private
    db.commit()
    return {"message": "privacy updated", "is_private": user.is_private}

@app.put("/account/profile-picture")
async def update_profile_picture(
    email: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    from s3_utils import upload_file_to_s3
    url = await upload_file_to_s3(file)
    user.profile_picture = url
    db.commit()
    return {"message": "Profile picture updated", "profile_picture": url}

@app.delete("/account/delete")
def delete_account(
    email: str = Form(...),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user_id = user.id
    table_names = set(inspect(db.get_bind()).get_table_names())

    def delete_if_table_exists(table_name: str, statement: str):
        if table_name in table_names:
            db.execute(text(statement), {"user_id": user_id})

    try:
        # Remove rows that point at the user's posts before deleting the posts.
        delete_if_table_exists(
            "notifications",
            """
            DELETE FROM notifications
            WHERE recipient_id = :user_id
               OR actor_id = :user_id
               OR post_id IN (SELECT id FROM posts WHERE user_id = :user_id)
            """,
        )
        delete_if_table_exists(
            "vault_posts",
            "DELETE FROM vault_posts WHERE post_id IN (SELECT id FROM posts WHERE user_id = :user_id)",
        )
        delete_if_table_exists(
            "comments",
            """
            DELETE FROM comments
            WHERE user_id = :user_id
               OR post_id IN (SELECT id FROM posts WHERE user_id = :user_id)
            """,
        )
        delete_if_table_exists(
            "likes",
            """
            DELETE FROM likes
            WHERE user_id = :user_id
               OR post_id IN (SELECT id FROM posts WHERE user_id = :user_id)
            """,
        )

        # Remove story activity where the user owns or interacted with the story.
        delete_if_table_exists(
            "story_comments",
            """
            DELETE FROM story_comments
            WHERE user_id = :user_id
               OR story_id IN (SELECT id FROM stories WHERE user_id = :user_id)
            """,
        )
        delete_if_table_exists(
            "story_likes",
            """
            DELETE FROM story_likes
            WHERE user_id = :user_id
               OR story_id IN (SELECT id FROM stories WHERE user_id = :user_id)
            """,
        )
        delete_if_table_exists(
            "story_views",
            """
            DELETE FROM story_views
            WHERE viewer_id = :user_id
               OR story_id IN (SELECT id FROM stories WHERE user_id = :user_id)
            """,
        )

        delete_if_table_exists("messages", "DELETE FROM messages WHERE sender_id = :user_id OR receiver_id = :user_id")
        delete_if_table_exists("user_embeddings", "DELETE FROM user_embeddings WHERE user_id = :user_id")
        delete_if_table_exists("vault_members", "DELETE FROM vault_members WHERE user_id = :user_id")
        delete_if_table_exists("follow_requests", "DELETE FROM follow_requests WHERE follower_id = :user_id OR following_id = :user_id")
        delete_if_table_exists("follows", "DELETE FROM follows WHERE follower_id = :user_id OR following_id = :user_id")
        delete_if_table_exists("stories", "DELETE FROM stories WHERE user_id = :user_id")
        delete_if_table_exists("posts", "DELETE FROM posts WHERE user_id = :user_id")

        db.delete(user)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[Account Delete] Failed for user_id={user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete account")

    return {"message": "Account deleted successfully"}

@app.post("/search-by-image")
async def search_by_image(
    file: UploadFile = File(...),
    email: str = Form(None),
    db: Session = Depends(get_db)
):
    """
    Receive an image, extract face embedding, and find the closest matching user
    who has discoverable_by_image = True.
    """
    image_bytes = await file.read()
    
    try:
        face_candidates = get_search_face_candidates(image_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Could not extract face from search image: {str(e)}")

    def build_match(user, distance: float, face_index: int, candidate, is_fallback: bool = False):
        return {
            "user_id": user.id,
            "username": user.username,
            "profile_picture": user.profile_picture,
            "match_confidence": match_confidence(distance),
            "match_level": match_level(distance),
            "distance": round(distance, 4),
            "matched_face_index": face_index,
            "face_quality": round(candidate.quality_score, 3),
            "query_quality": "low" if is_low_quality_query(candidate) else "good",
            "is_fallback": is_fallback,
        }

    def merge_best(best: dict[int, dict], user, distance: float, face_index: int, candidate, is_fallback: bool = False):
        previous = best.get(user.id)
        if previous and previous["distance"] <= distance:
            return
        best[user.id] = build_match(user, distance, face_index, candidate, is_fallback)

    best_by_user: dict[int, dict] = {}
    fallback_by_user: dict[int, dict] = {}
    for face_index, candidate in enumerate(face_candidates):
        distance_expr = models.UserEmbedding.embedding_vector.cosine_distance(candidate.embedding)
        base_query = db.query(
            models.User,
            distance_expr.label("distance")
        ).join(models.UserEmbedding).filter(
            models.User.discoverable_by_image == True
        )

        if email:
            base_query = base_query.filter(models.User.email != email)

        query = base_query.filter(distance_expr <= SEARCH_DISTANCE_CUTOFF)
        results = query.order_by("distance").limit(10).all()
        for user, distance in results:
            distance = float(distance)
            merge_best(best_by_user, user, distance, face_index, candidate)

        fallback_results = base_query.filter(
            distance_expr <= FALLBACK_DISTANCE_CUTOFF
        ).order_by("distance").limit(5).all()
        for user, distance in fallback_results:
            distance = float(distance)
            merge_best(fallback_by_user, user, distance, face_index, candidate, is_fallback=True)

    response = sorted(best_by_user.values(), key=lambda item: item["distance"])[:10]
    used_fallback = False
    if not response:
        response = sorted(fallback_by_user.values(), key=lambda item: item["distance"])[:5]
        used_fallback = bool(response)

    query_faces = [
        {
            "face_index": index,
            "quality": "low" if is_low_quality_query(candidate) else "good",
            "quality_score": round(candidate.quality_score, 3),
            "area_ratio": round(candidate.area_ratio, 4),
            "blur_score": round(candidate.blur_score, 2),
            "facial_area": candidate.facial_area,
        }
        for index, candidate in enumerate(face_candidates)
    ]
    return {
        "matches": response,
        "faces_detected": len(face_candidates),
        "query_faces": query_faces,
        "used_fallback": used_fallback,
    }

from s3_utils import upload_file_to_s3

@app.post("/posts")
async def create_post(
    email: str = Form(...),
    caption: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Upload a new post. Saves image to S3 (or local mock) and creates Post DB record.
    """
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        media_url = await upload_file_to_s3(file)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload media: {str(e)}")

    new_post = models.Post(
        user_id=user.id,
        media_url=media_url,
        caption=caption
    )
    db.add(new_post)
    db.commit()
    db.refresh(new_post)

    # Dynamic Face Embedding Averaging
    try:
        import cv2
        import numpy as np
        import os
        from face_utils import get_all_face_embeddings
        from s3_utils import get_media_bytes
        
        image_bytes = None
        video_exts = ['.mp4', '.webm', '.mov', '.avi']
        
        if any(media_url.lower().endswith(ext) for ext in video_exts):
            # Extract a frame from the middle of the video
            import tempfile
            media_bytes, _ = get_media_bytes(media_url)
            suffix = os.path.splitext(media_url)[1] or ".mp4"
            temp_path = None
            try:
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                    tmp.write(media_bytes)
                    temp_path = tmp.name
                cap = cv2.VideoCapture(temp_path)
                if cap.isOpened():
                    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                    mid_frame = max(0, total_frames // 2)
                    cap.set(cv2.CAP_PROP_POS_FRAMES, mid_frame)
                    ret, frame = cap.read()
                    if ret:
                        _, buffer = cv2.imencode('.jpg', frame)
                        image_bytes = buffer.tobytes()
                    cap.release()
            finally:
                if temp_path and os.path.exists(temp_path):
                    os.unlink(temp_path)
        else:
            image_bytes, _ = get_media_bytes(media_url)

        if image_bytes:
            faces = get_all_face_embeddings(image_bytes)
            if faces:
                user_emb_record = db.query(models.UserEmbedding).filter(models.UserEmbedding.user_id == user.id).first()
                if user_emb_record:
                    # L2-normalize the stored vector (in case it wasn't already)
                    user_vec = np.array(user_emb_record.embedding_vector)
                    user_vec = user_vec / np.linalg.norm(user_vec)
                    
                    best_distance = 999.0
                    best_face = None
                    
                    for face_vec in faces:
                        # L2-normalize each detected face vector
                        fv = np.array(face_vec)
                        fv = fv / np.linalg.norm(fv)
                        dist = 1.0 - np.dot(user_vec, fv)
                        if dist < best_distance:
                            best_distance = dist
                            best_face = fv
                            
                    if best_face is not None:
                        new_centroid, new_buffer, admitted_distance = update_embedding_buffer(
                            user_emb_record.embedding_vector,
                            user_emb_record.buffer_vectors,
                            best_face.tolist(),
                        )
                    else:
                        new_centroid, new_buffer, admitted_distance = None, [], best_distance

                    if new_centroid:
                        user_emb_record.buffer_vectors = new_buffer
                        user_emb_record.embedding_vector = new_centroid
                        db.commit()
                        print(f"[Post] Updated embedding for {user.username}. Buffer size: {len(new_buffer)}. Distance: {admitted_distance:.4f}")
                    else:
                        print(f"[Post] Skipped embedding update for {user.username} (best dist: {admitted_distance:.4f}).")
    except Exception as e:
        print(f"Non-fatal error in dynamic embedding update: {e}")

    # --- Ghost-Tagging / Shared Vault Logic ---
    if image_bytes and 'faces' in locals() and faces:
        try:
            matched_user_ids = set()
            for face_vec in faces:
                distance_expr = models.UserEmbedding.embedding_vector.cosine_distance(face_vec)
                matched_user = db.query(models.User).join(models.UserEmbedding).filter(
                    models.User.discoverable_by_image == True,
                    models.User.id != user.id,
                    distance_expr <= SEARCH_DISTANCE_CUTOFF
                ).order_by(distance_expr).first()
                
                if matched_user:
                    matched_user_ids.add(matched_user.id)
                    
            if matched_user_ids:
                matched_user_ids.add(user.id)
                matched_user_ids_list = sorted(list(matched_user_ids))
                
                event_names = db.query(models.User).filter(models.User.id.in_(matched_user_ids_list)).all()
                names = [u.username for u in event_names if u.id != user.id]
                vault_name = f"Shared Memory with {', '.join(names)}"
                
                new_vault = models.Vault(name=vault_name)
                db.add(new_vault)
                db.commit()
                db.refresh(new_vault)
                
                for uid in matched_user_ids_list:
                    db.add(models.VaultMember(vault_id=new_vault.id, user_id=uid))
                    
                db.add(models.VaultPost(vault_id=new_vault.id, post_id=new_post.id))
                db.commit()
                
                for uid in matched_user_ids_list:
                    if uid != user.id:
                        notif = models.Notification(
                            recipient_id=uid,
                            actor_id=user.id,
                            type="ghost_tag",
                            content_preview=f"spotted you! Added to {vault_name}",
                            post_id=new_post.id
                        )
                        db.add(notif)
                db.commit()
                print(f"[Ghost-Tagging] Vault created: {vault_name}")
        except Exception as e:
            print(f"Ghost-tagging error: {e}")

    return {"message": "Post created successfully", "post_id": new_post.id, "media_url": media_url}

@app.get("/feed")
def get_feed(email: str = None, db: Session = Depends(get_db)):
    """
    Retrieve posts for the home feed.
    - If logged in: show posts from followed users only (falls back to explore if following nobody).
    - If not logged in: show latest 20 posts globally.
    """
    current_user = None
    if email:
        current_user = db.query(models.User).filter(models.User.email == email).first()

    if current_user:
        # Get IDs of users current_user is following
        following_ids = [
            f.following_id for f in db.query(models.Follow).filter(models.Follow.follower_id == current_user.id).all()
        ]
        if following_ids:
            posts = db.query(models.Post).filter(
                models.Post.user_id.in_(following_ids)
            ).order_by(models.Post.created_at.desc()).limit(30).all()
        else:
            # Not following anyone yet — show all posts as "Explore"
            posts = db.query(models.Post).order_by(models.Post.created_at.desc()).limit(20).all()
    else:
        posts = db.query(models.Post).order_by(models.Post.created_at.desc()).limit(20).all()

    feed = []
    for post in posts:
        user = db.query(models.User).filter(models.User.id == post.user_id).first()
        if user and not can_view_private_content(current_user, user, db):
            continue
        
        likes_count = db.query(models.Like).filter(models.Like.post_id == post.id).count()
        has_liked = False
        if current_user:
            has_liked = db.query(models.Like).filter(
                models.Like.post_id == post.id, 
                models.Like.user_id == current_user.id
            ).first() is not None

        recent_comments = db.query(models.Comment).filter(models.Comment.post_id == post.id).order_by(models.Comment.created_at.desc()).limit(2).all()
        comments_formatted = []
        for c in recent_comments:
            c_user = db.query(models.User).filter(models.User.id == c.user_id).first()
            if c_user:
                comments_formatted.append({
                    "id": c.id,
                    "username": c_user.username,
                    "content": c.content
                })

        feed.append({
            "id": post.id,
            "username": user.username if user else "unknown",
            "profile_picture": user.profile_picture if user else None,
            "media_url": post.media_url,
            "caption": post.caption,
            "created_at": post.created_at,
            "likes_count": likes_count,
            "has_liked": has_liked,
            "comments": comments_formatted[::-1]
        })
    
    return {"posts": feed}


class CommentRequest(BaseModel):
    email: str
    content: str


def get_requester(email: str | None, db: Session):
    if not email:
        return None
    return db.query(models.User).filter(models.User.email == email).first()


def is_following_user(requester: models.User | None, target_user: models.User, db: Session) -> bool:
    if not requester:
        return False
    return db.query(models.Follow).filter(
        models.Follow.follower_id == requester.id,
        models.Follow.following_id == target_user.id
    ).first() is not None


def has_pending_follow_request(requester: models.User | None, target_user: models.User, db: Session) -> bool:
    if not requester:
        return False
    return db.query(models.FollowRequest).filter(
        models.FollowRequest.follower_id == requester.id,
        models.FollowRequest.following_id == target_user.id
    ).first() is not None


def can_view_private_content(requester: models.User | None, target_user: models.User, db: Session) -> bool:
    if not target_user.is_private:
        return True
    if requester and requester.id == target_user.id:
        return True
    return is_following_user(requester, target_user, db)


def notify_once(
    db: Session,
    recipient_id: int,
    actor_id: int,
    notif_type: str,
    content_preview: str | None = None,
    window_hours: int = 24,
):
    if recipient_id == actor_id:
        return
    cutoff = datetime.utcnow() - timedelta(hours=window_hours)
    existing = db.query(models.Notification).filter(
        models.Notification.recipient_id == recipient_id,
        models.Notification.actor_id == actor_id,
        models.Notification.type == notif_type,
        models.Notification.created_at >= cutoff
    ).first()
    if existing:
        return
    db.add(models.Notification(
        recipient_id=recipient_id,
        actor_id=actor_id,
        type=notif_type,
        content_preview=content_preview
    ))


@app.post("/posts/{post_id}/like")
def toggle_like(post_id: int, email: str = Form(...), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    existing_like = db.query(models.Like).filter(models.Like.post_id == post.id, models.Like.user_id == user.id).first()
    
    if existing_like:
        db.delete(existing_like)
        
        # Remove like notifications when unliking
        notifs = db.query(models.Notification).filter(
            models.Notification.recipient_id == post.user_id,
            models.Notification.actor_id == user.id,
            models.Notification.type == "like",
            models.Notification.post_id == post.id
        ).all()
        for n in notifs:
            db.delete(n)
            
        db.commit()
        return {"message": "unliked", "has_liked": False}
    else:
        new_like = models.Like(user_id=user.id, post_id=post.id)
        db.add(new_like)
        db.commit()
        # Notify post owner (not self-notifying)
        post_owner = db.query(models.User).filter(models.User.id == post.user_id).first()
        if post_owner and post_owner.id != user.id:
            existing_notif = db.query(models.Notification).filter(
                models.Notification.recipient_id == post_owner.id,
                models.Notification.actor_id == user.id,
                models.Notification.type == "like",
                models.Notification.post_id == post.id
            ).first()
            
            if not existing_notif:
                notif = models.Notification(
                    recipient_id=post_owner.id,
                    actor_id=user.id,
                    type="like",
                    post_id=post.id
                )
                db.add(notif)
                db.commit()
        return {"message": "liked", "has_liked": True}

@app.post("/posts/{post_id}/comment")
def add_comment(post_id: int, req: CommentRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == req.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    new_comment = models.Comment(
        user_id=user.id,
        post_id=post.id,
        content=req.content
    )
    db.add(new_comment)
    db.commit()
    db.refresh(new_comment)
    # Notify post owner (not self-notifying)
    post_owner = db.query(models.User).filter(models.User.id == post.user_id).first()
    if post_owner and post_owner.id != user.id:
        notif = models.Notification(
            recipient_id=post_owner.id,
            actor_id=user.id,
            type="comment",
            post_id=post.id,
            content_preview=req.content[:80]
        )
        db.add(notif)
        db.commit()

    return {
        "message": "comment added",
        "comment": {
            "id": new_comment.id,
            "username": user.username,
            "content": new_comment.content
        }
    }


@app.delete("/posts/{post_id}")
def delete_post(post_id: int, email: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.user_id != user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own posts")

    media_url = post.media_url
    table_names = set(inspect(db.get_bind()).get_table_names())

    try:
        if "notifications" in table_names:
            db.execute(text("DELETE FROM notifications WHERE post_id = :post_id"), {"post_id": post_id})
        if "vault_posts" in table_names:
            db.execute(text("DELETE FROM vault_posts WHERE post_id = :post_id"), {"post_id": post_id})
        if "comments" in table_names:
            db.execute(text("DELETE FROM comments WHERE post_id = :post_id"), {"post_id": post_id})
        if "likes" in table_names:
            db.execute(text("DELETE FROM likes WHERE post_id = :post_id"), {"post_id": post_id})

        db.delete(post)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[Delete Post] Failed to delete post {post_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete post")

    try:
        from s3_utils import delete_media_file
        delete_media_file(media_url)
    except Exception as e:
        print(f"[Delete Post] Media cleanup skipped for {media_url}: {e}")

    return {"message": "Post deleted", "post_id": post_id}

@app.get("/users/{username}")
def get_user_profile(username: str, email: str = None, source: str = None, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    followers_count = db.query(models.Follow).filter(models.Follow.following_id == user.id).count()
    following_count = db.query(models.Follow).filter(models.Follow.follower_id == user.id).count()
    posts_count = db.query(models.Post).filter(models.Post.user_id == user.id).count()
    
    requester = get_requester(email, db)
    is_own_profile = requester is not None and requester.id == user.id
    is_following = False
    follow_request_status = None
    if requester:
        is_following = is_following_user(requester, user, db)
        if has_pending_follow_request(requester, user, db):
            follow_request_status = "pending"

        if source == "face_search" and not is_own_profile:
            notify_once(
                db,
                recipient_id=user.id,
                actor_id=requester.id,
                notif_type="face_search_view",
                content_preview="opened your profile from face search"
            )
            db.commit()

    can_view_profile = can_view_private_content(requester, user, db)

    return {
        "id": user.id,
        "username": user.username,
        "bio": user.bio,
        "profile_picture": user.profile_picture,
        "followers_count": followers_count,
        "following_count": following_count,
        "posts_count": posts_count,
        "is_following": is_following,
        "follow_request_status": follow_request_status,
        "is_private": user.is_private,
        "can_view_profile": can_view_profile,
        "discoverable_by_image": user.discoverable_by_image
    }

@app.get("/suggestions")
def get_suggestions(email: str, limit: int = 5, db: Session = Depends(get_db)):
    """Return users that the current user is not yet following."""
    current_user = db.query(models.User).filter(models.User.email == email).first()
    if not current_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    following_ids = {f.following_id for f in db.query(models.Follow).filter(models.Follow.follower_id == current_user.id).all()}
    following_ids.add(current_user.id)  # Exclude self
    
    suggestions = db.query(models.User).filter(
        ~models.User.id.in_(following_ids),
        models.User.username.isnot(None)
    ).limit(limit).all()
    
    return [{"username": u.username, "profile_picture": u.profile_picture} for u in suggestions]

@app.get("/search/users")
def search_users(q: str, db: Session = Depends(get_db)):
    """Search for users by username."""
    if not q or len(q.strip()) == 0:
        return {"users": []}
        
    query_str = f"%{q.strip().lower()}%"
    users = db.query(models.User).filter(
        models.User.username.ilike(query_str)
    ).limit(20).all()
    
    return {"users": [{"username": u.username, "profile_picture": u.profile_picture} for u in users]}

@app.get("/users/{username}/followers")
def get_user_followers(username: str, email: str = None, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    requester = get_requester(email, db)
    if not can_view_private_content(requester, user, db):
        raise HTTPException(status_code=403, detail="This account is private")
    
    # Get all follow records where the following_id is the target user's id
    follows = db.query(models.Follow).filter(models.Follow.following_id == user.id).all()
    follower_ids = [f.follower_id for f in follows]
    followers = db.query(models.User).filter(models.User.id.in_(follower_ids)).all()
    
    return [{"username": u.username, "profile_picture": u.profile_picture} for u in followers]

@app.get("/users/{username}/following")
def get_user_following(username: str, email: str = None, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    requester = get_requester(email, db)
    if not can_view_private_content(requester, user, db):
        raise HTTPException(status_code=403, detail="This account is private")
        
    # Get all follow records where the follower_id is the target user's id
    follows = db.query(models.Follow).filter(models.Follow.follower_id == user.id).all()
    following_ids = [f.following_id for f in follows]
    following = db.query(models.User).filter(models.User.id.in_(following_ids)).all()
    
    return [{"username": u.username, "profile_picture": u.profile_picture} for u in following]


@app.post("/users/{username}/follow")
def toggle_follow(username: str, email: str = Form(...), db: Session = Depends(get_db)):
    target_user = db.query(models.User).filter(models.User.username == username).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Target user not found")
        
    requester = db.query(models.User).filter(models.User.email == email).first()
    if not requester:
        raise HTTPException(status_code=404, detail="Requester not found")
        
    if requester.id == target_user.id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")

    existing_follow = db.query(models.Follow).filter(models.Follow.follower_id == requester.id, models.Follow.following_id == target_user.id).first()
    
    if existing_follow:
        db.delete(existing_follow)
        db.commit()
        return {"message": "unfollowed", "is_following": False, "follow_request_status": None}

    pending_request = db.query(models.FollowRequest).filter(
        models.FollowRequest.follower_id == requester.id,
        models.FollowRequest.following_id == target_user.id
    ).first()

    if pending_request:
        db.delete(pending_request)
        
        # Remove the notification so it doesn't confusingly stay as "Request handled"
        notif = db.query(models.Notification).filter(
            models.Notification.recipient_id == target_user.id,
            models.Notification.actor_id == requester.id,
            models.Notification.type == "follow_request"
        ).first()
        if notif:
            db.delete(notif)
            
        db.commit()
        return {"message": "request_cancelled", "is_following": False, "follow_request_status": None}

    if target_user.is_private:
        follow_request = models.FollowRequest(
            follower_id=requester.id,
            following_id=target_user.id
        )
        db.add(follow_request)
        notify_once(
            db,
            recipient_id=target_user.id,
            actor_id=requester.id,
            notif_type="follow_request",
            content_preview="requested to follow you"
        )
        db.commit()
        return {"message": "requested", "is_following": False, "follow_request_status": "pending"}
    else:
        new_follow = models.Follow(follower_id=requester.id, following_id=target_user.id)
        db.add(new_follow)
        db.commit()
        # Emit notification
        notif = models.Notification(
            recipient_id=target_user.id,
            actor_id=requester.id,
            type="follow"
        )
        db.add(notif)
        db.commit()
        return {"message": "followed", "is_following": True, "follow_request_status": None}


@app.post("/follow-requests/{requester_username}/accept")
def accept_follow_request(requester_username: str, email: str = Form(...), db: Session = Depends(get_db)):
    target_user = db.query(models.User).filter(models.User.email == email).first()
    requester = db.query(models.User).filter(models.User.username == requester_username).first()
    if not target_user or not requester:
        raise HTTPException(status_code=404, detail="User not found")

    follow_request = db.query(models.FollowRequest).filter(
        models.FollowRequest.follower_id == requester.id,
        models.FollowRequest.following_id == target_user.id
    ).first()
    if not follow_request:
        raise HTTPException(status_code=404, detail="Follow request not found")

    existing_follow = db.query(models.Follow).filter(
        models.Follow.follower_id == requester.id,
        models.Follow.following_id == target_user.id
    ).first()
    if not existing_follow:
        db.add(models.Follow(follower_id=requester.id, following_id=target_user.id))

    db.delete(follow_request)
    db.add(models.Notification(
        recipient_id=requester.id,
        actor_id=target_user.id,
        type="follow_request_accepted",
        content_preview="accepted your follow request"
    ))
    db.commit()
    return {"message": "accepted"}


@app.post("/follow-requests/{requester_username}/decline")
def decline_follow_request(requester_username: str, email: str = Form(...), db: Session = Depends(get_db)):
    target_user = db.query(models.User).filter(models.User.email == email).first()
    requester = db.query(models.User).filter(models.User.username == requester_username).first()
    if not target_user or not requester:
        raise HTTPException(status_code=404, detail="User not found")

    follow_request = db.query(models.FollowRequest).filter(
        models.FollowRequest.follower_id == requester.id,
        models.FollowRequest.following_id == target_user.id
    ).first()
    if not follow_request:
        raise HTTPException(status_code=404, detail="Follow request not found")

    db.delete(follow_request)
    db.commit()
    return {"message": "declined"}


@app.get("/users/{username}/posts")
def get_user_posts(username: str, email: str = None, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    requester = get_requester(email, db)
    if not can_view_private_content(requester, user, db):
        raise HTTPException(status_code=403, detail="This account is private")
        
    posts = db.query(models.Post).filter(models.Post.user_id == user.id).order_by(models.Post.created_at.desc()).all()
    
    # Return minimal info for grid
    grid = [{"id": p.id, "media_url": p.media_url, "likes_count": db.query(models.Like).filter(models.Like.post_id == p.id).count(), "comments_count": db.query(models.Comment).filter(models.Comment.post_id == p.id).count()} for p in posts]
    
    return {"posts": grid}

@app.get("/posts/{post_id}")
def get_post_details(post_id: int, email: str = None, db: Session = Depends(get_db)):
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    owner = db.query(models.User).filter(models.User.id == post.user_id).first()
    requester = get_requester(email, db)
    if owner and not can_view_private_content(requester, owner, db):
        raise HTTPException(status_code=403, detail="This account is private")
        
    has_liked = False
    if requester:
        existing_like = db.query(models.Like).filter(
            models.Like.post_id == post.id,
            models.Like.user_id == requester.id
        ).first()
        if existing_like:
            has_liked = True
                
    likes_count = db.query(models.Like).filter(models.Like.post_id == post.id).count()
    
    comments = db.query(models.Comment).filter(models.Comment.post_id == post.id).order_by(models.Comment.created_at.asc()).all()
    comments_list = []
    for c in comments:
        c_user = db.query(models.User).filter(models.User.id == c.user_id).first()
        comments_list.append({
            "id": c.id,
            "content": c.content,
            "username": c_user.username if c_user else "unknown",
            "profile_picture": c_user.profile_picture if c_user else None,
            "created_at": c.created_at
        })
        
    return {
        "id": post.id,
        "media_url": post.media_url,
        "caption": post.caption,
        "created_at": post.created_at,
        "username": owner.username if owner else "unknown",
        "profile_picture": owner.profile_picture if owner else None,
        "likes_count": likes_count,
        "has_liked": has_liked,
        "comments": comments_list
    }


# --- WebSockets for Messaging ---

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, username: str):
        await websocket.accept()
        self.active_connections[username] = websocket

    def disconnect(self, username: str):
        if username in self.active_connections:
            del self.active_connections[username]

    async def send_personal_message(self, message: dict, receiver_username: str):
        if receiver_username in self.active_connections:
            await self.active_connections[receiver_username].send_json(message)

manager = ConnectionManager()

@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str, db: Session = Depends(get_db)):
    print(f"WS CONNECTION ATTEMPT: {username}")
    await manager.connect(websocket, username)
    print(f"WS CONNECTED: {username}")
    try:
        while True:
            data = await websocket.receive_text()
            print(f"WS DATA RECEIVED from {username}: {data}")
            message_data = json.loads(data)
            receiver_username = message_data.get("receiver")
            content = message_data.get("content")

            # Validate users
            sender = db.query(models.User).filter(models.User.username == username).first()
            receiver = db.query(models.User).filter(models.User.username == receiver_username).first()

            print(f"WS SENDER: {sender}, RECEIVER: {receiver}, CONTENT: {content}")

            if sender and receiver and content:
                if receiver.is_private and receiver.id != sender.id and not is_following_user(sender, receiver, db):
                    await manager.send_personal_message({
                        "error": "This account is private. Send a follow request first."
                    }, username)
                    continue

                # Save to database
                new_msg = models.Message(
                    sender_id=sender.id,
                    receiver_id=receiver.id,
                    content=content
                )
                db.add(new_msg)
                db.commit()
                print("WS MESSAGE SAVED")

                # Send to receiver if online
                payload = {
                    "sender": username,
                    "content": content,
                    "timestamp": str(new_msg.created_at)
                }
                await manager.send_personal_message(payload, receiver_username)
                
                # Also echo back to sender to confirm
                await manager.send_personal_message(payload, username)

    except WebSocketDisconnect:
        manager.disconnect(username)


@app.get("/messages/{username}/inbox")
def get_inbox(username: str, db: Session = Depends(get_db)):
    """Retrieve list of users with whom the current user has exchanged messages"""
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    messages = db.query(models.Message).filter(
        (models.Message.sender_id == user.id) | (models.Message.receiver_id == user.id)
    ).all()
    
    interacted_user_ids = set()
    for m in messages:
        if m.sender_id != user.id:
            interacted_user_ids.add(m.sender_id)
        if m.receiver_id != user.id:
            interacted_user_ids.add(m.receiver_id)
            
    if not interacted_user_ids:
        return []
        
    inbox_users = db.query(models.User).filter(models.User.id.in_(interacted_user_ids)).all()

    result = []
    for u in inbox_users:
        # Get last message between current user and this contact
        last_msg = db.query(models.Message).filter(
            ((models.Message.sender_id == user.id) & (models.Message.receiver_id == u.id)) |
            ((models.Message.sender_id == u.id) & (models.Message.receiver_id == user.id))
        ).order_by(models.Message.created_at.desc()).first()

        unread_count = db.query(models.Message).filter(
            models.Message.sender_id == u.id,
            models.Message.receiver_id == user.id,
            models.Message.is_read == False
        ).count() if hasattr(models.Message, 'is_read') else 0

        result.append({
            "username": u.username,
            "profile_picture": u.profile_picture,
            "last_message": last_msg.content if last_msg else None,
            "last_time": last_msg.created_at.isoformat() if last_msg else None,
            "unread": unread_count,
        })

    # Sort by most recent message
    result.sort(key=lambda x: x["last_time"] or "", reverse=True)
    return result

@app.post("/messages/send")
async def send_message(
    email: str = Form(...),
    receiver: str = Form(...),
    content: str = Form(...),
    db: Session = Depends(get_db)
):
    """Send a message over HTTP, with WebSocket delivery when the receiver is online."""
    sender = db.query(models.User).filter(models.User.email == email).first()
    receiver_user = db.query(models.User).filter(models.User.username == receiver).first()

    if not sender:
        raise HTTPException(status_code=404, detail="Sender not found")
    if not receiver_user:
        raise HTTPException(status_code=404, detail="Receiver not found")
    if sender.id == receiver_user.id:
        raise HTTPException(status_code=400, detail="Cannot message yourself")
    if not content.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if receiver_user.is_private and not is_following_user(sender, receiver_user, db):
        raise HTTPException(status_code=403, detail="This account is private. Send a follow request first.")

    new_msg = models.Message(
        sender_id=sender.id,
        receiver_id=receiver_user.id,
        content=content.strip()
    )
    db.add(new_msg)
    db.commit()
    db.refresh(new_msg)

    payload = {
        "sender": sender.username,
        "content": new_msg.content,
        "timestamp": new_msg.created_at.isoformat()
    }
    await manager.send_personal_message(payload, receiver_user.username)
    return {"message": payload}

@app.get("/messages/{username1}/{username2}")
def get_messages(username1: str, username2: str, db: Session = Depends(get_db)):
    """Retrieve chat history between two users"""
    u1 = db.query(models.User).filter(models.User.username == username1).first()
    u2 = db.query(models.User).filter(models.User.username == username2).first()
    
    if not u1 or not u2:
        return {"messages": []}
        
    history = db.query(models.Message).filter(
        ((models.Message.sender_id == u1.id) & (models.Message.receiver_id == u2.id)) |
        ((models.Message.sender_id == u2.id) & (models.Message.receiver_id == u1.id))
    ).order_by(models.Message.created_at.asc()).all()
    
    return {"messages": [{
        "sender": u1.username if m.sender_id == u1.id else u2.username,
        "content": m.content,
        "timestamp": m.created_at
    } for m in history]}


# ─── Stories ──────────────────────────────────────────────────────────────────

from datetime import datetime, timedelta

@app.post("/stories")
async def upload_story(
    email: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Upload a story (visible to followers for 24h)."""
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    media_url = await upload_file_to_s3(file)
    story = models.Story(user_id=user.id, media_url=media_url)
    db.add(story)
    db.commit()
    db.refresh(story)
    return {"message": "Story uploaded", "story_id": story.id, "media_url": media_url}


@app.get("/stories")
def get_stories(email: str, db: Session = Depends(get_db)):
    """
    Returns stories from people the current user follows + own stories.
    Only stories < 24h old are returned.
    """
    current_user = db.query(models.User).filter(models.User.email == email).first()
    if not current_user:
        raise HTTPException(status_code=404, detail="User not found")

    cutoff = datetime.utcnow() - timedelta(hours=24)

    # IDs: people we follow + ourselves
    following_ids = {f.following_id for f in db.query(models.Follow).filter(models.Follow.follower_id == current_user.id).all()}
    following_ids.add(current_user.id)

    stories = db.query(models.Story).filter(
        models.Story.user_id.in_(following_ids),
        models.Story.created_at >= cutoff
    ).order_by(models.Story.user_id, models.Story.created_at.asc()).all()

    # Group by user, mark if current user has viewed each story
    grouped: dict = {}
    for story in stories:
        uid = story.user_id
        if uid not in grouped:
            owner = db.query(models.User).filter(models.User.id == uid).first()
            grouped[uid] = {
                "user_id": uid,
                "username": owner.username,
                "profile_picture": owner.profile_picture,
                "is_own": uid == current_user.id,
                "stories": []
            }
        has_viewed = db.query(models.StoryView).filter(
            models.StoryView.story_id == story.id,
            models.StoryView.viewer_id == current_user.id
        ).first() is not None
        grouped[uid]["stories"].append({
            "id": story.id,
            "media_url": story.media_url,
            "created_at": story.created_at,
            "has_viewed": has_viewed
        })

    result = list(grouped.values())
    # Own stories go first
    result.sort(key=lambda x: (not x["is_own"], all(s["has_viewed"] for s in x["stories"])))
    return {"story_groups": result}


@app.post("/stories/{story_id}/view")
def mark_story_viewed(story_id: int, email: str = Form(...), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    existing = db.query(models.StoryView).filter(
        models.StoryView.story_id == story_id,
        models.StoryView.viewer_id == user.id
    ).first()
    if not existing:
        view = models.StoryView(story_id=story_id, viewer_id=user.id)
        db.add(view)
        db.commit()
    return {"message": "viewed"}


@app.delete("/stories/{story_id}")
def delete_story(story_id: int, email: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    story = db.query(models.Story).filter(models.Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    if story.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not your story")
    db.delete(story)
    db.commit()
    return {"message": "Story deleted"}


@app.post("/stories/{story_id}/like")
def toggle_story_like(story_id: int, email: str = Form(...), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    story = db.query(models.Story).filter(models.Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    existing = db.query(models.StoryLike).filter(
        models.StoryLike.story_id == story_id,
        models.StoryLike.user_id == user.id
    ).first()

    if existing:
        db.delete(existing)
        db.commit()
        return {"has_liked": False, "likes_count": db.query(models.StoryLike).filter(models.StoryLike.story_id == story_id).count()}
    else:
        db.add(models.StoryLike(story_id=story_id, user_id=user.id))
        db.commit()
        # Notify story owner
        owner = db.query(models.User).filter(models.User.id == story.user_id).first()
        if owner and owner.id != user.id:
            db.add(models.Notification(
                recipient_id=owner.id,
                actor_id=user.id,
                type="story_like"
            ))
            db.commit()
        return {"has_liked": True, "likes_count": db.query(models.StoryLike).filter(models.StoryLike.story_id == story_id).count()}


@app.post("/stories/{story_id}/comment")
def add_story_comment(story_id: int, email: str = Form(...), content: str = Form(...), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    story = db.query(models.Story).filter(models.Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    comment = models.StoryComment(story_id=story_id, user_id=user.id, content=content)
    db.add(comment)
    db.commit()
    db.refresh(comment)

    # Notify story owner
    owner = db.query(models.User).filter(models.User.id == story.user_id).first()
    if owner and owner.id != user.id:
        db.add(models.Notification(
            recipient_id=owner.id,
            actor_id=user.id,
            type="story_comment",
            content_preview=content[:80]
        ))
        db.commit()

    return {
        "comment": {
            "id": comment.id,
            "username": user.username,
            "profile_picture": user.profile_picture,
            "content": content,
            "created_at": comment.created_at
        }
    }


@app.get("/stories/{story_id}/details")
def get_story_details(story_id: int, email: str = None, db: Session = Depends(get_db)):
    """Returns like count, comment list, and whether current user liked it."""
    story = db.query(models.Story).filter(models.Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    likes_count = db.query(models.StoryLike).filter(models.StoryLike.story_id == story_id).count()
    has_liked = False
    if email:
        user = db.query(models.User).filter(models.User.email == email).first()
        if user:
            has_liked = db.query(models.StoryLike).filter(
                models.StoryLike.story_id == story_id,
                models.StoryLike.user_id == user.id
            ).first() is not None

    comments = db.query(models.StoryComment).filter(
        models.StoryComment.story_id == story_id
    ).order_by(models.StoryComment.created_at.asc()).all()

    return {
        "likes_count": likes_count,
        "has_liked": has_liked,
        "comments": [{
            "id": c.id,
            "username": c.user.username,
            "profile_picture": c.user.profile_picture,
            "content": c.content,
            "created_at": c.created_at
        } for c in comments]
    }


# ─── Notifications ────────────────────────────────────────────────────────────


@app.get("/notifications")
def get_notifications(email: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    notifs = db.query(models.Notification).filter(
        models.Notification.recipient_id == user.id
    ).order_by(models.Notification.created_at.desc()).limit(30).all()

    result = []
    for n in notifs:
        actor = db.query(models.User).filter(models.User.id == n.actor_id).first()
        follow_request_status = None
        if actor and n.type == "follow_request":
            pending = db.query(models.FollowRequest).filter(
                models.FollowRequest.follower_id == actor.id,
                models.FollowRequest.following_id == user.id
            ).first()
            follow_request_status = "pending" if pending else "handled"
        post_media_url = None
        if n.post_id:
            post = db.query(models.Post).filter(models.Post.id == n.post_id).first()
            if post:
                post_media_url = post.media_url

        result.append({
            "id": n.id,
            "type": n.type,
            "actor_username": actor.username if actor else "unknown",
            "actor_profile_picture": actor.profile_picture if actor else None,
            "post_id": n.post_id,
            "post_media_url": post_media_url,
            "content_preview": n.content_preview,
            "follow_request_status": follow_request_status,
            "is_read": n.is_read,
            "created_at": n.created_at
        })
    return {"notifications": result}


@app.get("/notifications/unread-count")
def get_unread_count(email: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        return {"count": 0}
    count = db.query(models.Notification).filter(
        models.Notification.recipient_id == user.id,
        models.Notification.is_read == False
    ).count()
    return {"count": count}


@app.post("/notifications/mark-read")
def mark_all_read(email: str = Form(...), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.query(models.Notification).filter(
        models.Notification.recipient_id == user.id,
        models.Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"message": "All marked as read"}
