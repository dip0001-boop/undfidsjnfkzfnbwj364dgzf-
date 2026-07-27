async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

let dashboardData = null;

function showDashboard() {
  document.getElementById("login").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");
}

function timeAgo(ts) {
  if (!ts) return "Never";
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function render() {
  const active = dashboardData.activeUsers || [];
  const users = dashboardData.users || [];

  document.getElementById("activeCount").textContent = active.length;
  document.getElementById("userCount").textContent = users.length;
  document.getElementById("lockedCount").textContent = users.filter(u => u.locked).length;
  document.getElementById("maintenanceStatus").textContent = dashboardData.maintenance ? "ON" : "OFF";

  const toggle = document.getElementById("maintenanceToggle");
  toggle.textContent = dashboardData.maintenance ? "DISABLE MAINTENANCE" : "ENABLE MAINTENANCE";

  const query = document.getElementById("userSearch").value.toLowerCase();
  const filtered = users.filter(u => u.username.toLowerCase().includes(query));

  document.getElementById("usersTable").innerHTML = `
    <div class="table">
      <div class="row header-row"><div>USERNAME</div><div>USER ID</div><div>LAST LOGIN</div><div>STATUS</div><div>ACTION</div></div>
      ${filtered.map(u => `
        <div class="row">
          <div><strong>${u.username}</strong></div>
          <div>${u.userId || "—"}</div>
          <div>${timeAgo(u.lastLogin)}</div>
          <div><span class="pill ${u.locked ? "locked" : "ok"}">${u.locked ? "LOCKED" : "OK"}</span></div>
          <div>${u.locked ? `<button class="control-btn unblock" data-user="${u.username}">UNBLOCK</button>` : "—"}</div>
        </div>
      `).join("")}
    </div>
  `;

  document.querySelectorAll(".unblock").forEach(btn => {
    btn.onclick = async () => {
      await api("/api/admin/unblock", {
        method: "POST",
        body: JSON.stringify({ username: btn.dataset.user })
      });
      await load();
    };
  });

  document.getElementById("activityTable").innerHTML = `
    <div class="table">
      <div class="row header-row"><div>USERNAME</div><div>USER ID</div><div>LAST ACTIVE</div><div>CURRENT GAME</div><div>RECENT HISTORY</div></div>
      ${active.length ? active.map(u => `
        <div class="row">
          <div><strong>${u.username}</strong></div>
          <div>${u.userId}</div>
          <div>${timeAgo(u.lastActive)}</div>
          <div><span class="pill">${u.currentGame || "Browsing library"}</span></div>
          <div class="history">${(u.history || []).slice(0, 5).map(x => x.name).join(" · ") || "No games yet"}</div>
        </div>
      `).join("") : `<div class="row"><div>No active users.</div></div>`}
    </div>
  `;
}

async function load() {
  dashboardData = await api("/api/admin/dashboard");
  render();
}

document.getElementById("adminLogin").onsubmit = async e => {
  e.preventDefault();
  document.getElementById("error").textContent = "";
  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: document.getElementById("username").value,
        password: document.getElementById("password").value
      })
    });
    const me = await api("/api/me");
    if (me.user.role !== "admin") throw new Error("Admin access required");
    document.getElementById("adminIdentity").textContent = `Admin ID: ${me.user.userId}`;
    showDashboard();
    await load();
  } catch (err) {
    document.getElementById("error").textContent = err.message;
  }
};

document.getElementById("maintenanceToggle").onclick = async () => {
  await api("/api/admin/maintenance", {
    method: "POST",
    body: JSON.stringify({ enabled: !dashboardData.maintenance })
  });
  await load();
};

document.getElementById("refresh").onclick = load;
document.getElementById("userSearch").oninput = render;

document.getElementById("logout").onclick = async () => {
  await api("/api/logout", { method: "POST" });
  location.reload();
};

load().catch(() => {});
setInterval(() => load().catch(() => {}), 15000);