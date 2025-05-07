import base64
import requests
import scratchattach as sa
from flask import Flask, jsonify, request
from datetime import datetime
import threading
import time
import os

# --------------------- GitHub Settings ---------------------
GITHUB_API_KEY = os.getenv('GH_KEY')
REPO_OWNER = "kRxZykRxZy"
REPO_NAME = "ScratchGems-MAIN"
BRANCH = "main"
HEADERS = {
    "Authorization": f"token {GITHUB_API_KEY}",
    "Accept": "application/vnd.github+json"
}

def github_file_path(name):
    return f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/contents/db/{name}.txt"

def github_load(name):
    url = github_file_path(name)
    try:
        res = requests.get(url, headers=HEADERS)
        if res.status_code == 404:
            print(f"{name}.txt not found on GitHub. Starting fresh.")
            return {}, None
        res.raise_for_status()
        content = res.json()
        remote_data = eval(base64.b64decode(content["content"]).decode())
        sha = content["sha"]
        return remote_data, sha
    except Exception as e:
        print(f"Failed to load {name} from GitHub. Error: {e}")
        return {}, None

def github_save(name, local_data, sha=None):
    url = github_file_path(name)
    raw = repr(local_data).encode()
    b64 = base64.b64encode(raw).decode()
    payload = {
        "message": f"update {name}",
        "content": b64,
        "branch": BRANCH
    }
    if sha:
        payload["sha"] = sha
    try:
        res = requests.put(url, headers=HEADERS, json=payload)
        res.raise_for_status()
        return res.json()["content"]["sha"]
    except Exception as e:
        print(f"Failed to save {name} to GitHub. Error: {e}")
        return sha

# --------------------- Databases ---------------------
db, sha_db = github_load("dict_balances")
notifications_db, sha_notifs = github_load("dict_notifications")
transactions_db, sha_tx = github_load("dict_transactions")
preferences_db, sha_prefs = github_load("dict_preferences")
users_db, sha_users = github_load("ps_us")

# --------------------- ScratchAttach ---------------------
project_id = 1134723891
session = sa.login("Dev-Server", os.getenv('SCRATCH_PS'))
cloud = session.connect_cloud(project_id)
cloud2 = session.connect_cloud(1169132014)
client2 = cloud2.requests()
client = cloud.requests(used_cloud_vars=["1‎", "2‎", "3‎", "4‎"])

# --------------------- Flask ---------------------
app = Flask(__name__)

# --------------------- Authentication ---------------------
@client2.request
def signup(password, username):
    global sha_users
    user = fix_name(username)
    if user in users_db:
        return "You Already Have An Account!"
    users_db[user] = password
    sha_users = github_save("ps_us", users_db, sha_users)
    return f"Welcome {user}!"

@client2.request
def login(ps, user):
    user = fix_name(user)
    if user not in users_db:
        return "User Not Found!"
    if users_db[user] != ps:
        return "Incorrect Password!"
    return f"Welcome {user}!"

@client.request
def ping():
    return "pong"

# --------------------- ScratchGems Handlers ---------------------
def fix_name(name):
    return name.replace(" ", "").replace("@", "").lower()

def set_balance(user, amount):
    global sha_db
    user = fix_name(user)
    db[user] = float(amount)
    sha_db = github_save("dict_balances", db, sha_db)

def get_balance(user):
    return round(db.get(fix_name(user), 100.0))

def generate_readable_timestamp():
    return datetime.now().strftime("%H:%M on %m/%d/%y")

def update_notifications(user, message):
    global sha_notifs
    user = fix_name(user)
    notifs = notifications_db.get(user, [])
    notifs.append(message)
    notifications_db[user] = notifs
    sha_notifs = github_save("dict_notifications", notifications_db, sha_notifs)

def update_preferences(user, prefs):
    global sha_prefs
    user = fix_name(user)
    preferences_db[user] = prefs
    sha_prefs = github_save("dict_preferences", preferences_db, sha_prefs)

