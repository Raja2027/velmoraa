import os
import sys

# Setup environment to run scripts standalone
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from database import SessionLocal
import models
from face_utils import get_face_embedding

def main():
    db = SessionLocal()
    users = db.query(models.User).filter(models.User.profile_picture.isnot(None)).all()
    
    print(f"Found {len(users)} users with profile pictures.")
    
    for user in users:
        print(f"Processing {user.username}...")
        if not user.profile_picture or len(user.profile_picture.strip('/')) == 0:
            print(f"Skipping {user.username}: No valid profile picture path.")
            continue
            
        # Local path is 'public' + profile_picture
        image_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public", user.profile_picture.lstrip('/'))
        image_path = os.path.normpath(image_path)
        
        if not os.path.isfile(image_path):
            print(f"Image file not found for {user.username}: {image_path}")
            continue
            
        try:
            with open(image_path, "rb") as f:
                image_bytes = f.read()
                
            new_embedding = get_face_embedding(image_bytes)
            
            emb_record = db.query(models.UserEmbedding).filter(models.UserEmbedding.user_id == user.id).first()
            if emb_record:
                emb_record.embedding_vector = new_embedding
            else:
                new_emb_record = models.UserEmbedding(user_id=user.id, embedding_vector=new_embedding)
                db.add(new_emb_record)
                
            db.commit()
            print(f"Successfully updated embedding for {user.username}.")
        except Exception as e:
            print(f"Failed to update {user.username}: {str(e)}")
            db.rollback()
            
    print("Done.")
    db.close()

if __name__ == "__main__":
    main()
