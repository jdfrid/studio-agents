const loginForm = document.querySelector("#login");
const appEl = document.querySelector("#app");
const panel = document.querySelector("#panel");
const banner = document.querySelector("#banner");
let state = null;
let tab = "content";
let selected = null;

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { ...(options.body && !(options.body instanceof FormData) ? { "content-type": "application/json" } : {}) },
    ...options
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

async function refresh() {
  state = await api("/api/state");
  const params = new URLSearchParams(location.search);
  const note = params.get("connected") ? `חובר ${params.get("connected")}` : params.get("oauth_error") || "";
  banner.textContent = note;
  render();
}

function render() {
  if (tab === "content") renderContent();
  else if (tab === "accounts") renderAccounts();
  else if (tab === "calendar") renderCalendar();
  else if (tab === "internet") renderInternet();
  else if (tab === "results") renderResults();
  else renderPeople();
}

function renderContent() {
  const item = state.items.find((row) => row.id === selected) || null;
  panel.innerHTML = `
    <div class="card row">
      <button class="primary" type="button" id="import-kit">ייבוא ערכת פרומו</button>
      <button type="button" id="pull-all">משיכת סרטונים מוכנים</button>
      <input id="new-title" placeholder="כותרת פריט חדש" style="max-width:16rem">
      <button type="button" id="new-item">פריט ידני</button>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>כותרת</th><th>מקור</th><th>מדיה</th></tr></thead>
        <tbody>
          ${state.items.map((row) => `<tr data-id="${row.id}"><td>${esc(row.title)}</td><td>${esc(row.source)}</td><td>${row.mediaPath ? "יש קובץ" : "—"}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
    ${item ? editor(item) : ""}
  `;
  panel.querySelector("#import-kit").onclick = () => run(() => api("/api/import/kit", { method: "POST", body: "{}" }));
  panel.querySelector("#pull-all").onclick = () => run(() => api("/api/produce/pull", { method: "POST", body: "{}" }));
  panel.querySelector("#new-item").onclick = () => run(() => api("/api/items", { method: "POST", body: JSON.stringify({ title: panel.querySelector("#new-title").value }) }));
  panel.querySelectorAll("tr[data-id]").forEach((row) => {
    row.onclick = () => { selected = row.dataset.id; render(); };
  });
  if (!item) return;
  panel.querySelector("#save-item").onclick = () => run(async () => {
    const copy = structuredClone(item.copy);
    panel.querySelectorAll("[data-field]").forEach((node) => {
      const [group, key] = node.dataset.field.split(".");
      copy[group][key] = node.value;
    });
    await api(`/api/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ title: panel.querySelector("#item-title").value, summary: panel.querySelector("#item-summary").value, copy }) });
  });
  panel.querySelector("#upload").onchange = () => run(async () => {
    const data = new FormData();
    data.append("file", panel.querySelector("#upload").files[0]);
    await fetch(`/api/items/${item.id}/media`, { method: "POST", body: data }).then(async (response) => {
      if (!response.ok) throw new Error((await response.json()).error || "upload failed");
    });
  });
  panel.querySelector("#produce").onclick = () => run(() => api(`/api/items/${item.id}/produce`, { method: "POST", body: "{}" }));
  panel.querySelector("#pull").onclick = () => run(() => api(`/api/items/${item.id}/pull`, { method: "POST", body: "{}" }));
  panel.querySelector("#publish-now").onclick = () => run(() => api("/api/publish", { method: "POST", body: JSON.stringify({ itemId: item.id, destinationId: panel.querySelector("#dest").value }) }));
  panel.querySelector("#schedule").onclick = () => run(() => api("/api/schedule", { method: "POST", body: JSON.stringify({ itemId: item.id, destinationId: panel.querySelector("#dest").value, scheduledFor: new Date(panel.querySelector("#when").value).toISOString() }) }));
  panel.querySelectorAll("[data-export]").forEach((button) => {
    button.onclick = () => run(async () => {
      const pack = await api(`/api/items/${item.id}/export/${button.dataset.export}`);
      banner.textContent = pack.text;
      if (pack.mediaUrl) banner.innerHTML = `${esc(pack.text)}<br><a href="${pack.mediaUrl}">הורדת קובץ</a>`;
    });
  });
}

