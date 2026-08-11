const PRINT_KEY = "chatvault.print";

const esc = (s) => (s || "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function render(payload) {
  const { title, sessions } = payload;
  document.title = title ? `${title} — ChatVault` : "ChatVault";

  const doc = document.getElementById("doc");
  doc.innerHTML = sessions.map((s) => {
    const rows = s.messages.map((m) => `
      <div class="row ${m.role === "user" ? "user" : "assistant"}">
        <div class="who">${esc(m.role === "user" ? "Você" : s.site || "IA")}</div>
        <div class="msg">${esc(m.text).replace(/\n/g, "<br>")}</div>
      </div>`).join("");
    return `<section class="conv">
      <h1>${esc(s.name)}</h1>
      <p class="meta">${esc(s.site)} · ${esc(s.date)} · ${s.messages.length} mensagens</p>
      <div class="thread">${rows}</div>
    </section>`;
  }).join("") + `<p class="foot">Exportado com ChatVault</p>`;
}

async function start() {
  let payload = null;
  try {
    const data = await chrome.storage.local.get(PRINT_KEY);
    payload = data[PRINT_KEY];
  } catch (_) {}

  if (!payload || !Array.isArray(payload.sessions) || !payload.sessions.length) {
    document.getElementById("doc").innerHTML =
      '<p style="text-align:center;color:#665c72">Nada para exportar.</p>';
    return;
  }

  render(payload);
  try { await chrome.storage.local.remove(PRINT_KEY); } catch (_) {}

  document.getElementById("printBtn").addEventListener("click", () => window.print());
  document.getElementById("closeBtn").addEventListener("click", () => window.close());

  window.addEventListener("load", () => setTimeout(() => window.print(), 350));
}

start();
