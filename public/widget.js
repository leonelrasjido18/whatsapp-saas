(function () {
  "use strict";

  // Reads config from the <script> tag: data-key (required) and optional
  // data-api (base URL of the SaaS; defaults to the script's own origin).
  var script =
    document.currentScript ||
    (function () {
      var s = document.getElementsByTagName("script");
      return s[s.length - 1];
    })();

  var PUBLIC_KEY = script.getAttribute("data-key");
  if (!PUBLIC_KEY) {
    console.error("[webchat] falta data-key en el <script>");
    return;
  }
  var API_BASE =
    script.getAttribute("data-api") || new URL(script.src).origin;

  // Persistent anonymous session id.
  var SESSION_KEY = "webchat_session_" + PUBLIC_KEY;
  var sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId =
      Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(SESSION_KEY, sessionId);
  }

  var COLOR = script.getAttribute("data-color") || "#2563eb";
  var TITLE = script.getAttribute("data-title") || "Chateá con nosotros";
  var WELCOME =
    script.getAttribute("data-welcome") || "¡Hola! ¿En qué te puedo ayudar?";

  var lastSince = null;
  var pollTimer = null;
  var open = false;

  // ── Styles ──────────────────────────────────────────────────────────────
  var style = document.createElement("style");
  style.textContent = [
    ".wc-bubble{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;background:" +
      COLOR +
      ";box-shadow:0 4px 16px rgba(0,0,0,.25);cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2147483000;transition:transform .15s}",
    ".wc-bubble:hover{transform:scale(1.05)}",
    ".wc-bubble svg{width:26px;height:26px;fill:#fff}",
    ".wc-panel{position:fixed;bottom:88px;right:20px;width:340px;max-width:calc(100vw - 40px);height:460px;max-height:calc(100vh - 120px);background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.28);display:none;flex-direction:column;overflow:hidden;z-index:2147483000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}",
    ".wc-panel.wc-open{display:flex}",
    ".wc-header{background:" +
      COLOR +
      ";color:#fff;padding:14px 16px;font-weight:600;font-size:15px}",
    ".wc-msgs{flex:1;overflow-y:auto;padding:14px;background:#f7f8fa;display:flex;flex-direction:column;gap:8px}",
    ".wc-msg{max-width:80%;padding:8px 12px;border-radius:12px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word}",
    ".wc-in{align-self:flex-start;background:#fff;color:#111;border:1px solid #e5e7eb}",
    ".wc-out{align-self:flex-end;background:" + COLOR + ";color:#fff}",
    ".wc-form{display:flex;border-top:1px solid #eee;background:#fff}",
    ".wc-input{flex:1;border:0;padding:12px 14px;font-size:14px;outline:none}",
    ".wc-send{border:0;background:transparent;color:" +
      COLOR +
      ";font-weight:600;padding:0 16px;cursor:pointer;font-size:14px}",
  ].join("\n");
  document.head.appendChild(style);

  // ── Elements ────────────────────────────────────────────────────────────
  var bubble = document.createElement("div");
  bubble.className = "wc-bubble";
  bubble.innerHTML =
    '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.03 2 11c0 2.38 1.02 4.55 2.7 6.16-.1 1.2-.5 2.6-1.2 3.64 1.7-.28 3.16-.9 4.2-1.6 1.3.5 2.76.8 4.3.8 5.52 0 10-4.03 10-9s-4.48-9-10-9z"/></svg>';

  var panel = document.createElement("div");
  panel.className = "wc-panel";
  panel.innerHTML =
    '<div class="wc-header">' +
    escapeHtml(TITLE) +
    '</div><div class="wc-msgs" id="wc-msgs"></div>' +
    '<form class="wc-form" id="wc-form"><input class="wc-input" id="wc-input" placeholder="Escribí un mensaje…" autocomplete="off"/><button class="wc-send" type="submit">Enviar</button></form>';

  document.body.appendChild(bubble);
  document.body.appendChild(panel);

  var msgsEl = panel.querySelector("#wc-msgs");
  var formEl = panel.querySelector("#wc-form");
  var inputEl = panel.querySelector("#wc-input");

  var seen = {};

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  // side: "visitor" (right, colored) or "agent" (left, white).
  function addMsg(side, text) {
    var el = document.createElement("div");
    el.className = "wc-msg " + (side === "visitor" ? "wc-out" : "wc-in");
    el.textContent = text;
    msgsEl.appendChild(el);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  // Only the agent's replies (direction "out") are rendered from the server;
  // the visitor's own messages are echoed locally on submit to avoid dupes.
  function renderServerMessages(list) {
    list.forEach(function (m) {
      lastSince = m.created_at;
      if (m.direction !== "out" || seen[m.id]) return;
      seen[m.id] = true;
      addMsg("agent", m.body || "");
    });
  }

  function poll() {
    var url =
      API_BASE +
      "/api/webchat/" +
      encodeURIComponent(PUBLIC_KEY) +
      "/messages?sessionId=" +
      encodeURIComponent(sessionId) +
      (lastSince ? "&since=" + encodeURIComponent(lastSince) : "");
    fetch(url)
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (j && j.data) renderServerMessages(j.data);
      })
      .catch(function () {});
  }

  function startPolling() {
    if (pollTimer) return;
    poll();
    pollTimer = setInterval(poll, 3000);
  }

  bubble.addEventListener("click", function () {
    open = !open;
    panel.classList.toggle("wc-open", open);
    if (open) {
      if (!msgsEl.children.length && WELCOME) addMsg("agent", WELCOME);
      startPolling();
      inputEl.focus();
    }
  });

  formEl.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = inputEl.value.trim();
    if (!text) return;
    addMsg("visitor", text);
    inputEl.value = "";
    fetch(
      API_BASE + "/api/webchat/" + encodeURIComponent(PUBLIC_KEY),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionId, text: text }),
      },
    )
      .then(function () {
        setTimeout(poll, 1200);
      })
      .catch(function () {});
  });
})();