function editor(item) {
  const field = (group, key, label) => `<label>${label}<textarea data-field="${group}.${key}">${esc(item.copy[group]?.[key] || "")}</textarea></label>`;
  const dests = state.destinations.filter((row) => row.enabled).map((row) => `<option value="${row.id}">${esc(row.network)} · ${esc(row.name)}</option>`).join("");
  return `<div class="card">
    <label>כותרת<input id="item-title" value="${esc(item.title)}"></label>
    <label>תקציר<textarea id="item-summary">${esc(item.summary)}</textarea></label>
    ${field("youtube", "title", "YouTube כותרת")}
    ${field("youtube", "body", "YouTube תיאור")}
    ${field("tiktok", "body", "TikTok")}
    ${field("instagram", "body", "Instagram")}
    ${field("facebook", "body", "Facebook")}
    ${field("telegram", "body", "Telegram")}
    ${field("linkedin", "body", "LinkedIn")}
    ${field("x", "body", "X — ייצוא ידני")}
    ${field("email", "subject", "מייל נושא")}
    ${field("email", "body", "מייל")}
    ${field("article", "title", "מאמר כותרת")}
    ${field("article", "description", "מאמר תקציר")}
    ${field("article", "body", "מאמר")}
    <p class="row"><button class="primary" type="button" id="save-item">שמירה</button></p>
    <label>קובץ מדיה<input id="upload" type="file" accept="video/mp4,image/png,image/jpeg,image/webp"></label>
    <p class="row">
      <button type="button" id="produce">הפקה ב-Reelmino</button>
      <button type="button" id="pull">משיכת סרטון</button>
      <span class="muted">${item.reelminoRunId ? esc(item.reelminoRunId) : ""}</span>
    </p>
    <label>יעד<select id="dest">${dests}</select></label>
    <p class="row">
      <button class="primary" type="button" id="publish-now">פרסום עכשיו</button>
      <input id="when" type="datetime-local">
      <button type="button" id="schedule">תזמון מאושר</button>
    </p>
    <p class="row">
      ${["x", "whatsapp", "pinterest", "threads"].map((network) => `<button type="button" data-export="${network}">ייצוא ${network}</button>`).join("")}
    </p>
  </div>`;
}

function renderAccounts() {
  panel.innerHTML = `
    <div class="card">
      <p class="muted">לפני חיבור: אפליקציות מפתחים ב-Google, Meta, TikTok ו-LinkedIn, ערוץ YouTube, עמוד פייסבוק, אינסטגרם מקצועי, ובוט טלגרם כמנהל הערוץ. האישור אצל Meta, TikTok ו-LinkedIn הוא ידני. TikTok נכנס לטיוטות עד ש-TIKTOK_DIRECT_POST=1. ל-X אין חיבור אוטומטי.</p>
      ${state.networks.filter((row) => row.oauth || row.network === "telegram").map((row) => `<p>${esc(row.network)} — ${row.configured ? "מוגדר" : "חסר " + row.missingEnv.join(", ")} ${row.oauth ? `<button type="button" data-connect="${row.network}">חיבור</button>` : ""}</p>`).join("")}
      <label>טוקן בוט טלגרם<input id="tg-token"></label>
      <label>מזהה צ'אט או @ערוץ<input id="tg-chat"></label>
      <button type="button" id="tg-save">חיבור טלגרם</button>
    </div>
    <div class="card">
      ${state.connections.map((row) => `<p>${esc(row.network)} · ${esc(row.displayName)} · ${esc(row.status)}
        <button type="button" data-sync="${row.id}">רענון יעדים</button>
        <button type="button" data-drop="${row.id}">ניתוק</button></p>`).join("") || "<p>אין חשבונות</p>"}
    </div>
    <div class="card">
      <table>
        <thead><tr><th>יעד</th><th>רשת</th><th>פעיל</th><th>אוטומטי</th></tr></thead>
        <tbody>
          ${state.destinations.map((row) => `<tr>
            <td>${esc(row.name)}</td><td>${esc(row.network)}</td>
            <td><input type="checkbox" data-flag="enabled" data-id="${row.id}" ${row.enabled ? "checked" : ""}></td>
            <td><input type="checkbox" data-flag="autopilot" data-id="${row.id}" ${row.autopilot ? "checked" : ""}></td>
          </tr>`).join("")}
        </tbody>
      </table>
      <p class="muted">ברירת המחדל ידנית. אוטומטי מפרסם חריץ שמגיע לזמן בלי אישור נוסף. כיבוי יעד עוצר רק אותו.</p>
    </div>
  `;
  panel.querySelectorAll("[data-connect]").forEach((button) => {
    button.onclick = () => run(async () => {
      const started = await api(`/api/oauth/${button.dataset.connect}/start`, { method: "POST", body: "{}" });
      location.href = started.authorizeUrl;
    });
  });
  panel.querySelector("#tg-save").onclick = () => run(() => api("/api/connections/telegram", { method: "POST", body: JSON.stringify({ token: panel.querySelector("#tg-token").value, chatId: panel.querySelector("#tg-chat").value }) }));
  panel.querySelectorAll("[data-sync]").forEach((button) => { button.onclick = () => run(() => api(`/api/connections/${button.dataset.sync}/sync`, { method: "POST", body: "{}" })); });
  panel.querySelectorAll("[data-drop]").forEach((button) => { button.onclick = () => run(() => api(`/api/connections/${button.dataset.drop}`, { method: "DELETE" })); });
  panel.querySelectorAll("[data-flag]").forEach((box) => {
    box.onchange = () => run(() => api(`/api/destinations/${box.dataset.id}`, { method: "PATCH", body: JSON.stringify({ [box.dataset.flag]: box.checked }) }));
  });
}

