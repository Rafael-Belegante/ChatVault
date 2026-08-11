const SESSIONS_KEY = "chatvault.sessions";
const TEMPLATES_KEY = "chatvault.templates";
const PREFS_KEY = "chatvault.prefs";
const PRINT_KEY = "chatvault.print";
const PROJECT_URL = "https://github.com/Rafael-Belegante/ChatVault";
const PROFILE_URL = "https://github.com/Rafael-Belegante/Hub-de-Projetos";

const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/>',
  moon: '<path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5 8.8 8.8 0 1 0 20.5 14.2Z"/>',
};

const SITES = {
  ChatGPT: (u) => /:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(u),
  Gemini: (u) => /:\/\/gemini\.google\.com\//.test(u),
  Grok: (u) => /:\/\/grok\.com\//.test(u) || /:\/\/x\.com\/i\/grok/.test(u),
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  sessions: [],
  templates: [],
  search: "",
  searchTpl: "",
  sortDesc: true,
  selected: new Set(),
  activeSite: null,
  activeTabId: null,
  activeTitle: "",
  exportTargets: [],
  exportFilter: "all",
  exportFormat: "pdf",
  editingTplId: null,
  renamingId: null,
  confirmAction: null,
};

async function load() {
  const data = await chrome.storage.local.get([SESSIONS_KEY, TEMPLATES_KEY, PREFS_KEY]);
  state.sessions = data[SESSIONS_KEY] || [];
  state.templates = data[TEMPLATES_KEY] || [];
  const prefs = data[PREFS_KEY] || {};
  state.sortDesc = prefs.sortDesc !== false;
  const theme = prefs.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  applyTheme(theme);
}
const saveSessions = () => chrome.storage.local.set({ [SESSIONS_KEY]: state.sessions });
const saveTemplates = () => chrome.storage.local.set({ [TEMPLATES_KEY]: state.templates });
async function savePrefs(patch) {
  const { [PREFS_KEY]: prefs = {} } = await chrome.storage.local.get(PREFS_KEY);
  await chrome.storage.local.set({ [PREFS_KEY]: { ...prefs, ...patch } });
}

function applyTheme(theme) {
  const safe = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = safe;
  $("#themeIcon").innerHTML = safe === "dark" ? ICONS.sun : ICONS.moon;
  $("#themeBtn").title = safe === "dark" ? "Usar tema claro" : "Usar tema escuro";
}
$("#themeBtn").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  savePrefs({ theme: next });
});

function toast(msg, type = "") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast show " + type;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.className = "toast " + type), 2600);
}
const esc = (s) => (s || "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) +
    " · " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function slug(s) {
  return (s || "conversa").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "conversa";
}
function cleanTitle(t) {
  return (t || "").replace(/\s*[-–|]\s*(ChatGPT|Gemini|Grok).*$/i, "").trim();
}

function openModal(id) { $("#" + id).classList.remove("hidden"); }
function closeModal(id) { $("#" + id).classList.add("hidden"); }
$$("[data-close]").forEach((b) => b.addEventListener("click", () => closeModal(b.dataset.close)));
$$(".modal-backdrop").forEach((m) =>
  m.addEventListener("click", (e) => { if (e.target === m) m.classList.add("hidden"); }));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") $$(".modal-backdrop:not(.hidden)").forEach((m) => m.classList.add("hidden"));
});

async function detectActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    state.activeTabId = tab?.id ?? null;
    state.activeTitle = tab?.title || "";
    const url = tab?.url || "";
    state.activeSite = Object.keys(SITES).find((k) => SITES[k](url)) || null;
  } catch {
    state.activeSite = null;
  }
  renderSiteState();
  prefillName();
}
function renderSiteState() {
  const badge = $("#siteBadge");
  if (state.activeSite) {
    badge.className = "site-badge live";
    $("#siteBadgeText").textContent = state.activeSite;
    $("#siteNotice").classList.add("hidden");
    $("#saveBtn").disabled = false;
  } else {
    badge.className = "site-badge";
    $("#siteBadgeText").textContent = "Site não suportado";
    $("#siteNotice").classList.remove("hidden");
    $("#saveBtn").disabled = true;
  }
}
function prefillName() {
  const input = $("#sessionName");
  if (input.value.trim() || !state.activeSite) return;
  const suggested = cleanTitle(state.activeTitle);
  if (suggested && suggested.toLowerCase() !== state.activeSite.toLowerCase()) {
    input.value = suggested;
  }
}

