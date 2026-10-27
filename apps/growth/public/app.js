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
  else if (tab === "groups") renderGroups();
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
  const toGroups = panel.querySelector("#to-groups");
  if (toGroups) toGroups.onclick = () => run(async () => {
    await api(`/api/items/${item.id}/groups`, { method: "POST", body: "{}" });
    tab = "groups";
  });
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
  const dests = state.destinations.filter((row) => row.enabled && row.kind !== "group").map((row) => `<option value="${row.id}">${esc(row.network)} · ${esc(row.name)}</option>`).join("");
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
      ${(state.groups || []).some((row) => row.enabled) ? `<button type="button" id="to-groups">משימות לכל הקבוצות</button>` : ""}
    </p>
    <p class="row">
      ${["x", "whatsapp", "pinterest", "threads"].map((network) => `<button type="button" data-export="${network}">ייצוא ${network}</button>`).join("")}
    </p>
  </div>`;
}

const NETWORK_LABELS = {
  youtube: "יוטיוב",
  instagram: "אינסטגרם",
  facebook: "פייסבוק",
  tiktok: "טיקטוק",
  telegram: "טלגרם",
  linkedin: "לינקדאין"
};

function renderAccounts() {
  const connectable = state.networks.filter((row) => row.oauth || row.network === "telegram");
  panel.innerHTML = `
    <div class="card">
      <p class="muted">לחיצה על חיבור פותחת את אתר הרשת. מאשרים שם את החשבון, ואז חוזרים לכאן. טלגרם מתחבר כאן עם טוקן בוט, בלי אפליקציית מפתחים.</p>
      ${connectable.map((row) => {
        const name = NETWORK_LABELS[row.network] || row.network;
        if (row.network === "telegram") {
          return `<p><strong>${esc(name)}</strong> — מדביקים למטה טוקן ומזהה ערוץ</p>`;
        }
        if (!row.configured) {
          return `<p><strong>${esc(name)}</strong> — <span class="error">אין מפתח בשרת, אי אפשר לחבר עדיין</span></p>`;
        }
        return `<p><strong>${esc(name)}</strong> — מוכן לחיבור <button class="primary" type="button" data-connect="${row.network}">חיבור ${esc(name)}</button></p>`;
      }).join("")}
      <label>טוקן בוט טלגרם<input id="tg-token" autocomplete="off"></label>
      <label>מזהה צ'אט או @ערוץ<input id="tg-chat" placeholder="@reelmino"></label>
      <button class="primary" type="button" id="tg-save">חיבור טלגרם</button>
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
      banner.className = "muted";
      banner.textContent = "פותח את דף האישור של הרשת…";
      const started = await api(`/api/connect/${button.dataset.connect}/start`, { method: "POST", body: "{}" });
      if (!started.authorizeUrl) throw new Error("לא התקבלה כתובת חיבור מהשרת");
      location.assign(started.authorizeUrl);
      return "skip-refresh";
    });
  });
  panel.querySelector("#tg-save").onclick = () => run(async () => {
    const token = panel.querySelector("#tg-token").value.trim();
    const chatId = panel.querySelector("#tg-chat").value.trim();
    if (!token) throw new Error("מדביקים קודם את הטוקן מ-BotFather");
    if (!chatId) throw new Error("כותבים מזהה ערוץ, למשל @reelmino");
    await api("/api/connections/telegram", { method: "POST", body: JSON.stringify({ token, chatId }) });
  });
  panel.querySelectorAll("[data-sync]").forEach((button) => { button.onclick = () => run(() => api(`/api/connections/${button.dataset.sync}/sync`, { method: "POST", body: "{}" })); });
  panel.querySelectorAll("[data-drop]").forEach((button) => { button.onclick = () => run(() => api(`/api/connections/${button.dataset.drop}`, { method: "DELETE" })); });
  panel.querySelectorAll("[data-flag]").forEach((box) => {
    box.onchange = () => run(() => api(`/api/destinations/${box.dataset.id}`, { method: "PATCH", body: JSON.stringify({ [box.dataset.flag]: box.checked }) }));
  });
}

