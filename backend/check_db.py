import sqlite3
from pathlib import Path

conn = sqlite3.connect(Path(__file__).with_name("velmoraa.db"))
c = conn.cursor()

c.execute("SELECT * FROM follow_requests")
requests = c.fetchall()
print("Follow Requests:")
for r in requests:
    print(r)

c.execute("SELECT id, username FROM users WHERE username IN ('raveena', 'HaniaAmir', 'rajabsh')")
users = c.fetchall()
print("Users:")
for u in users:
    print(u)