function renderCalendar() {
  panel.innerHTML = `
    <div class="card row">
      <label>יום שני להתחלה<input id="monday" type="date" value="${esc(state.settings.startMonday || "")}"></label>
      <button class="primary" type="button" id="import-cal">ייבוא לוח 90 יום</button>
      <label><input id="email-auto" type="checkbox" ${state.settings.emailAutopilot ? "checked" : ""}> מייל אוטומטי</label>
      <label><input id="site-auto" type="checkbox" ${state.settings.siteAutopilot ? "checked" : ""}> אתר אוטומטי</label>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>זמן</th><th>פריט</th><th>רשת</th><th>מצב</th><th></th></tr></thead>
        <tbody>
          ${state.slots.slice(0, 80).map((row) => `<tr>
            <td>${esc(row.scheduledFor?.replace("T", " ").slice(0, 16))}</td>
            <td>${esc(row.itemTitle)}</td>
            <td>${esc(row.network)}${row.destinationName ? " · " + esc(row.destinationName) : ""}</td>
            <td>${esc(row.status)}${row.note ? " — " + esc(row.note) : ""}</td>
            <td>${row.status === "needs_review" || row.status === "failed" ? `<button type="button" data-approve="${row.id}">אישור ופרסום</button>` : ""}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
  panel.querySelector("#import-cal").onclick = () => run(() => api("/api/import/calendar", { method: "POST", body: JSON.stringify({ startMonday: panel.querySelector("#monday").value || undefined }) }));
  const saveFlags = () => run(() => api("/api/settings", { method: "PATCH", body: JSON.stringify({ emailAutopilot: panel.querySelector("#email-auto").checked, siteAutopilot: panel.querySelector("#site-auto").checked }) }));
  panel.querySelector("#email-auto").onchange = saveFlags;
  panel.querySelector("#site-auto").onchange = saveFlags;
  panel.querySelectorAll("[data-approve]").forEach((button) => { button.onclick = () => run(() => api(`/api/slots/${button.dataset.approve}/approve`, { method: "POST", body: "{}" })); });
}

function renderInternet() {
  panel.innerHTML = `
    <div class="card">
      <button class="primary" type="button" id="export-learn">ייצוא מאמרי /learn ו-sitemap</button>
      <p class="muted">הקבצים נכתבים לאתר הציבורי. העריכה נשארת כאן.</p>
    </div>
    ${state.directories.map((row) => `<div class="card">
      <strong>${esc(row.name)}</strong> · <a href="${esc(row.submitUrl)}" target="_blank" rel="noreferrer">טופס הגשה</a>
      <label>סטטוס<select data-dir="${row.id}" data-key="status">
        ${["todo", "drafted", "submitted", "listed"].map((status) => `<option ${status === row.status ? "selected" : ""}>${status}</option>`).join("")}
      </select></label>
      <label>טיוטה<textarea data-dir="${row.id}" data-key="draftText">${esc(row.draftText)}</textarea></label>
      <label>קישור אחרי פרסום<input data-dir="${row.id}" data-key="listingUrl" value="${esc(row.listingUrl || "")}"></label>
      <button type="button" data-save-dir="${row.id}">שמירה</button>
    </div>`).join("")}
    <div class="card">
      <h2>מיילים</h2>
      <p class="muted">${state.mailConfigured ? "שליחה מוגדרת." : "להפעלה: GROWTH_RESEND_API_KEY, GROWTH_MAIL_FROM, GROWTH_MAIL_TO."}</p>
      ${state.emails.map((row) => `<p>${esc(row.subject)} · ${esc(row.status)} <button type="button" data-send="${row.id}">שליחה</button></p>`).join("") || "<p>אין טיוטות. ייבוא הלוח יוצר אותן.</p>"}
    </div>
  `;
  panel.querySelector("#export-learn").onclick = () => run(async () => {
    const result = await api("/api/internet/export", { method: "POST", body: "{}" });
    banner.textContent = `יוצאו ${result.count} מאמרים`;
  });
  panel.querySelectorAll("[data-save-dir]").forEach((button) => {
    button.onclick = () => {
      const id = button.dataset.saveDir;
      const fields = {};
      panel.querySelectorAll(`[data-dir="${id}"]`).forEach((node) => { fields[node.dataset.key] = node.value; });
      run(() => api(`/api/directories/${id}`, { method: "PATCH", body: JSON.stringify(fields) }));
    };
  });
  panel.querySelectorAll("[data-send]").forEach((button) => { button.onclick = () => run(() => api(`/api/emails/${button.dataset.send}/send`, { method: "POST", body: "{}" })); });
}

