/*
  Token balance (growth mechanic 3) — read-only from the client (token_balances/token_ledger
  RLS policies only grant SELECT to the owning user; every write goes through the backend's
  service-role key via backend/api/tokens.py's spend_tokens() RPC, see
  backend/supabase/migration_add_engagement.sql). This store only ever reads.
*/
import { supabase } from "./supabaseClient";

export async function getTokenBalance() {
  const { data, error } = await supabase
    .from("token_balances")
    .select("balance, monthly_grant, cycle_started_at")
    .maybeSingle();
  if (error) {
    console.error("getTokenBalance failed:", error.message);
    return null;
  }
  // No row yet (gate never granted this user tokens) reads as "unlimited/not tracked" rather
  // than "zero" — a zero balance should only ever come from an actual token_balances row.
  return data;
}

export async function getTokenLedger(limit = 50) {
  const { data, error } = await supabase
    .from("token_ledger")
    .select("delta, reason, endpoint, balance_after, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("getTokenLedger failed:", error.message);
    return [];
  }
  return data || [];
}