async function runExtract(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["scripts/content.js"] });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.__chatVault.extract(),
  });
  return result;
}

$("#saveBtn").addEventListener("click", async () => {
  if (!state.activeSite || state.activeTabId == null) {
    toast("Abra uma conversa no ChatGPT, Gemini ou Grok.", "error");
    return;
  }
  const btn = $("#saveBtn");
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = "Lendo conversa…";
  try {
    const res = await runExtract(state.activeTabId);
    if (!res || !res.ok) {
      toast(
        res?.reason === "unsupported" ? "Esta página não é suportada."
        : res?.reason === "empty" ? "Não encontrei mensagens. Role a conversa e tente de novo."
        : "Não consegui ler a conversa.", "error");
      return;
    }
    const name = $("#sessionName").value.trim() || res.title;
    state.sessions.unshift({
      id: uid(), name, site: res.site, url: res.url,
      createdAt: Date.now(), messages: res.messages,
    });
    await saveSessions();
    $("#sessionName").value = "";
    renderSessions();
    renderStats();
    const u = res.messages.filter((m) => m.role === "user").length;
    toast(`Salvo: ${res.messages.length} mensagens (${u} suas).`, "success");
  } catch (e) {
    console.error(e);
    toast("Erro ao ler a página. Recarregue a aba da IA e tente de novo.", "error");
  } finally {
    btn.innerHTML = original;
    btn.disabled = !state.activeSite;
  }
});

function renderStats() {
  $("#statSessions").textContent = state.sessions.length;
  $("#statMessages").textContent = state.sessions.reduce((a, s) => a + s.messages.length, 0);
  $("#statTemplates").textContent = state.templates.length;
}

function filteredSessions() {
  const q = state.search.toLowerCase();
  const list = state.sessions.filter((s) =>
    !q || s.name.toLowerCase().includes(q) || s.site.toLowerCase().includes(q));
  list.sort((a, b) => state.sortDesc ? b.createdAt - a.createdAt : a.createdAt - b.createdAt);
  return list;
}
function renderSessions() {
  const list = filteredSessions();
  const box = $("#sessionsList");
  $("#sessionsEmpty").classList.toggle("hidden", state.sessions.length > 0);
  box.classList.toggle("hidden", state.sessions.length === 0);

  box.innerHTML = list.map((s) => {
    const u = s.messages.filter((m) => m.role === "user").length;
    const a = s.messages.length - u;
    const sel = state.selected.has(s.id) ? "checked" : "";
    return `
    <article class="session-card ${state.selected.has(s.id) ? "selected" : ""}" data-id="${s.id}">
      <div class="session-main">
        <label class="check-wrap">
          <input type="checkbox" data-sel="${s.id}" ${sel} />
          <span class="custom-check"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span>
        </label>
        <div class="session-info">
          <div class="session-title-row">
            <h3 class="session-title">${esc(s.name)}</h3>
            <span class="count-pill">${s.messages.length}</span>
          </div>
          <div class="session-meta">
            <span>${esc(s.site)}</span><span>·</span>
            <span>${u} suas / ${a} da IA</span><span>·</span>
            <span>${fmtDate(s.createdAt)}</span>
          </div>
        </div>
        <div class="session-actions">
          <button class="icon-btn" data-act="export" data-id="${s.id}" title="Exportar">
            <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg>
          </button>
          <button class="icon-btn" data-act="rename" data-id="${s.id}" title="Renomear">
            <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
          </button>
          <button class="icon-btn danger-icon" data-act="delete" data-id="${s.id}" title="Apagar">
            <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      </div>
    </article>`;
  }).join("");

  $$("[data-sel]", box).forEach((cb) => cb.addEventListener("change", () => {
    const id = cb.dataset.sel;
    cb.checked ? state.selected.add(id) : state.selected.delete(id);
    $("#sessionsList [data-id='" + id + "']")?.classList.toggle("selected", cb.checked);
    renderSelection();
  }));
  $$("[data-act]", box).forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const s = state.sessions.find((x) => x.id === b.dataset.id);
    if (!s) return;
    if (b.dataset.act === "export") openExport([s]);
    if (b.dataset.act === "rename") openRename(s);
    if (b.dataset.act === "delete") askConfirm(
      "Apagar conversa?", `“${s.name}” será removida permanentemente.`,
      () => {
        state.sessions = state.sessions.filter((x) => x.id !== s.id);
        state.selected.delete(s.id);
        saveSessions(); renderSessions(); renderStats(); renderSelection();
        toast("Conversa apagada.");
      });
  }));
}

