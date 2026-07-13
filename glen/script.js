// GLEN - frontend chat logic
// Conversation history is modeled as ConversationMessage records:
//   { role: "user" | "assistant", content: string, session_id: string }
// and persisted in localStorage, keyed by session_id, so refreshing the
// page (or opening it later) restores the chat exactly where it left off.

const STORAGE_PREFIX = "glen_messages_"; // + session_id
const CURRENT_SESSION_KEY = "glen_current_session";

// The frontend can be hosted anywhere (Vercel, GitHub Pages, etc.) but the
// serverless function only exists on the Vercel deployment. If this page is
// running on the vercel.app domain itself, a relative path works fine; if
// it's embedded elsewhere (like maximumreality.xyz), point at the full URL.
const API_BASE = window.location.hostname.includes("vercel.app")
  ? ""
  : "https://glen-snowy.vercel.app";

const chatWindow = document.getElementById("chatWindow");
const composer = document.getElementById("composer");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const newChatBtn = document.getElementById("newChatBtn");

function generateSessionId() {
  return "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
}

function getCurrentSessionId() {
  let id = localStorage.getItem(CURRENT_SESSION_KEY);
  if (!id) {
    id = generateSessionId();
    localStorage.setItem(CURRENT_SESSION_KEY, id);
  }
  return id;
}

function loadMessages(sessionId) {
  const raw = localStorage.getItem(STORAGE_PREFIX + sessionId);
  return raw ? JSON.parse(raw) : [];
}

function saveMessages(sessionId, messages) {
  localStorage.setItem(STORAGE_PREFIX + sessionId, JSON.stringify(messages));
}

function appendMessageRecord(sessionId, role, content) {
  const messages = loadMessages(sessionId);
  messages.push({ role, content, session_id: sessionId });
  saveMessages(sessionId, messages);
  return messages;
}

function renderMessage({ role, content }) {
  const row = document.createElement("div");
  row.className = "msg-row " + (role === "user" ? "user" : "glen");

  const bubble = document.createElement("div");
  bubble.className = "bubble " + (role === "user" ? "user" : "glen");

  const text = document.createElement("span");
  text.textContent = content;
  bubble.appendChild(text);

  if (role === "assistant") {
    const sig = document.createElement("span");
    sig.className = "signature";
    sig.textContent = "— GLEN";
    bubble.appendChild(sig);
  }

  row.appendChild(bubble);
  chatWindow.appendChild(row);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function renderAll(messages) {
  chatWindow.innerHTML = "";
  messages.forEach(renderMessage);
}

function showTyping() {
  const row = document.createElement("div");
  row.className = "msg-row glen";
  row.id = "typingRow";
  const bubble = document.createElement("div");
  bubble.className = "bubble glen typing";
  bubble.textContent = "Glen is thinking...";
  row.appendChild(bubble);
  chatWindow.appendChild(row);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function hideTyping() {
  const row = document.getElementById("typingRow");
  if (row) row.remove();
}

async function sendMessage(userText) {
  const sessionId = getCurrentSessionId();

  const messagesAfterUser = appendMessageRecord(sessionId, "user", userText);
  renderMessage({ role: "user", content: userText });

  sendBtn.disabled = true;
  showTyping();

  try {
    const response = await fetch(API_BASE + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messagesAfterUser.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    const data = await response.json();
    hideTyping();

    if (!response.ok) {
      renderMessage({
        role: "assistant",
        content:
          "(something's wrong on my end — " +
          (data.error || "unknown error") +
          ")",
      });
      return;
    }

    appendMessageRecord(sessionId, "assistant", data.reply);
    renderMessage({ role: "assistant", content: data.reply });
  } catch (err) {
    hideTyping();
    renderMessage({
      role: "assistant",
      content: "(connection dropped. try again in a sec.)",
    });
  } finally {
    sendBtn.disabled = false;
  }
}

composer.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;
  messageInput.value = "";
  sendMessage(text);
});

newChatBtn.addEventListener("click", () => {
  const newId = generateSessionId();
  localStorage.setItem(CURRENT_SESSION_KEY, newId);
  chatWindow.innerHTML = "";
  renderMessage({
    role: "assistant",
    content: "Alright, clean page. What's going on?",
  });
  appendMessageRecord(newId, "assistant", "Alright, clean page. What's going on?");
});

// Init on load
(function init() {
  const sessionId = getCurrentSessionId();
  const messages = loadMessages(sessionId);
  if (messages.length === 0) {
    const greeting = "Hey. What's on your mind?";
    appendMessageRecord(sessionId, "assistant", greeting);
    renderMessage({ role: "assistant", content: greeting });
  } else {
    renderAll(messages);
  }
})();
