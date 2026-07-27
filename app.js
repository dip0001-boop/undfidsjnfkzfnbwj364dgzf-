import { games } from "./games.js";

const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");
const loginForm = document.getElementById("loginForm");
const loginMsg = document.getElementById("loginMsg");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const logoutBtn = document.getElementById("logoutBtn");
const refreshBtn = document.getElementById("refreshBtn");
const userBadge = document.getElementById("userBadge");
const maintenanceBanner = document.getElementById("maintenanceBanner");
const adminDock = document.getElementById("adminDock");
const toggleMaintenanceBtn = document.getElementById("toggleMaintenanceBtn");
const resetAllBtn = document.getElementById("resetAllBtn");
const unblockBtn = document.getElementById("unblockBtn");
const unblockUser = document.getElementById("unblockUser");
const adminSummary = document.getElementById("adminSummary");
const activeUsersList = document.getElementById("activeUsersList");
const gameGrid = document.getElementById("gameGrid");
const featuredRow = document.getElementById("featuredRow");
const libraryCount = document.getElementById("libraryCount");
const searchBox = document.getElementById("searchBox");
const categoryFilter = document.getElementById("categoryFilter");

let currentUser = null;
let currentState = null;
let pingTimer = null;

function safeText(value) {
  return String(value).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[m]);
}

function timeAgo(ts) {
  if (!ts) return "never";
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function showLogin(message = "") {
  loginView.classList.remove("hidden");
  appView.classList.add("hidden");
  loginMsg.textContent = message;
}

function showApp() {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
}

function renderFeatured() {
  const featured = games.filter((g) => g.featured).slice(0, 2);

  featuredRow.innerHTML = featured.map((game) => `
    <article class="feature-card">
      <h3>${safeText(game.name)}</h3>
      <p>${safeText(game.description || game.tag || "Featured game")}</p>
      <p class="game-meta">${safeText(game.category)} · ${safeText(game.tag)}</p>
    </article>
  `).join("");
}

function renderCategoryOptions() {
  const categories = [...new Set(games.map((g) => g.category))].sort();
  categoryFilter.innerHTML = `<option value="">All categories</option>` + categories
    .map((cat) => `<option value="${safeText(cat)}">${safeText(cat)}</option>`)
    .join("");
}

function renderGames() {
  const q = searchBox.value.trim().toLowerCase();
  const cat = categoryFilter.value;

  const filtered = games.filter((game) => {
    const hay = `${game.name} ${game.category} ${game.tag} ${game.description || ""}`.toLowerCase();
    const matchesSearch = !q || hay.includes(q);
    const matchesCategory = !cat || game.category === cat;
    return matchesSearch && matchesCategory;
  });

  libraryCount.textContent = `${filtered.length} / ${games.length} games shown`;

  gameGrid.innerHTML = filtered.map((game) => `
    <article class="game-card">
      <div>
        <h3>${safeText(game.name)}</h3>
        <div class="game-meta">${safeText(game.category)} · ${safeText(game.tag)}</div>
        <p>${safeText(game.description || "Added to THE VAULT")}</p>
      </div>
      <div class="game-actions">
        <button class="launch-btn" data-name="${safeText(game.name)}">Open</button>
        <button class="secondary copy-btn" data-name="${safeText(game.name)}">History</button>
      </div>
    </article>
  `).join("");

  gameGrid.querySelectorAll(".launch-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const name = btn.dataset.name;
      await api("/api/game/open", {
        method: "POST",
        body: JSON.stringify({ gameName: name })
      });
      await loadSession();
      alert(`Opened: ${name}`);
    });
  });

  gameGrid.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const name = btn.dataset.name;
      await api("/api/game/open", {
        method: "POST",
        body: JSON.stringify({ gameName: name })
      });
      await loadSession();
    });
  });
}

function renderAdmin(state) {
  if (!state) return;

  const activeUsers = state.activeUsers || [];
  const users = state.users || [];

  adminSummary.textContent =
    `Active users: ${activeUsers.length}\n` +
    `Registered logins: ${users.length}\n` +
    `Maintenance: ${state.maintenance ? "ON" : "OFF"}`;

  if (!activeUsers.length) {
    activeUsersList.innerHTML = `<div class="active-user">No active users right now.</div>`;
    return;
  }

  activeUsersList.innerHTML = activeUsers.map((u) => {
    const history = (u.history || [])
      .slice(0, 5)
      .map((h) => safeText(h.name))
      .join(" • ") || "No history yet";

    return `
      <div class="active-user">
        <strong>${safeText(u.username || "Unknown")}</strong><br>
        ID: ${safeText(u.userId || "—")}<br>
        Role: ${safeText(u.role || "user")}<br>
        Last active: ${safeText(timeAgo(u.lastActive))}<br>
        Current game: ${safeText(u.currentGame || "None")}<br>
        History: ${history}
      </div>
    `;
  }).join("");
}

async function ping() {
  try {
    await api("/api/ping", { method: "POST" });
  } catch {
  }
}

async function loadSession() {
  try {
    const me = await api("/api/me");
    currentUser = me.user;
    showApp();

    userBadge.textContent =
      me.user.role === "admin"
        ? `Admin · ID ${me.user.userId}`
        : `User ${me.user.username} · ID ${me.user.userId}`;

    const state = await api("/api/state");
    currentState = state;

    maintenanceBanner.classList.toggle("hidden", !(state.maintenance && me.user.role !== "admin"));
    adminDock.classList.toggle("hidden", me.user.role !== "admin");

    renderFeatured();
    renderGames();

    if (me.user.role === "admin") {
      renderAdmin(state);
    }
  } catch {
    currentUser = null;
    currentState = null;
    showLogin("");
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginMsg.textContent = "";

  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: usernameInput.value,
        password: passwordInput.value
      })
    });

    passwordInput.value = "";
    await loadSession();
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(ping, 20000);
    ping();
  } catch (err) {
    loginMsg.textContent = err.message;
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await api("/api/logout", { method: "POST" });
  } finally {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
    showLogin("");
  }
});

refreshBtn.addEventListener("click", loadSession);

toggleMaintenanceBtn?.addEventListener("click", async () => {
  await api("/api/admin/toggle-maintenance", { method: "POST" });
  await loadSession();
});

resetAllBtn?.addEventListener("click", async () => {
  await api("/api/admin/reset-all-locks", { method: "POST" });
  await loadSession();
});

unblockBtn?.addEventListener("click", async () => {
  const username = unblockUser.value.trim();
  if (!username) return;

  await api("/api/admin/unblock", {
    method: "POST",
    body: JSON.stringify({ username })
  });

  unblockUser.value = "";
  await loadSession();
});

searchBox.addEventListener("input", renderGames);
categoryFilter.addEventListener("change", renderGames);

window.addEventListener("focus", ping);

renderCategoryOptions();
renderFeatured();
renderGames();
loadSession();