function renderResults() {
  panel.innerHTML = `
    <div class="card">
      <table>
        <thead><tr><th>זמן</th><th>פריט</th><th>רשת</th><th>סטטוס</th><th>קישור</th><th>שגיאה</th></tr></thead>
        <tbody>
          ${state.jobs.map((row) => `<tr>
            <td>${esc((row.publishedAt || row.createdAt || "").replace("T", " ").slice(0, 16))}</td>
            <td>${esc(row.itemTitle)}</td>
            <td>${esc(row.network)}${row.destinationName ? " · " + esc(row.destinationName) : ""}</td>
            <td>${esc(row.status)}</td>
            <td>${row.remoteUrl ? `<a href="${esc(row.remoteUrl)}" target="_blank" rel="noreferrer">פוסט</a>` : "—"}</td>
            <td class="error">${esc(row.lastError || row.errorCode || "")}</td>
          </tr>`).join("") || "<tr><td colspan='6'>אין פרסומים עדיין</td></tr>"}
        </tbody>
      </table>
    </div>
  `;
}

function renderPeople() {
  const local = String(state.publicBase || "").includes("127.0.0.1") || String(state.publicBase || "").includes("localhost");
  panel.innerHTML = `
    <div class="card">
      <p>הכלי רץ על מחשב אחד. שאר האנשים פותחים את אותה כתובת מהדפדפן שלהם, וכולם עובדים על אותו תוכן, אותם חשבונות ואותו לוח.</p>
      <p>הכתובת: <code>${esc(state.publicBase)}</code></p>
      ${local ? `<p class="error">הכתובת הזו נפתחת רק במחשב שמריץ את הכלי. כדי שאחרים ייכנסו, הגדירו GROWTH_HOST=0.0.0.0 ו-GROWTH_PUBLIC_BASE לכתובת של המחשב ברשת, ואז הפעילו מחדש.</p>` : ""}
    </div>
    <div class="card row">
      <input id="op-name" placeholder="שם" style="max-width:12rem">
      <input id="op-password" type="password" placeholder="סיסמה" autocomplete="new-password" style="max-width:12rem">
      <button class="primary" type="button" id="add-op">הוספת מפעיל</button>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>שם</th><th></th></tr></thead>
        <tbody>
          ${(state.operators || []).map((row) => `<tr><td>${esc(row.name)}</td><td><button type="button" data-remove="${esc(row.id)}">הסרה</button></td></tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
  panel.querySelector("#add-op").onclick = () => run(() => api("/api/operators", {
    method: "POST",
    body: JSON.stringify({ name: panel.querySelector("#op-name").value, password: panel.querySelector("#op-password").value })
  }));
  panel.querySelectorAll("[data-remove]").forEach((button) => {
    button.onclick = () => run(() => api(`/api/operators/${button.dataset.remove}`, { method: "DELETE" }));
  });
}

async function run(action) {
  try {
    await action();
    await refresh();
  } catch (error) {
    banner.textContent = error.message;
  }
}

document.querySelectorAll(".tab").forEach((button) => {
  button.onclick = () => { tab = button.dataset.tab; render(); };
});
document.querySelector("#logout").onclick = () => run(async () => { await api("/api/logout", { method: "POST", body: "{}" }); location.reload(); });
loginForm.onsubmit = async (event) => {
  event.preventDefault();
  try {
    await api("/api/login", { method: "POST", body: JSON.stringify({ name: document.querySelector("#name").value, password: document.querySelector("#password").value }) });
    loginForm.classList.add("hidden");
    appEl.classList.remove("hidden");
    document.querySelector("#logout").classList.remove("hidden");
    await refresh();
  } catch (error) {
    document.querySelector("#login-error").textContent = error.message;
  }
};

api("/api/state").then((data) => {
  state = data;
  loginForm.classList.add("hidden");
  appEl.classList.remove("hidden");
  document.querySelector("#logout").classList.remove("hidden");
  render();
}).catch(() => {});