def save_transaction(sender, receiver, amount):
    global sha_tx
    tx_id = f"{int(time.time())}_{sender}"
    transactions_db[tx_id] = {
        "timestamp": int(time.time()),
        "id": tx_id,
        "from": sender,
        "to": receiver,
        "amount": amount
    }
    sha_tx = github_save("dict_transactions", transactions_db, sha_tx)

@client.request
def balance(user):
    user = fix_name(user)
    if user not in db:
        set_balance(user, 100.0)
    return get_balance(user)

@client.request
def give(amount, users):
    try:
        amount = float(amount)
        recipient, sender = map(fix_name, users.split(" ", 1))
        if db.get(sender, 0) >= amount and amount > 0:
            set_balance(sender, db[sender] - amount)
            set_balance(recipient, db.get(recipient, 100.0) + amount)
            ts = generate_readable_timestamp()
            update_notifications(sender, f"{ts} - You gave {amount} Gems to {recipient}!")
            update_notifications(recipient, f"{ts} - {sender} gave you {amount} Gems")
            user = session.connect_user(recipient)
            user.post_comment(f"@{sender} gave you {amount} Gems in ScratchGems https://scratch.mit.edu/projects/{project_id}")
            save_transaction(sender, recipient, amount)
            return get_balance(sender)
        return "Insufficient balance."
    except Exception:
        return "Invalid request."

@client.request
def search(user):
    user = fix_name(user)
    if user in db:
        return f"{user} has {get_balance(user)} Gems!"
    return f"{user}'s balance couldn't be found."

@client.request
def leaderboard():
    top = sorted(db.items(), key=lambda x: x[1], reverse=True)[:10]
    return [f"{k}: {int(v)}" for k, v in top]

@client.request
def notifications(user):
    user = fix_name(user)
    return notifications_db.get(user, ["No notifications!"])

@client.request
def change_balance(user, amount):
    set_balance(user, float(amount))
    return "success!"

@client.request
def get_preferences(user):
    return list(preferences_db.get(fix_name(user), {"theme": "blue", "mute": "False"}).values())

@client.request
def set_preferences(theme, user):
    update_preferences(user, {"theme": theme, "mute": "False"})
    return "updated preferences"

@client.event
def on_ready():
    print("ScratchAttach request handler is running")

# --------------------- Flask API ---------------------
@app.route('/')
def home():
    return jsonify({
        "version": "v1",
        "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "docs": "https://scratchgems.onrender.com/docs",
        "user_count": len(db),
        "total_balance": round(sum(db.values()))
    })

@app.route('/users', methods=['GET'])
def get_users():
    return jsonify({"users": list(db.keys())})

@app.route('/balances', methods=['GET'])
def get_balances():
    return jsonify({k: round(v) for k, v in db.items()})

@app.route('/users/<username>', methods=['GET'])
def get_user(username):
    user = fix_name(username)
    if user not in db:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"username": user, "balance": get_balance(user)})

@app.route('/verify')
def verify():
    return jsonify({"verification": "api-verified-v1"})

@app.route('/transactions', methods=['GET'])
def get_all_transactions():
    return jsonify({"transactions": list(transactions_db.values())})

@app.route('/transactions/<username>', methods=['GET'])
def get_user_transactions(username):
    user = fix_name(username)
    filtered = [
        tx for tx in transactions_db.values()
        if fix_name(tx["from"]) == user or fix_name(tx["to"]) == user
    ]
    return jsonify({"transactions": filtered})

@app.route('/notifications/<username>', methods=['GET'])
def get_notifications(username):
    user = fix_name(username)
    return jsonify({"notifications": notifications_db.get(user, ["No notifications!"])})

@app.route('/docs')
def docs():
    return open("docs.html").read()

# --------------------- Run ---------------------
if __name__ == '__main__':
    client.start(thread=True)
    client2.start(thread=True)
    app.run(host="0.0.0.0", port=5000)
