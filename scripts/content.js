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

  function findScroller() {
    let best = null, bestH = 0;
    for (const el of document.querySelectorAll("main *, body > div *")) {
      const st = getComputedStyle(el);
      if (!/(auto|scroll)/.test(st.overflowY)) continue;
      if (el.scrollHeight <= el.clientHeight + 240) continue;
      if (el.scrollHeight > bestH) { bestH = el.scrollHeight; best = el; }
    }
    return best || document.scrollingElement || document.documentElement;
  }

  async function autoScroll(countFn) {
    const sc = findScroller();
    let last = -1, stable = 0, guard = 0;
    while (guard++ < 80) {
      sc.scrollTop = 0;
      await wait(220);
      const c = countFn();
      if (c === last) { if (++stable >= 3) break; } else { stable = 0; last = c; }
    }
    sc.scrollTop = sc.scrollHeight;
    await wait(180);
  }

  function dedupe(list) {
    const out = [];
    for (const m of list) {
      if (!m.text) continue;
      const prev = out[out.length - 1];
      if (prev && prev.role === m.role && prev.text === m.text) continue;
      out.push(m);
    }
    return out;
  }

  const adapters = {
    chatgpt: {
      match: (h) => /(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/.test(h),
      label: "ChatGPT",
      count: () => document.querySelectorAll("[data-message-author-role]").length,
      extract() {
        let nodes = [...document.querySelectorAll("[data-message-author-role]")];
        if (nodes.length) {
          return nodes
            .map((n) => ({
              role: n.getAttribute("data-message-author-role"),
              text: textOf(n.querySelector(".markdown") || n),
            }))
            .filter((m) => m.role === "user" || m.role === "assistant");
        }
        nodes = [...document.querySelectorAll('[data-testid^="conversation-turn"]')];
        return nodes.map((n) => ({
          role: n.querySelector(".markdown") ? "assistant" : "user",
          text: textOf(n),
        }));
      },
    },

    gemini: {
      match: (h) => /(^|\.)gemini\.google\.com$/.test(h),
      label: "Gemini",
      count: () => document.querySelectorAll("user-query, model-response").length,
      extract() {
        const els = [...document.querySelectorAll("user-query, model-response")];
        if (!els.length) return [];
        return els.map((el) => {
          if (el.tagName.toLowerCase() === "user-query") {
            const q = el.querySelector(".query-text");
            let text = "";
            if (q) {
              const lines = [...q.querySelectorAll(".query-text-line")];
              if (lines.length) {
                text = lines.map((l) => l.innerText).join("\n");
              } else {
                const clone = q.cloneNode(true);
                clone.querySelectorAll(".cdk-visually-hidden, .screen-reader-user-query-label")
                  .forEach((n) => n.remove());
                text = clone.innerText;
              }
            } else {
              text = textOf(el);
            }
            return { role: "user", text: clean(text) };
          }
          const md =
            el.querySelector("message-content div.markdown.markdown-main-panel") ||
            el.querySelector("message-content div.markdown") ||
            el.querySelector(".markdown.markdown-main-panel") ||
            el.querySelector("div.response-content") ||
            el.querySelector("message-content") ||
            el;
          return { role: "assistant", text: textOf(md) };
        });
      },
    },

    grok: {
      match: (h) => /(^|\.)grok\.com$/.test(h) || (/(^|\.)x\.com$/.test(h) && /\/i\/grok/.test(location.pathname)),
      label: "Grok",
      count: () =>
        (document.querySelectorAll('[data-testid="user-message"], [data-testid="assistant-message"]').length ||
          document.querySelectorAll(".message-bubble, [class*='message-bubble']").length),
      extract() {
        let bubbles = [...document.querySelectorAll(
          '[data-testid="user-message"], [data-testid="assistant-message"]'
        )].filter(visible);
        if (bubbles.length) {
          return bubbles.map((b) => ({
            role: b.getAttribute("data-testid") === "user-message" ? "user" : "assistant",
            text: textOf(b.querySelector(".response-content-markdown") || b.querySelector(".markdown, .prose") || b),
          }));
        }

        bubbles = [...document.querySelectorAll(".message-bubble, [class*='message-bubble']")].filter(visible);
        if (bubbles.length) {
          return bubbles.map((b, i) => ({
            role: roleByAlignment(b, i),
            text: textOf(b.querySelector(".response-content-markdown, .markdown, .prose") || b),
          }));
        }

        const md = [...document.querySelectorAll("[class*='response-content-markdown'], .prose")].filter(visible);
        return md.map((el, i) => ({ role: i % 2 === 0 ? "user" : "assistant", text: textOf(el) }));
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
    for (const key of Object.keys(adapters)) {
      if (adapters[key].match(h)) return adapters[key];
    }
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
      try { await autoScroll(a.count); } catch (_) {}

      let messages = [];
      try { messages = a.extract() || []; } catch (_) { messages = []; }
      messages = dedupe(messages.map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        text: clean(m.text),
      })));

      const title =
        (document.title || "").replace(/\s*[-–|]\s*(ChatGPT|Gemini|Grok).*$/i, "").trim() ||
        a.label + " — conversa";

      return {
        ok: messages.length > 0,
        reason: messages.length ? null : "empty",
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
