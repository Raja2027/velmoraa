import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import engine, Base
import models

def reset_database():
    print("Dropping all tables...")
    Base.metadata.drop_all(bind=engine)
    print("Recreating all tables...")
    Base.metadata.create_all(bind=engine)
    
    print("Recreating HNSW vector index...")
    from sqlalchemy import text
    with engine.connect() as conn:
        conn.execute(text("CREATE INDEX IF NOT EXISTS user_embeddings_vector_idx ON user_embeddings USING hnsw (embedding_vector vector_cosine_ops)"))
        conn.commit()
        
    print("Database has been completely reset!")

if __name__ == "__main__":
    reset_database()
