import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import models

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:54321/velmoraa")
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

print("Follow Requests:")
requests = db.query(models.FollowRequest).all()
for r in requests:
    print(f"Follower: {r.follower_id}, Following: {r.following_id}")

print("Users:")
users = db.query(models.User).filter(models.User.username.in_(['raveena', 'HaniaAmir', 'rajabsh'])).all()
for u in users:
    print(f"ID: {u.id}, Username: {u.username}")

print("Notifications:")
notifs = db.query(models.Notification).filter(models.Notification.type == "follow_request").all()
for n in notifs:
    print(f"ID: {n.id}, Actor: {n.actor_id}, Recipient: {n.recipient_id}, Type: {n.type}")
