import os
from sqlalchemy import create_engine
import models

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:54321/velmoraa")
engine = create_engine(SQLALCHEMY_DATABASE_URL)
models.Base.metadata.create_all(bind=engine)
print("Vault tables created successfully!")
