/*
  Chat session store — now backed by Postgres (chat_sessions table, one row per user) instead
  of localStorage. Exists so StudioPanel's "Chat report" button can see the live conversation
  without ChatPane and StudioPanel needing a prop-drilled parent rewrite.
*/
import { supabase } from "./supabaseClient";

async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id;
}

export async function getChatSession() {
  const { data, error } = await supabase.from("chat_sessions").select("messages, tool_call_log").maybeSingle();
  if (error) {
    console.error("getChatSession failed:", error.message);
    return { messages: [], toolCallLog: [] };
  }
  if (!data) return { messages: [], toolCallLog: [] };
  return { messages: data.messages || [], toolCallLog: data.tool_call_log || [] };
}

export async function saveChatSession(messages, toolCallLog) {
  const user_id = await currentUserId();
  if (!user_id) return;
  const { error } = await supabase
    .from("chat_sessions")
    .upsert({ user_id, messages, tool_call_log: toolCallLog }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function clearChatSession() {
  await saveChatSession([], []);
}