function renderSelection() {
  const n = state.selected.size;
  $("#selCount").textContent = n;
  $("#selCount").classList.toggle("hidden", n === 0);
  $("#exportSelBtn").disabled = n === 0;
  $("#selectAllBtn").textContent =
    (n > 0 && n === filteredSessions().length) ? "Desmarcar" : "Marcar todas";
}

function filteredTemplates() {
  const q = state.searchTpl.toLowerCase();
  return state.templates.filter((t) =>
    !q || t.title.toLowerCase().includes(q) || t.body.toLowerCase().includes(q));
}
function renderTemplates() {
  const list = filteredTemplates();
  const box = $("#templatesList");
  $("#templatesEmpty").classList.toggle("hidden", state.templates.length > 0);
  box.classList.toggle("hidden", state.templates.length === 0);

  box.innerHTML = list.map((t) => `
    <article class="session-card" data-id="${t.id}">
      <div class="session-main" style="grid-template-columns:minmax(0,1fr) auto;">
        <div class="session-info">
          <div class="session-title-row">
            <h3 class="session-title">${esc(t.title)}</h3>
            <span class="tpl-tag">${t.body.length} car.</span>
          </div>
        </div>
        <div class="session-actions">
          <button class="mini-btn" data-tact="insert" data-id="${t.id}" title="Inserir na caixa da IA">
            <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg> Inserir
          </button>
          <button class="icon-btn" data-tact="copy" data-id="${t.id}" title="Copiar">
            <svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
          </button>
          <button class="icon-btn" data-tact="edit" data-id="${t.id}" title="Editar">
            <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
          </button>
          <button class="icon-btn danger-icon" data-tact="delete" data-id="${t.id}" title="Apagar">
            <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      </div>
      <p class="tpl-body">${esc(t.body)}</p>
    </article>`).join("");

  $$("[data-tact]", box).forEach((b) => b.addEventListener("click", async () => {
    const t = state.templates.find((x) => x.id === b.dataset.id);
    if (!t) return;
    if (b.dataset.tact === "copy") {
      try { await navigator.clipboard.writeText(t.body); toast("Modelo copiado.", "success"); }
      catch { toast("Não consegui copiar.", "error"); }
    }
    if (b.dataset.tact === "insert") await insertTemplate(t);
    if (b.dataset.tact === "edit") openTpl(t);
    if (b.dataset.tact === "delete") askConfirm(
      "Apagar modelo?", `“${t.title}” será removido.`,
      () => {
        state.templates = state.templates.filter((x) => x.id !== t.id);
        saveTemplates(); renderTemplates(); renderStats(); toast("Modelo apagado.");
      });
  }));
}

async function insertTemplate(t) {
  if (!state.activeSite || state.activeTabId == null) {
    try { await navigator.clipboard.writeText(t.body); } catch {}
    toast("Site da IA não está aberto — copiei para a área de transferência.");
    return;
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId: state.activeTabId }, files: ["scripts/content.js"] });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: state.activeTabId },
      func: (txt) => window.__chatVault.insertText(txt),
      args: [t.body],
    });
    if (result?.ok) toast("Inserido na caixa da IA.", "success");
    else { await navigator.clipboard.writeText(t.body); toast("Não achei a caixa — copiei para você."); }
  } catch {
    try { await navigator.clipboard.writeText(t.body); } catch {}
    toast("Copiado (não consegui inserir direto).");
  }
}

