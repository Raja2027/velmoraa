import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import models

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:54321/velmoraa")
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

print("Vaults:")
vaults = db.query(models.Vault).all()
for v in vaults:
    print(f"Vault ID: {v.id}, Name: {v.name}")

print("Notifications:")
notifs = db.query(models.Notification).filter(models.Notification.type == "ghost_tag").all()
for n in notifs:
    print(f"ID: {n.id}, Actor: {n.actor_id}, Recipient: {n.recipient_id}, Type: {n.type}, Preview: {n.content_preview}")
