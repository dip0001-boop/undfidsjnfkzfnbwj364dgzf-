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
const SESSION_SECRET = process.env.SESSION_SECRET || "change-this-secret-in-production";
const LOCK_DURATION_MS = 24 * 60 * 60 * 1000;

const STATE_FILE = path.join(__dirname, "state.json");

const DEFAULT_STATE = {
  maintenance: false,
  users: {},
  sessions: {}
};

function ensureStateFile() {
  if (!fs.existsSync(STATE_FILE)) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(DEFAULT_STATE, null, 2));
  }
}

function loadState() {
  ensureStateFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return {
      maintenance: Boolean(parsed.maintenance),
      users: parsed.users && typeof parsed.users === "object" ? parsed.users : {},
      sessions: parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {}
    };
  } catch {
    fs.writeFileSync(STATE_FILE, JSON.stringify(DEFAULT_STATE, null, 2));
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function normalizeName(name) {
  return String(name || "").trim().toLowerCase();
}

function randomUserId() {
  return crypto.randomBytes(5).toString("hex").toUpperCase();
}

function secureEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function getUserRecord(state, username) {
  const key = normalizeName(username);
  if (!state.users[key]) {
    state.users[key] = {
      attempts: 0,
      lockedUntil: 0,
      lastLoginAt: null,
      userId: null,
      displayName: username
    };
  }
  return state.users[key];
}

function isLocked(record) {
  return record.lockedUntil && Date.now() < record.lockedUntil;
}

function touchSession(state, sid, patch = {}) {
  const existing = state.sessions[sid] || {};
  state.sessions[sid] = {
    ...existing,
    ...patch,
    lastActive: Date.now(),
    history: Array.isArray(existing.history) ? existing.history : []
  };
}

function authRequired(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ ok: false, error: "Not logged in." });
  }

  const state = loadState();
  if (state.sessions[req.session.id]) {
    touchSession(state, req.session.id, state.sessions[req.session.id]);
    saveState(state);
  }

  next();
}

function adminRequired(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).json({ ok: false, error: "Admin only." });
  }
  next();
}

function cleanupState(state) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [sid, info] of Object.entries(state.sessions)) {
    if ((info.lastActive || 0) < cutoff) {
      delete state.sessions[sid];
    }
  }
}

app.use(express.json());
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax"
    }
  })
);

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/me", authRequired, (req, res) => {
  const state = loadState();
  res.json({
    ok: true,
    user: req.session.user,
    maintenance: state.maintenance
  });
});

app.post("/api/ping", authRequired, (req, res) => {
  const state = loadState();
  const current = state.sessions[req.session.id];
  if (current) {
    touchSession(state, req.session.id, current);
    saveState(state);
  }
  res.json({ ok: true });
});

app.get("/api/state", authRequired, (req, res) => {
  const state = loadState();
  cleanupState(state);
  saveState(state);

  const base = {
    ok: true,
    maintenance: state.maintenance,
    user: req.session.user
  };

  if (req.session.user.role === "admin") {
    const activeUsers = Object.entries(state.sessions)
      .map(([sessionId, info]) => ({
        sessionId,
        userId: info.userId || "",
        username: info.username || "",
        role: info.role || "user",
        lastActive: info.lastActive || 0,
        currentGame: info.currentGame || "",
        history: Array.isArray(info.history) ? info.history : []
      }))
      .sort((a, b) => b.lastActive - a.lastActive);

    const users = Object.entries(state.users).map(([username, record]) => ({
      username,
      userId: record.userId || "",
      lastLoginAt: record.lastLoginAt || 0,
      attempts: record.attempts || 0,
      lockedUntil: record.lockedUntil || 0,
      locked: isLocked(record)
    }));

    return res.json({ ...base, activeUsers, users });
  }

  res.json(base);
});

app.post("/api/login", (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "Enter a username and password." });
  }

  const state = loadState();
  const record = getUserRecord(state, username);

  if (isLocked(record)) {
    return res.status(423).json({
      ok: false,
      error: "This account is locked for 24 hours.",
      lockedUntil: record.lockedUntil
    });
  }

  const isAdminLogin = normalizeName(username) === "admin" && secureEqual(password, ADMIN_PASSWORD);
  const isUserLogin = secureEqual(password, USER_PASSWORD);

  if (!isAdminLogin && !isUserLogin) {
    record.attempts = (record.attempts || 0) + 1;

    if (record.attempts >= 3) {
      record.lockedUntil = Date.now() + LOCK_DURATION_MS;
      record.attempts = 0;
      saveState(state);
      return res.status(423).json({
        ok: false,
        error: "Too many wrong attempts. Locked for 24 hours.",
        lockedUntil: record.lockedUntil
      });
    }

    saveState(state);
    return res.status(401).json({
      ok: false,
      error: `Wrong password. ${3 - record.attempts} tries left before lockout.`
    });
  }

  const userId = randomUserId();

  record.attempts = 0;
  record.lockedUntil = 0;
  record.lastLoginAt = Date.now();
  record.userId = userId;
  record.displayName = username;
  saveState(state);

  req.session.user = {
    username,
    role: isAdminLogin ? "admin" : "user",
    userId
  };

  touchSession(state, req.session.id, {
    userId,
    username,
    role: req.session.user.role,
    currentGame: "",
    history: []
  });
  saveState(state);

  res.json({
    ok: true,
    user: req.session.user,
    maintenance: state.maintenance
  });
});

app.post("/api/game/open", authRequired, (req, res) => {
  const gameName = String(req.body.gameName || "").trim();
  if (!gameName) {
    return res.status(400).json({ ok: false, error: "Game name is required." });
  }

  const state = loadState();
  const current = state.sessions[req.session.id];

  if (current) {
    const history = Array.isArray(current.history) ? current.history : [];
    history.unshift({ name: gameName, at: Date.now() });
    current.history = history.slice(0, 12);
    current.currentGame = gameName;
    current.lastActive = Date.now();
    current.userId = current.userId || req.session.user.userId;
    current.username = current.username || req.session.user.username;
    current.role = req.session.user.role;
    state.sessions[req.session.id] = current;
    saveState(state);
  }

  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  const state = loadState();
  delete state.sessions[req.session.id];
  saveState(state);

  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.post("/api/admin/toggle-maintenance", adminRequired, (req, res) => {
  const state = loadState();
  state.maintenance = !state.maintenance;
  saveState(state);
  res.json({ ok: true, maintenance: state.maintenance });
});

app.post("/api/admin/unblock", adminRequired, (req, res) => {
  const username = normalizeName(req.body.username);
  if (!username) {
    return res.status(400).json({ ok: false, error: "Username is required." });
  }

  const state = loadState();
  const record = state.users[username];

  if (!record) {
    return res.status(404).json({ ok: false, error: "User not found." });
  }

  record.attempts = 0;
  record.lockedUntil = 0;
  saveState(state);

  res.json({ ok: true });
});

app.post("/api/admin/reset-all-locks", adminRequired, (req, res) => {
  const state = loadState();
  for (const key of Object.keys(state.users)) {
    state.users[key].attempts = 0;
    state.users[key].lockedUntil = 0;
  }
  saveState(state);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`THE VAULT running on http://localhost:${PORT}`);
});