$("#newTplBtn").addEventListener("click", () => openTpl(null));
function openTpl(t) {
  state.editingTplId = t?.id || null;
  $("#tplModalTitle").textContent = t ? "Editar modelo" : "Novo modelo";
  $("#tplTitle").value = t?.title || "";
  $("#tplBody").value = t?.body || "";
  openModal("tplModal");
  setTimeout(() => $("#tplTitle").focus(), 40);
}
$("#tplSaveBtn").addEventListener("click", () => {
  const title = $("#tplTitle").value.trim();
  const body = $("#tplBody").value.trim();
  if (!title || !body) { toast("Preencha título e texto.", "error"); return; }
  if (state.editingTplId) {
    const t = state.templates.find((x) => x.id === state.editingTplId);
    if (t) { t.title = title; t.body = body; }
  } else {
    state.templates.unshift({ id: uid(), title, body, createdAt: Date.now() });
  }
  saveTemplates(); renderTemplates(); renderStats(); closeModal("tplModal");
  toast("Modelo salvo.", "success");
});

function openRename(s) {
  state.renamingId = s.id;
  $("#renameInput").value = s.name;
  openModal("renameModal");
  setTimeout(() => { $("#renameInput").focus(); $("#renameInput").select(); }, 40);
}
$("#renameSaveBtn").addEventListener("click", () => {
  const s = state.sessions.find((x) => x.id === state.renamingId);
  const v = $("#renameInput").value.trim();
  if (s && v) { s.name = v; saveSessions(); renderSessions(); closeModal("renameModal"); toast("Renomeada."); }
});
$("#renameInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#renameSaveBtn").click(); });

function askConfirm(title, text, onOk) {
  $("#confirmTitle").textContent = title;
  $("#confirmText").textContent = text;
  state.confirmAction = onOk;
  openModal("confirmModal");
}
$("#confirmOkBtn").addEventListener("click", () => {
  closeModal("confirmModal");
  state.confirmAction?.();
  state.confirmAction = null;
});

function filterMessages(msgs) {
  if (state.exportFilter === "user") return msgs.filter((m) => m.role === "user");
  if (state.exportFilter === "assistant") return msgs.filter((m) => m.role === "assistant");
  return msgs;
}
const whoLabel = (role, site) => role === "user" ? "Você" : (site || "IA");

function openExport(targets) {
  state.exportTargets = targets;
  state.exportFilter = "all";
  state.exportFormat = "pdf";
  $$("#filterSeg button").forEach((b) => b.classList.toggle("active", b.dataset.filter === "all"));
  $$("#formatSeg button").forEach((b) => b.classList.toggle("active", b.dataset.format === "pdf"));
  $("#exportTitle").textContent = targets.length === 1 ? "Exportar conversa" : `Exportar ${targets.length} conversas`;
  $("#exportSub").textContent = targets.length === 1
    ? `“${targets[0].name}” · ${targets[0].site}`
    : "As conversas serão combinadas em um único arquivo.";
  updateDownloadLabel();
  renderExportPreview();
  openModal("exportModal");
}
function updateDownloadLabel() {
  $("#downloadBtnLabel").textContent = state.exportFormat === "pdf" ? "Salvar como PDF" : "Baixar";
}

function renderExportPreview() {
  const box = $("#exportPreview");
  let total = 0;
  const parts = state.exportTargets.map((s) => {
    const msgs = filterMessages(s.messages);
    total += msgs.length;
    const header = state.exportTargets.length > 1
      ? `<div class="preview-empty" style="padding:6px 0;text-align:left;font-weight:750;color:var(--text)">${esc(s.name)}</div>` : "";
    const bubbles = msgs.map((m) => `
      <div class="bubble ${m.role}">
        <span class="who">${esc(whoLabel(m.role, s.site))}</span>${esc(m.text)}
      </div>`).join("");
    return header + (bubbles || `<div class="preview-empty">Nenhuma mensagem com este filtro.</div>`);
  });
  box.innerHTML = parts.join("") || `<div class="preview-empty">Nada para mostrar.</div>`;
  $("#exportCount").textContent = `${total} mensagens`;
}

$$("#filterSeg button").forEach((b) => b.addEventListener("click", () => {
  state.exportFilter = b.dataset.filter;
  $$("#filterSeg button").forEach((x) => x.classList.toggle("active", x === b));
  renderExportPreview();
}));
$$("#formatSeg button").forEach((b) => b.addEventListener("click", () => {
  state.exportFormat = b.dataset.format;
  $$("#formatSeg button").forEach((x) => x.classList.toggle("active", x === b));
  updateDownloadLabel();
}));

