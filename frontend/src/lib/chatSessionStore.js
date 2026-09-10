/*
  Chat session store — backed by Postgres via the backend's /chat-sessions routes
  (backend/api/routes/chat_sessions.py, one row per user) instead of a direct
  `supabase.from("chat_sessions")` call. Exists so StudioPanel's "Chat report" button can see
  the live conversation without ChatPane and StudioPanel needing a prop-drilled parent rewrite.
*/
import { request } from "./api";

export async function getChatSession() {
  try {
    const data = await request("/chat-sessions");
    return { messages: data.messages || [], toolCallLog: data.tool_call_log || [] };
  } catch (e) {
    console.error("getChatSession failed:", e.message);
    return { messages: [], toolCallLog: [] };
  }
}

// Note: `messages` may include generate_image results (m.images, each a base64 PNG) — those
// persist to chat_sessions.messages as-is along with everything else. Fine for MVP volumes;
// revisit (e.g. move image bytes to local disk, keep only a URL here) if sessions with many
// generated images start bloating the table.
export async function saveChatSession(messages, toolCallLog) {
  await request("/chat-sessions", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, tool_call_log: toolCallLog }),
  });
}

export async function clearChatSession() {
  await saveChatSession([], []);
}
