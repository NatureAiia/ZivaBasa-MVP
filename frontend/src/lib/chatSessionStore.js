/*
  Chat session store — persisted (localStorage, same pattern as every other store in this app).
  Exists so StudioPanel's "Chat report" button can see the live conversation without ChatPane
  and StudioPanel (siblings under ChatTab, no shared state today) needing a prop-drilled parent
  rewrite. Same idea as batchStore feeding both the dashboard KPI grid and Roster.
*/
const KEY = "zivabasa-chat-session";

export function getChatSession() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "null");
    return parsed || { messages: [], toolCallLog: [] };
  } catch {
    return { messages: [], toolCallLog: [] };
  }
}

export function saveChatSession(messages, toolCallLog) {
  localStorage.setItem(KEY, JSON.stringify({ messages, toolCallLog }));
}

export function clearChatSession() {
  localStorage.setItem(KEY, JSON.stringify({ messages: [], toolCallLog: [] }));
}