function buildMarkdown(sessions) {
  return sessions.map((s) => {
    const msgs = filterMessages(s.messages);
    const head = `# ${s.name}\n\n> **${s.site}** · ${fmtDate(s.createdAt)} · ${msgs.length} mensagens  \n> ${s.url}\n`;
    const body = msgs.map((m) =>
      `\n## ${m.role === "user" ? "🧑 Você" : "🤖 " + s.site}\n\n${m.text}\n`).join("");
    return head + body;
  }).join("\n\n---\n\n");
}
function buildTxt(sessions) {
  return sessions.map((s) => {
    const msgs = filterMessages(s.messages);
    const head = `${s.name}\n${s.site} · ${fmtDate(s.createdAt)} · ${msgs.length} mensagens\n${"=".repeat(48)}\n`;
    const body = msgs.map((m) => `\n[${whoLabel(m.role, s.site).toUpperCase()}]\n${m.text}\n`).join("");
    return head + body;
  }).join("\n\n" + "-".repeat(48) + "\n\n");
}
function buildHtml(sessions) {
  const blocks = sessions.map((s) => {
    const msgs = filterMessages(s.messages);
    const rows = msgs.map((m) => `
      <div class="row ${m.role}">
        <div class="who">${esc(whoLabel(m.role, s.site))}</div>
        <div class="msg">${esc(m.text).replace(/\n/g, "<br>")}</div>
      </div>`).join("");
    return `<section class="conv">
      <h1>${esc(s.name)}</h1>
      <p class="meta">${esc(s.site)} · ${fmtDate(s.createdAt)} · ${msgs.length} mensagens</p>
      <div class="thread">${rows}</div>
    </section>`;
  }).join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(sessions[0]?.name || "Conversa")}</title>
