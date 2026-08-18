const PRINT_KEY = "chatvault.print";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function roleLabel(message, site) {
  return message.role === "user" ? "USUÁRIO" : "SISTEMA";
}

function renderMessage(message, site) {
  const article = el("article", `message ${message.role === "user" ? "user" : "assistant"}`);
  const head = el("div", "message-head");
  head.appendChild(el("span", "role-badge", roleLabel(message, site)));
  head.appendChild(el("span", "role-detail", message.role === "user" ? "Você" : (site || "Assistente")));
  article.appendChild(head);

  const text = typeof message.text === "string" ? message.text : "";
  if (text.trim()) {
    article.appendChild(el("div", "message-text", text));
  } else if (!(message.images || []).length) {
    article.appendChild(el("div", "message-text message-placeholder", "Mensagem sem texto"));
  }

  if ((message.images || []).length) {
    const attachments = el("div", "attachment-list");
    for (const image of message.images) {
      const alt = typeof image?.alt === "string" ? image.alt.trim() : "";
      attachments.appendChild(el("span", "attachment", alt ? `IMAGEM · ${alt}` : "IMAGEM"));
    }
    article.appendChild(attachments);
  }

  return article;
}

function renderConversation(session, index, total) {
  const section = el("section", "conversation");
  const header = el("header", "conversation-header");

  const brandline = el("div", "brandline");
  brandline.appendChild(el("span", "brandmark"));
  brandline.appendChild(document.createTextNode("ChatVault · conversa exportada"));
  header.appendChild(brandline);
  header.appendChild(el("h1", "conversation-title", session.name || "Conversa"));

  const meta = el("div", "meta");
  meta.appendChild(el("span", "meta-chip", session.site || "Assistente"));
  if (session.dateLabel) meta.appendChild(el("span", "meta-chip", session.dateLabel));
  const count = Number.isFinite(session.messageCount) ? session.messageCount : (session.messages || []).length;
  meta.appendChild(el("span", "meta-chip", `${count} ${count === 1 ? "mensagem" : "mensagens"}`));
  if (total > 1) meta.appendChild(el("span", "meta-chip", `Conversa ${index + 1} de ${total}`));
  header.appendChild(meta);
  section.appendChild(header);

  const messages = el("div", "messages");
  for (const message of session.messages || []) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    messages.appendChild(renderMessage(message, session.site));
  }
  section.appendChild(messages);

  const footer = el("footer", "conversation-footer");
  footer.appendChild(el("span", "", "Conteúdo exportado em formato textual"));
  footer.appendChild(el("span", "", "ChatVault"));
  section.appendChild(footer);

  return section;
}

function render(payload) {
  const title = payload?.title || "Conversa";
  document.title = `${title} — ChatVault`;

  const root = document.getElementById("document");
  root.replaceChildren();

  const sessions = Array.isArray(payload?.sessions) ? payload.sessions : [];
  if (!sessions.length) {
    root.appendChild(el("div", "empty", "Nada para exportar."));
    return false;
  }

  sessions.forEach((session, index) => {
    root.appendChild(renderConversation(session, index, sessions.length));
  });
  return true;
}

async function start() {
  let payload = null;
  try {
    const data = await chrome.storage.local.get(PRINT_KEY);
    payload = data[PRINT_KEY];
  } catch (_) {}

  const printBtn = document.getElementById("printBtn");
  const closeBtn = document.getElementById("closeBtn");

  printBtn.addEventListener("click", () => window.print());
  closeBtn.addEventListener("click", () => window.close());

  const ok = render(payload);
  if (!ok) {
    printBtn.disabled = true;
    return;
  }

  try { await chrome.storage.local.remove(PRINT_KEY); } catch (_) {}
  setTimeout(() => window.print(), 250);
}

start();