const GROUP_NETWORK_INFO = {
  facebook: { label: "פייסבוק", placeholder: "https://www.facebook.com/groups/...", hint: "קבוצה שאתם חברים בה ומותר בה לפרסם. אתם מדביקים ולוחצים פרסום." },
  linkedin: { label: "לינקדאין", placeholder: "https://www.linkedin.com/groups/1234567/", hint: "קבוצת לינקדאין שאתם חברים בה. אתם מדביקים ולוחצים פרסום." },
  whatsapp: { label: "וואטסאפ", placeholder: "https://chat.whatsapp.com/...", hint: "קישור ההזמנה מפרטי הקבוצה. הוא פותח את הקבוצה באפליקציה, ושם מדביקים." },
  reddit: { label: "Reddit", placeholder: "https://www.reddit.com/r/...", hint: "נפתח טופס פרסום עם כותרת וטקסט כבר מולאו. לפני שליחה קראו את כללי הקהילה." },
  x: { label: "X קהילות", placeholder: "https://x.com/i/communities/...", hint: "קהילת X שאתם חברים בה. אתם מדביקים ולוחצים פרסום." },
  telegram: { label: "טלגרם", placeholder: "@groupname או ‎-1001234567890", hint: "שליחה אוטומטית דרך הבוט המחובר. הבוט צריך להיות חבר בקבוצה, ובערוץ גם מנהל עם הרשאת פרסום." },
  discord: { label: "דיסקורד", placeholder: "https://discord.com/api/webhooks/...", hint: "שליחה אוטומטית דרך Webhook. בערוץ: Edit Channel → Integrations → Webhooks → New Webhook → Copy URL." }
};
const TRIGGER_LABELS = { any: "כל פרסום של הפריט", facebook: "פרסום בעמוד פייסבוק", youtube: "פרסום ביוטיוב", instagram: "פרסום באינסטגרם", tiktok: "פרסום בטיקטוק", telegram: "פרסום בערוץ טלגרם", linkedin: "פרסום בלינקדאין" };
let groupNetwork = "facebook";