<style>
  :root{--bg:#f6f3fb;--surface:#fff;--text:#1d1726;--muted:#665c72;--border:#d9d1e3;
    --primary:#6d28d9;--primary-soft:#f0e8ff;--accent:#f97316;--accent-soft:#fff0e5;
    --hero-start:#4c1d95;--hero-end:#7c3aed;}
  @media(prefers-color-scheme:dark){:root{--bg:#0e0b13;--surface:#19131f;--text:#fbf8ff;
    --muted:#c0b5ca;--border:#493a58;--primary:#a678ff;--primary-soft:#2d2042;
    --accent:#ff9a3d;--accent-soft:#3d2817;--hero-start:#2e145c;--hero-end:#6f2ab1;}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);
    font-family:"Segoe UI",system-ui,-apple-system,sans-serif;line-height:1.55;padding:32px 16px 64px}
  .conv{max-width:760px;margin:0 auto 40px}
  h1{background:linear-gradient(135deg,var(--hero-start),var(--hero-end));color:#fff;
    margin:0;padding:20px 22px;border-radius:16px 16px 0 0;font-size:22px}
  .meta{margin:0 0 18px;padding:10px 22px;background:var(--surface);border:1px solid var(--border);
    border-top:0;border-radius:0 0 16px 16px;color:var(--muted);font-size:13px}
  .thread{display:flex;flex-direction:column;gap:14px}
  .row{max-width:88%;padding:12px 15px;border-radius:16px;border:1px solid var(--border);background:var(--surface)}
  .row.user{align-self:flex-end;background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 34%,var(--border));border-bottom-right-radius:5px}
  .row.assistant{align-self:flex-start;background:var(--primary-soft);border-color:color-mix(in srgb,var(--primary) 30%,var(--border));border-bottom-left-radius:5px}
  .who{font-size:11px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;margin-bottom:5px;opacity:.85}
  .row.user .who{color:color-mix(in srgb,var(--accent) 80%,var(--text))}
  .row.assistant .who{color:var(--primary)}
  .msg{font-size:14.5px;white-space:pre-wrap;word-break:break-word}
</style></head><body>${blocks}
<p style="text-align:center;color:var(--muted);font-size:12px">Exportado com ChatVault</p>
</body></html>`;
}

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function openPrintView(sessions) {
  const payload = {
    title: sessions.length === 1 ? sessions[0].name : `${sessions.length} conversas`,
    sessions: sessions.map((s) => ({
      name: s.name, site: s.site, date: fmtDate(s.createdAt),
      messages: filterMessages(s.messages).map((m) => ({ role: m.role, text: m.text })),
    })),
  };
  await chrome.storage.local.set({ [PRINT_KEY]: payload });
  await chrome.tabs.create({ url: chrome.runtime.getURL("export.html") });
}

$("#downloadExportBtn").addEventListener("click", async () => {
  const t = state.exportTargets;
  const base = t.length === 1 ? slug(t[0].name) : `conversas-${t.length}`;
  if (state.exportFormat === "pdf") {
    await openPrintView(t);
    closeModal("exportModal");
    toast("Abrindo visualização para salvar em PDF…", "success");
    return;
  }
  if (state.exportFormat === "html") download(`${base}.html`, buildHtml(t), "text/html");
  else if (state.exportFormat === "txt") download(`${base}.txt`, buildTxt(t), "text/plain");
  else download(`${base}.md`, buildMarkdown(t), "text/markdown");
  toast("Arquivo baixado.", "success");
});
$("#copyExportBtn").addEventListener("click", async () => {
  const t = state.exportTargets;
  const text = state.exportFormat === "html" ? buildHtml(t)
    : state.exportFormat === "txt" ? buildTxt(t) : buildMarkdown(t);
  try { await navigator.clipboard.writeText(text); toast("Copiado para a área de transferência.", "success"); }
  catch { toast("Não consegui copiar.", "error"); }
});

$("#exportSelBtn").addEventListener("click", () => {
  const targets = state.sessions.filter((s) => state.selected.has(s.id));
  if (targets.length) openExport(targets);
});
$("#selectAllBtn").addEventListener("click", () => {
  const list = filteredSessions();
  const allSel = list.length && list.every((s) => state.selected.has(s.id));
  if (allSel) state.selected.clear();
  else list.forEach((s) => state.selected.add(s.id));
  renderSessions(); renderSelection();
});
$("#clearAllBtn").addEventListener("click", () => {
  if (!state.sessions.length) { toast("Nada para apagar."); return; }
  askConfirm("Apagar todas as conversas?",
    `Todas as ${state.sessions.length} conversas salvas serão removidas.`,
    () => {
      state.sessions = []; state.selected.clear(); saveSessions();
      renderSessions(); renderStats(); renderSelection(); toast("Tudo apagado.");
    });
});

function switchView(view) {
  const conv = view === "conversas";
  $("#tabConversas").classList.toggle("active", conv);
  $("#tabModelos").classList.toggle("active", !conv);
  $("#viewConversas").style.display = conv ? "flex" : "none";
  $("#viewModelos").style.display = conv ? "none" : "flex";
  $("#bottomBar").style.display = conv ? "flex" : "none";
}
$("#tabConversas").addEventListener("click", () => switchView("conversas"));
$("#tabModelos").addEventListener("click", () => switchView("modelos"));

$("#search").addEventListener("input", (e) => { state.search = e.target.value; renderSessions(); renderSelection(); });
$("#searchTpl").addEventListener("input", (e) => { state.searchTpl = e.target.value; renderTemplates(); });
$("#sortBtn").addEventListener("click", () => {
  state.sortDesc = !state.sortDesc; savePrefs({ sortDesc: state.sortDesc });
  renderSessions(); toast(state.sortDesc ? "Mais recentes primeiro." : "Mais antigas primeiro.");
});
$("#sessionName").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#saveBtn").click(); });

$("#aboutBtn").addEventListener("click", () => {
  $("#aboutVersion").textContent = "v" + chrome.runtime.getManifest().version;
  openModal("aboutModal");
});
$("#closeAboutBtn").addEventListener("click", () => closeModal("aboutModal"));
$("#projectLinkBtn").addEventListener("click", () => openExternalUrl(PROJECT_URL));
$("#profileLinkBtn").addEventListener("click", () => openExternalUrl(PROFILE_URL));

async function openExternalUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "github.com") throw new Error("bloqueado");
    await chrome.tabs.create({ url: parsed.href, active: true });
  } catch {
    toast("Não foi possível abrir o GitHub.", "error");
  }
}

(async function init() {
  await load();
  await detectActiveTab();
  renderStats();
  renderSessions();
  renderTemplates();
  renderSelection();
  switchView("conversas");
})();
