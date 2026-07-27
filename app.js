import { games } from "./games.js";

const $ = id => document.getElementById(id);
let user = null;
let allGames = games;

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function show(id) {
  ["loginScreen", "maintenanceScreen", "app"].forEach(x => $(x).classList.add("hidden"));
  $(id).classList.remove("hidden");
}

function renderCategories() {
  const cats = [...new Set(allGames.map(g => g.category))].sort();
  $("category").innerHTML = `<option value="">All categories</option>` +
    cats.map(c => `<option>${c}</option>`).join("");
}

function render() {
  const q = $("search").value.toLowerCase();
  const cat = $("category").value;
  const filtered = allGames.filter(g =>
    (!q || `${g.name} ${g.category} ${g.description}`.toLowerCase().includes(q)) &&
    (!cat || g.category === cat)
  );

  $("count").textContent = `${filtered.length} games`;
  $("games").innerHTML = filtered.map(g => `
    <article class="game-card">
      <div>
        <h3>${g.name}</h3>
        <div class="game-meta">${g.category} · ${g.tag}</div>
        <p>${g.description}</p>
      </div>
      <button data-game="${g.id}">PLAY NOW</button>
    </article>
  `).join("");

  document.querySelectorAll("[data-game]").forEach(btn => {
    btn.onclick = async () => {
      const game = allGames.find(g => g.id === btn.dataset.game);
      await api("/api/game/open", { method: "POST", body: JSON.stringify({ name: game.name }) });
      location.href = game.url;
    };
  });
}

function renderFeatured() {
  $("featured").innerHTML = allGames.filter(g => g.featured).map(g => `
    <article class="featured-card">
      <h3>${g.name}</h3>
      <p>${g.description}</p>
      <div class="game-meta">${g.category} · Featured</div>
    </article>
  `).join("");
}

async function start() {
  try {
    const me = await api("/api/me");
    user = me.user;

    if (me.maintenance && user.role !== "admin") {
      show("maintenanceScreen");
      return;
    }

    show("app");
    $("userInfo").textContent = `${user.username} · ID ${user.userId}`;
    if (user.role === "admin") $("adminLink").classList.remove("hidden");

    renderCategories();
    renderFeatured();
    render();
  } catch {
    show("loginScreen");
  }
}

$("loginForm").onsubmit = async e => {
  e.preventDefault();
  $("loginError").textContent = "";
  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: $("username").value,
        password: $("password").value
      })
    });
    await start();
  } catch (err) {
    $("loginError").textContent = err.message;
  }
};

$("search").oninput = render;
$("category").onchange = render;

async function logout() {
  await api("/api/logout", { method: "POST" });
  show("loginScreen");
}

$("logout").onclick = logout;
$("maintenanceLogout").onclick = logout;

setInterval(() => api("/api/ping", { method: "POST" }).catch(() => {}), 20000);
start();