function renderGroups() {
  const groups = state.groups || [];
  const posts = state.groupPosts || [];
  const open = posts.filter((row) => row.status === "pending" || row.status === "failed" || row.status === "sending");
  const history = posts.filter((row) => row.status === "done" || row.status === "skipped").slice(0, 60);
  const info = GROUP_NETWORK_INFO[groupNetwork];
  const label = (network) => GROUP_NETWORK_INFO[network]?.label || network;
  const days = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null);
  const telegramChats = state.destinations.filter((row) => row.network === "telegram" && row.kind !== "channel");
  const triggerOptions = (selected) => Object.entries(TRIGGER_LABELS).map(([value, text]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${text}</option>`).join("");
  panel.innerHTML = `
    <div class="card">
      <p>כל פריט תוכן שמתפרסם מייצר משימה אחת לכל קבוצה פעילה. אותו פריט לא יישלח לאותה קבוצה פעמיים, ויש מרווח ימים מינימלי בין פרסומים בכל קבוצה.</p>
      <p class="muted"><strong>טלגרם ודיסקורד</strong>: נשלח אוטומטית דרך הבוט או ה-Webhook שלכם, מיידית או בטייס אוטומטי.<br>
      <strong>פייסבוק, לינקדאין, וואטסאפ, Reddit ו-X</strong>: לרשתות האלה אין דרך רשמית לפרסם בקבוצה מתוכנה. המערכת מכינה את הטקסט, מעתיקה אותו ופותחת את הקבוצה, ואתם מדביקים ולוחצים פרסום.</p>
    </div>
    <div class="card">
      <h2>משימות פתוחות (${open.length})</h2>
      ${open.map((row) => `<div class="card share">
        <p><strong>${esc(label(row.network))} · ${esc(row.groupName)}</strong> · ${esc(row.itemTitle)}
          ${row.sourceNetwork ? `<span class="muted"> · אחרי ${esc(row.sourceNetwork)}</span>` : ""}</p>
        ${row.tooSoon ? `<p class="warn-text">בקבוצה הזו פורסם לפני ${days(row.groupLastSharedAt)} ימים, והמרווח שהוגדר הוא ${row.groupMinDays} ימים.${row.autopilot ? " הטייס האוטומטי ימתין." : ""}</p>` : ""}
        ${row.status === "failed" ? `<p class="error">השליחה נכשלה: ${esc(row.error || "")}</p>` : ""}
        ${row.groupRules ? `<p class="muted">כללי הקבוצה: ${esc(row.groupRules)}</p>` : ""}
        <label>טקסט<textarea readonly data-post-text="${row.id}">${esc(row.text)}</textarea></label>
        <p class="row">
          ${row.auto
            ? `<button class="primary" type="button" data-send-post="${row.id}" ${row.status === "sending" ? "disabled" : ""}>${row.status === "failed" ? "שליחה חוזרת" : "שליחה עכשיו"}</button>
               ${row.autopilot ? `<span class="muted">טייס אוטומטי פעיל: יישלח לבד</span>` : ""}`
            : `<button class="primary" type="button" data-open-post="${row.id}">${row.network === "reddit" ? "פתיחת טופס ממולא" : "העתקה ופתיחת הקבוצה"}</button>
               ${row.shareUrl ? `<a href="${esc(row.shareUrl)}" target="_blank" rel="noreferrer">או: שיתוף הפוסט מהעמוד לקבוצה</a>` : ""}`}
        </p>
        <p class="row">
          ${row.auto ? "" : `<input data-post-url="${row.id}" placeholder="קישור לפוסט בקבוצה, לא חובה" style="max-width:24rem">
          <button type="button" data-done-post="${row.id}">פורסם</button>`}
          <button type="button" data-skip-post="${row.id}">דילוג</button>
        </p>
      </div>`).join("") || "<p>אין משימות פתוחות.</p>"}
    </div>
    <div class="card">
      <h2>הוספת קבוצה</h2>
      <div class="row">
        <select id="group-network" style="max-width:12rem">${Object.entries(GROUP_NETWORK_INFO).map(([value, row]) => `<option value="${value}" ${value === groupNetwork ? "selected" : ""}>${row.label}</option>`).join("")}</select>
        <input id="group-address" placeholder="${esc(info.placeholder)}" style="max-width:24rem" dir="ltr">
        ${groupNetwork === "telegram" && telegramChats.length ? `<select id="group-known"><option value="">או בחרו קבוצה שהבוט מכיר</option>${telegramChats.map((row) => `<option value="${esc(row.externalId)}">${esc(row.name)}</option>`).join("")}</select>` : ""}
      </div>
      <p class="muted">${esc(info.hint)}</p>
      <div class="row">
        <input id="group-name" placeholder="שם לתצוגה, לא חובה" style="max-width:14rem">
        <label class="row">מרווח בימים <input id="group-days" type="number" min="0" value="7" style="max-width:5rem"></label>
        <label class="row">מתי ליצור משימה <select id="group-trigger">${triggerOptions(groupNetwork === "facebook" ? "facebook" : "any")}</select></label>
        ${groupNetwork === "telegram" || groupNetwork === "discord" ? `<label class="row"><input id="group-autopilot" type="checkbox"> טייס אוטומטי</label>` : ""}
      </div>
      <label>כללי הקבוצה, לתזכורת<input id="group-rules" placeholder="למשל: קידום עצמי רק ביום שישי"></label>
      <p class="row"><button class="primary" type="button" id="add-group">הוספה</button></p>
    </div>
    <div class="card">
      <h2>הקבוצות שלי (${groups.length})</h2>
      <table>
        <thead><tr><th>רשת</th><th>קבוצה</th><th>מתי</th><th>מרווח</th><th>אחרון</th><th>טייס</th><th>פעילה</th><th></th></tr></thead>
        <tbody>
          ${groups.map((row) => `<tr>
            <td>${esc(label(row.network))}<br><span class="muted">${row.auto ? "אוטומטי" : "העתקה ופתיחה"}</span></td>
            <td>${row.link ? `<a href="${esc(row.link)}" target="_blank" rel="noreferrer">${esc(row.name)}</a>` : esc(row.name)}${row.rules ? `<br><span class="muted">${esc(row.rules)}</span>` : ""}</td>
            <td><select data-group-trigger="${row.id}">${triggerOptions(row.trigger)}</select></td>
            <td><input type="number" min="0" value="${row.minDays}" data-group-days="${row.id}" style="max-width:4.5rem"></td>
            <td>${row.lastSharedAt ? esc(row.lastSharedAt.slice(0, 10)) : "—"}</td>
            <td>${row.auto ? `<input type="checkbox" data-group-autopilot="${row.id}" ${row.autopilot ? "checked" : ""}>` : "—"}</td>
            <td><input type="checkbox" data-group-enabled="${row.id}" ${row.enabled ? "checked" : ""}></td>
            <td><button type="button" data-group-drop="${row.id}">הסרה</button></td>
          </tr>`).join("") || "<tr><td colspan='8'>אין קבוצות</td></tr>"}
        </tbody>
      </table>
    </div>
    <div class="card">
      <h2>היסטוריה</h2>
      <table>
        <thead><tr><th>תאריך</th><th>רשת</th><th>קבוצה</th><th>פריט</th><th>מצב</th><th>קישור</th></tr></thead>
        <tbody>
          ${history.map((row) => `<tr>
            <td>${esc((row.doneAt || "").slice(0, 10))}</td>
            <td>${esc(label(row.network))}</td>
            <td>${esc(row.groupName)}</td>
            <td>${esc(row.itemTitle)}</td>
            <td>${row.status === "done" ? "פורסם" : "דולג"}</td>
            <td>${row.postUrl ? `<a href="${esc(row.postUrl)}" target="_blank" rel="noreferrer">פוסט</a>` : "—"}</td>
          </tr>`).join("") || "<tr><td colspan='6'>עדיין אין</td></tr>"}
        </tbody>
      </table>
    </div>
  `;
  panel.querySelector("#group-network").onchange = (event) => { groupNetwork = event.target.value; renderGroups(); };
  const known = panel.querySelector("#group-known");
  if (known) known.onchange = () => { panel.querySelector("#group-address").value = known.value; };
  panel.querySelector("#add-group").onclick = () => run(() => api("/api/groups", {
    method: "POST",
    body: JSON.stringify({
      network: groupNetwork,
      address: panel.querySelector("#group-address").value,
      name: panel.querySelector("#group-name").value,
      rules: panel.querySelector("#group-rules").value,
      minDays: Number(panel.querySelector("#group-days").value),
      trigger: panel.querySelector("#group-trigger").value,
      autopilot: Boolean(panel.querySelector("#group-autopilot")?.checked)
    })
  }));
  const patchGroup = (id, body) => run(() => api(`/api/groups/${id}`, { method: "PATCH", body: JSON.stringify(body) }));
  panel.querySelectorAll("[data-group-enabled]").forEach((box) => { box.onchange = () => patchGroup(box.dataset.groupEnabled, { enabled: box.checked }); });
  panel.querySelectorAll("[data-group-autopilot]").forEach((box) => { box.onchange = () => patchGroup(box.dataset.groupAutopilot, { autopilot: box.checked }); });
  panel.querySelectorAll("[data-group-days]").forEach((input) => { input.onchange = () => patchGroup(input.dataset.groupDays, { minDays: Number(input.value) }); });
  panel.querySelectorAll("[data-group-trigger]").forEach((select) => { select.onchange = () => patchGroup(select.dataset.groupTrigger, { trigger: select.value }); });
  panel.querySelectorAll("[data-group-drop]").forEach((button) => {
    button.onclick = () => run(() => api(`/api/groups/${button.dataset.groupDrop}`, { method: "DELETE" }));
  });
  panel.querySelectorAll("[data-open-post]").forEach((button) => {
    button.onclick = async () => {
      const row = open.find((post) => post.id === button.dataset.openPost);
      if (!row) return;
      window.open(row.openUrl, "_blank", "noopener");
      try {
        await navigator.clipboard.writeText(row.text);
        banner.textContent = `הטקסט הועתק. ב-${row.groupName}: פותחים פוסט חדש, מדביקים, ומצרפים את הסרטון אם צריך.`;
      } catch {
        panel.querySelector(`[data-post-text="${row.id}"]`).select();
        banner.textContent = "ההעתקה האוטומטית נחסמה. הטקסט מסומן, העתיקו עם Ctrl+C.";
      }
    };
  });
  panel.querySelectorAll("[data-send-post]").forEach((button) => {
    button.onclick = () => run(() => api(`/api/group-posts/${button.dataset.sendPost}/send`, { method: "POST", body: "{}" }));
  });
  const finish = (id, status) => run(() => api(`/api/group-posts/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status, postUrl: panel.querySelector(`[data-post-url="${id}"]`)?.value || "" })
  }));
  panel.querySelectorAll("[data-done-post]").forEach((button) => { button.onclick = () => finish(button.dataset.donePost, "done"); });
  panel.querySelectorAll("[data-skip-post]").forEach((button) => { button.onclick = () => finish(button.dataset.skipPost, "skipped"); });
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
        <thead><tr><th>זמן</th><th>פריט</th><th>רשת</th><th>סטטוס</th><th>קישור</th><th>שגיאה</th><th></th></tr></thead>
        <tbody>
          ${state.jobs.map((row) => `<tr>
            <td>${esc((row.publishedAt || row.createdAt || "").replace("T", " ").slice(0, 16))}</td>
            <td>${esc(row.itemTitle)}</td>
            <td>${esc(row.network)}${row.destinationName ? " · " + esc(row.destinationName) : ""}</td>
            <td>${esc(row.status)}</td>
            <td>${row.remoteUrl ? `<a href="${esc(row.remoteUrl)}" target="_blank" rel="noreferrer">פוסט</a>` : "—"}</td>
            <td class="error">${esc(row.lastError || row.errorCode || "")}</td>
            <td>${row.status === "published" ? `<button type="button" data-to-groups="${row.id}">לקבוצות</button>` : row.status === "failed" ? `<button type="button" data-retry-job="${row.id}">ניסיון חוזר</button>` : ""}</td>
          </tr>`).join("") || "<tr><td colspan='7'>אין פרסומים עדיין</td></tr>"}
        </tbody>
      </table>
    </div>
  `;
  panel.querySelectorAll("[data-to-groups]").forEach((button) => {
    button.onclick = () => run(async () => {
      await api(`/api/jobs/${button.dataset.toGroups}/groups`, { method: "POST", body: "{}" });
      tab = "groups";
    });
  });
  panel.querySelectorAll("[data-retry-job]").forEach((button) => {
    button.onclick = () => run(() => api(`/api/jobs/${button.dataset.retryJob}/retry`, { method: "POST", body: "{}" }));
  });
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
    const result = await action();
    if (result === "skip-refresh") return;
    banner.className = "muted";
    await refresh();
  } catch (error) {
    banner.className = "error";
    banner.textContent = error.message || String(error);
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
