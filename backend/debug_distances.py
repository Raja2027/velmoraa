import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from sqlalchemy.orm import Session
from database import SessionLocal
import models
import numpy as np

db = SessionLocal()
users = db.query(models.User).filter(models.User.profile_picture.isnot(None)).all()

for u1 in users:
    e1 = db.query(models.UserEmbedding).filter(models.UserEmbedding.user_id == u1.id).first()
    if not e1: continue
    v1 = np.array(e1.embedding_vector)
    
    for u2 in users:
        e2 = db.query(models.UserEmbedding).filter(models.UserEmbedding.user_id == u2.id).first()
        if not e2: continue
        v2 = np.array(e2.embedding_vector)
        
        # cosine distance
        dist = 1.0 - np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))
        print(f"Distance between {u1.username} and {u2.username}: {dist:.4f} (Conf: {(1-dist)*100:.2f}%)")
        
db.close()
