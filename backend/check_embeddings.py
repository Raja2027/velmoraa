import os, sys, numpy as np
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database import SessionLocal
import models

db = SessionLocal()
users = db.query(models.User).all()

print("=== Embedding Shift Check ===")
for user in users:
    emb = db.query(models.UserEmbedding).filter(models.UserEmbedding.user_id == user.id).first()
    if not emb:
        print(f"[{user.username}] No embedding record at all.")
        continue

    vec = np.array(emb.embedding_vector)
    norm = np.linalg.norm(vec)
    print(f"[{user.username}]")
    print(f"  Embedding norm   : {norm:.6f} (should be ~1.0 for unit ArcFace vectors)")
    print(f"  Embedding dim    : {len(vec)}")

    # Check posts
    posts = db.query(models.Post).filter(models.Post.user_id == user.id).all()
    print(f"  Posts in DB      : {len(posts)}")
    for p in posts:
        print(f"    post media: {p.media_url}")

print("=============================")
db.close()
