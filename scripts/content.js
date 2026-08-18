(() => {
  if (window.__chatVault) return;

  const clean = (s) =>
    (s || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  const visible = (el) =>
    !!el && !!(el.offsetParent || el.getClientRects().length) &&
    getComputedStyle(el).visibility !== "hidden";

  const textOf = (el) => (el ? clean(el.innerText) : "");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function collectImages(root) {
    const out = [];
    const seen = new Set();
    for (const im of root.querySelectorAll("img")) {
      const src = im.currentSrc || im.getAttribute("src") || "";
      if (!/^https?:\/\//.test(src)) continue;
      if (/s2\/favicons|\/favicon|sprites?-|\.svg(\?|$)/i.test(src)) continue;
      const w = im.naturalWidth || parseInt(im.getAttribute("width") || "0", 10) || 0;
      if (w && w < 150) continue;
      if (seen.has(src)) continue;
      seen.add(src);
      out.push({ src, alt: im.getAttribute("alt") || "" });
    }
    return out;
  }

  async function toDataUrl(src) {
    try {
      const r = await fetch(src, { credentials: "include" });
      if (!r.ok) return null;
      const blob = await r.blob();
      if (!/^image\//.test(blob.type)) return null;
      if (blob.size > 6000000) return null;
      return await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = () => rej();
        fr.readAsDataURL(blob);
      });
    } catch (_) {
      return null;
    }
  }

  async function resolveImages(messages) {
    const all = [];
    for (const m of messages) for (const im of m.images || []) all.push(im);
    const uniq = [...new Set(all.map((i) => i.src))];
    const cache = new Map();
    await Promise.all(uniq.map(async (src) => cache.set(src, await toDataUrl(src))));
    for (const im of all) im.data = cache.get(im.src) || null;
  }

  function findScroller(adapter) {
    // Sites como o ChatGPT podem ter mais de uma área rolável (ex.: sidebar + conversa).
    // Dê ao adapter a chance de apontar o scroller sem depender do tamanho do elemento.
    try {
      const preferred = adapter?.scroller?.();
      if (preferred) return preferred;
    } catch (_) {}

    let best = null, bestH = 0;
    for (const el of document.querySelectorAll("main *, body > div *")) {
      const st = getComputedStyle(el);
      if (!/(auto|scroll)/.test(st.overflowY)) continue;
      if (el.scrollHeight <= el.clientHeight + 240) continue;
      if (el.scrollHeight > bestH) { bestH = el.scrollHeight; best = el; }
    }
    return best || document.scrollingElement || document.documentElement;
  }

  async function scrollToTop(sc) {
    let last = -1, still = 0;
    for (let i = 0; i < 100; i++) {
      sc.scrollTop = 0;
      await wait(150);
      if (sc.scrollTop <= 2) {
        if (sc.scrollHeight === last) { if (++still >= 2) break; }
        else { still = 0; last = sc.scrollHeight; }
      }
    }
  }

  const hashItem = (it) =>
    `${it.role}|${(it.text || "").slice(0, 180)}|${(it.images || []).map((i) => i.src).join(",")}`;

  const adapters = {
    chatgpt: {
      match: (h) => /(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/.test(h),
      label: "ChatGPT",
      scroller() {
        // O scroll correto da conversa é o data-scroll-root que contém #thread.
        // Isso evita selecionar o scroll da barra lateral, que também é rolável.
        const thread = document.querySelector("#thread");
        const threadRoot = thread?.closest("[data-scroll-root]");
        if (threadRoot && visible(threadRoot)) return threadRoot;

        const turn = document.querySelector('[data-testid^="conversation-turn"]');
        const turnRoot = turn?.closest("[data-scroll-root]");
        if (turnRoot && visible(turnRoot)) return turnRoot;

        return [...document.querySelectorAll("[data-scroll-root]")]
          .find((el) => visible(el) && (el.querySelector("#thread") || el.querySelector('[data-testid^="conversation-turn"]'))) || null;
      },
      items() {
        const turns = [...document.querySelectorAll('[data-testid^="conversation-turn"]')];
        if (turns.length) {
          const res = [];
          for (const turn of turns) {
            let role = turn.getAttribute("data-turn");
            const roleEl = turn.querySelector("[data-message-author-role]");
            if (role !== "user" && role !== "assistant") role = roleEl?.getAttribute("data-message-author-role");
            if (role !== "user" && role !== "assistant") continue;
            let text = "";
            const md = turn.querySelector(".markdown");
            if (md) {
              text = textOf(md);
            } else {
              const parts = [...turn.querySelectorAll(
                '[data-testid="collapsible-user-message-content"] .whitespace-pre-wrap, [data-message-author-role="user"] .whitespace-pre-wrap'
              )];
              if (parts.length) text = clean(parts.map((p) => p.innerText).join("\n"));
              else if (roleEl) text = textOf(roleEl);
            }
            res.push({ id: turn.getAttribute("data-turn-id") || "", role, text, images: collectImages(turn) });
          }
          return res;
        }
        return [...document.querySelectorAll("[data-message-author-role]")]
          .map((n) => ({
            id: n.getAttribute("data-message-id") || "",
            role: n.getAttribute("data-message-author-role"),
            text: textOf(n.querySelector(".markdown") || n.querySelector(".whitespace-pre-wrap") || n),
            images: collectImages(n),
          }))
          .filter((m) => m.role === "user" || m.role === "assistant");
      },
    },

    gemini: {
      match: (h) => /(^|\.)gemini\.google\.com$/.test(h),
      label: "Gemini",
      items() {
        const els = [...document.querySelectorAll("user-query, model-response")];
        return els.map((el) => {
          const isUser = el.tagName.toLowerCase() === "user-query";
          let text = "";
          if (isUser) {
            const q = el.querySelector(".query-text");
            if (q) {
              const lines = [...q.querySelectorAll(".query-text-line")];
              if (lines.length) {
                text = lines.map((l) => l.innerText).join("\n");
              } else {
                const c = q.cloneNode(true);
                c.querySelectorAll(".cdk-visually-hidden, .screen-reader-user-query-label").forEach((n) => n.remove());
                text = c.innerText;
              }
            } else {
              text = textOf(el);
            }
          } else {
            const md =
              el.querySelector("message-content div.markdown.markdown-main-panel") ||
              el.querySelector("message-content div.markdown") ||
              el.querySelector(".markdown.markdown-main-panel") ||
              el.querySelector("div.response-content") ||
              el.querySelector("message-content") ||
              el;
            text = textOf(md);
          }
          const role = isUser ? "user" : "assistant";
          const cont = el.closest(".conversation-container");
          return { id: cont?.id ? cont.id + ":" + role : "", role, text: clean(text), images: collectImages(el) };
        });
      },
    },

    grok: {
      match: (h) => /(^|\.)grok\.com$/.test(h) || (/(^|\.)x\.com$/.test(h) && /\/i\/grok/.test(location.pathname)),
      label: "Grok",
      items() {
        let bubbles = [...document.querySelectorAll('[data-testid="user-message"], [data-testid="assistant-message"]')].filter(visible);
        if (bubbles.length) {
          return bubbles.map((b) => {
            const role = b.getAttribute("data-testid") === "user-message" ? "user" : "assistant";
            const md = b.querySelector(".response-content-markdown") || b.querySelector(".markdown, .prose") || b;
            const wrap = b.closest('[id^="response-"]');
            return { id: wrap?.id || "", role, text: textOf(md), images: collectImages(b) };
          });
        }
        bubbles = [...document.querySelectorAll(".message-bubble, [class*='message-bubble']")].filter(visible);
        if (bubbles.length) {
          return bubbles.map((b, i) => ({
            id: "", role: roleByAlignment(b, i),
            text: textOf(b.querySelector(".response-content-markdown, .markdown, .prose") || b),
            images: collectImages(b),
          }));
        }
        return [...document.querySelectorAll("[class*='response-content-markdown'], .prose")].filter(visible)
          .map((el, i) => ({ id: "", role: i % 2 === 0 ? "user" : "assistant", text: textOf(el), images: collectImages(el) }));
      },
    },
  };

  function roleByAlignment(el, i) {
    let cur = el;
    for (let d = 0; d < 4 && cur; d++, cur = cur.parentElement) {
      const cls = cur.className && cur.className.toString ? cur.className.toString() : "";
      if (/items-end|justify-end|ml-auto/i.test(cls)) return "user";
      if (/items-start|justify-start/i.test(cls)) return "assistant";
    }
    return i % 2 === 0 ? "user" : "assistant";
  }

  function currentAdapter() {
    const h = location.hostname;
    for (const key of Object.keys(adapters)) if (adapters[key].match(h)) return adapters[key];
    return null;
  }

  function findComposer() {
    const h = location.hostname;
    if (/gemini\.google\.com/.test(h)) {
      return document.querySelector('.ql-editor[contenteditable="true"]');
    }
    if (/grok\.com/.test(h) || /x\.com/.test(h)) {
      return document.querySelector('[data-testid="chat-input"] [contenteditable="true"]') ||
             document.querySelector('.tiptap.ProseMirror[contenteditable="true"]') ||
             document.querySelector('div[contenteditable="true"][role="textbox"]') ||
             document.querySelector("textarea:not([readonly])");
    }
    return document.querySelector('#prompt-textarea[contenteditable="true"]') ||
           document.querySelector("#prompt-textarea") ||
           document.querySelector("textarea:not([readonly])");
  }

  window.__chatVault = {
    detect() {
      const a = currentAdapter();
      return a ? { supported: true, site: a.label } : { supported: false, site: null };
    },

    async extract() {
      const a = currentAdapter();
      if (!a) return { ok: false, reason: "unsupported" };

      const sc = findScroller(a);
      const map = new Map();
      let order = 0;
      const harvest = () => {
        let items = [];
        try { items = a.items() || []; } catch (_) {}
        for (const it of items) {
          if (it.role !== "user" && it.role !== "assistant") continue;
          const id = it.id || hashItem(it);
          const prev = map.get(id);
          if (!prev) {
            it._o = order++;
            map.set(id, it);
          } else if ((it.text || "").length > (prev.text || "").length || (it.images || []).length > (prev.images || []).length) {
            it._o = prev._o;
            map.set(id, it);
          }
        }
      };

      try {
        await scrollToTop(sc);
        harvest();
        let guard = 0, stuck = 0;
        while (guard++ < 600) {
          harvest();
          const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4;
          if (atBottom) break;
          const before = sc.scrollTop;
          sc.scrollTop = Math.min(sc.scrollHeight, sc.scrollTop + Math.max(200, sc.clientHeight * 0.85));
          await wait(150);
          if (sc.scrollTop === before) { if (++stuck >= 3) break; } else stuck = 0;
        }
        harvest();
      } catch (_) {
        harvest();
      }

      let messages = [...map.values()]
        .sort((x, y) => x._o - y._o)
        .map((m) => ({ role: m.role === "user" ? "user" : "assistant", text: clean(m.text), images: m.images || [] }))
        .filter((m) => m.text || (m.images && m.images.length));

      const dedup = [];
      for (const m of messages) {
        const prev = dedup[dedup.length - 1];
        const sameImgs = prev && JSON.stringify((prev.images || []).map((i) => i.src)) === JSON.stringify((m.images || []).map((i) => i.src));
        if (prev && prev.role === m.role && prev.text === m.text && sameImgs) continue;
        dedup.push(m);
      }
      messages = dedup;

      await resolveImages(messages);
      messages = messages.map((m) => ({
        role: m.role,
        text: m.text,
        images: (m.images || []).map((i) => ({ src: i.data || i.src, alt: i.alt || "" })),
      }));

      const title =
        (document.title || "").replace(/\s*[-–|]\s*(ChatGPT|Gemini|Grok).*$/i, "").trim() ||
        a.label + " — conversa";

      const hasContent = messages.some((m) => m.text || m.images.length);
      return {
        ok: hasContent,
        reason: hasContent ? null : "empty",
        site: a.label,
        title,
        url: location.href,
        messages,
      };
    },

    insertText(text) {
      const box = findComposer() ||
        document.querySelector('.ql-editor[contenteditable="true"], #prompt-textarea, textarea:not([readonly]), div[contenteditable="true"]');
      if (!box) return { ok: false };

      box.focus();
      if (box.tagName === "TEXTAREA") {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
        setter.call(box, text);
        box.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        box.classList.remove("ql-blank");
        try {
          document.execCommand("selectAll", false, null);
          document.execCommand("insertText", false, text);
        } catch (_) {}
        if (!box.innerText.trim()) box.textContent = text;
        box.dispatchEvent(new InputEvent("input", { bubbles: true }));
      }
      return { ok: true };
    },
  };
})();
