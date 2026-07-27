import express from "express";
import session from "express-session";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

const USER_PASSWORD = process.env.USER_PASSWORD || "Kiwifruit 46!";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Lemon3!";
const SESSION_SECRET = process.env.SESSION_SECRET || "change-this-in-render";
const LOCK_MS = 24 * 60 * 60 * 1000;
const STATE_FILE = path.join(__dirname, "state.json");

const defaultState = { maintenance: false, users: {}, sessions: {} };

function loadState() {
  if (!fs.existsSync(STATE_FILE)) fs.writeFileSync(STATE_FILE, JSON.stringify(defaultState, null, 2));
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return { ...defaultState, ...s };
  } catch {
    fs.writeFileSync(STATE_FILE, JSON.stringify(defaultState, null, 2));
    return structuredClone(defaultState);
  }
}

function saveState(s) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

function key(v) {
  return String(v || "").trim().toLowerCase();
}

function id() {
  return crypto.randomBytes(5).toString("hex").toUpperCase();
}

function equal(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function locked(user) {
  return user.lockedUntil && Date.now() < user.lockedUntil;
}

function auth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Not logged in" });
  const state = loadState();
  const sessionUser = state.sessions[req.session.id];
  if (sessionUser) {
    sessionUser.lastActive = Date.now();
    state.sessions[req.session.id] = sessionUser;
    saveState(state);
  }
  next();
}

function admin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
}

app.use(express.json({ limit: "1mb" }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax" }
}));
app.use(express.static(__dirname));

app.get("/", (_, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/admin", (_, res) => res.sendFile(path.join(__dirname, "admin.html")));

app.post("/api/login", (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  if (!username || !password) return res.status(400).json({ error: "Enter username and password" });

  const state = loadState();
  const k = key(username);
  const record = state.users[k] ||= {
    username,
    userId: null,
    attempts: 0,
    lockedUntil: 0,
    lastLogin: 0
  };

  if (locked(record)) {
    return res.status(423).json({ error: "Locked until " + new Date(record.lockedUntil).toLocaleString() });
  }

  const isAdmin = k === "admin" && equal(password, ADMIN_PASSWORD);
  const isUser = equal(password, USER_PASSWORD);

  if (!isAdmin && !isUser) {
    record.attempts++;
    if (record.attempts >= 3) {
      record.attempts = 0;
      record.lockedUntil = Date.now() + LOCK_MS;
      saveState(state);
      return res.status(423).json({ error: "Too many attempts. Locked for 24 hours." });
    }
    saveState(state);
    return res.status(401).json({ error: `Wrong password. ${3 - record.attempts} attempts remaining.` });
  }

  record.attempts = 0;
  record.lockedUntil = 0;
  record.lastLogin = Date.now();
  record.userId = id();
  saveState(state);

  req.session.user = {
    username,
    role: isAdmin ? "admin" : "user",
    userId: record.userId
  };

  state.sessions[req.session.id] = {
    username,
    role: req.session.user.role,
    userId: record.userId,
    lastActive: Date.now(),
    currentGame: null,
    history: []
  };
  saveState(state);

  res.json({ ok: true, user: req.session.user });
});

app.get("/api/me", auth, (req, res) => {
  const state = loadState();
  res.json({
    user: req.session.user,
    maintenance: state.maintenance
  });
});

app.post("/api/ping", auth, (req, res) => {
  const state = loadState();
  if (state.sessions[req.session.id]) {
    state.sessions[req.session.id].lastActive = Date.now();
    saveState(state);
  }
  res.json({ ok: true });
});

app.post("/api/game/open", auth, (req, res) => {
  const name = String(req.body.name || "").trim();
  const state = loadState();
  const s = state.sessions[req.session.id];
  if (!s) return res.status(401).json({ error: "Session missing" });

  s.currentGame = name;
  s.lastActive = Date.now();
  s.history.unshift({ name, at: Date.now() });
  s.history = s.history.slice(0, 25);
  saveState(state);
  res.json({ ok: true });
});

app.post("/api/game/close", auth, (req, res) => {
  const state = loadState();
  const s = state.sessions[req.session.id];
  if (s) {
    s.currentGame = null;
    s.lastActive = Date.now();
    saveState(state);
  }
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  const state = loadState();
  delete state.sessions[req.session.id];
  saveState(state);
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/admin/dashboard", admin, (req, res) => {
  const state = loadState();
  const now = Date.now();
  const active = Object.values(state.sessions)
    .filter(s => now - s.lastActive < 5 * 60 * 1000)
    .sort((a, b) => b.lastActive - a.lastActive);

  const users = Object.entries(state.users).map(([username, u]) => ({
    username,
    ...u,
    locked: locked(u)
  }));

  res.json({
    maintenance: state.maintenance,
    activeUsers: active,
    users
  });
});

app.post("/api/admin/maintenance", admin, (req, res) => {
  const state = loadState();
  state.maintenance = Boolean(req.body.enabled);
  saveState(state);
  res.json({ ok: true, maintenance: state.maintenance });
});

app.post("/api/admin/unblock", admin, (req, res) => {
  const username = key(req.body.username);
  const state = loadState();
  if (!state.users[username]) return res.status(404).json({ error: "User not found" });
  state.users[username].attempts = 0;
  state.users[username].lockedUntil = 0;
  saveState(state);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`THE VAULT running on port ${PORT}`);
});