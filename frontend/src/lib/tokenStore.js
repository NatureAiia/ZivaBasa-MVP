/*
  Token balance (growth mechanic 3) — read-only from the client, backed by the backend's
  /tokens/balance and /tokens/ledger routes (backend/api/routes/token_balance.py) instead of
  direct `supabase.from("token_balances"/"token_ledger")` reads. Every write still goes through
  the backend's own internal spend_tokens() (backend/api/token_service.py, gated by
  backend/api/tokens.py) — this store only ever reads, same as before.
*/
import { request } from "./api";

export async function getTokenBalance() {
  try {
    // No row yet (gate never granted this user tokens) reads as "unlimited/not tracked" rather
    // than "zero" — a zero balance should only ever come from an actual token_balances row.
    return await request("/tokens/balance");
  } catch (e) {
    console.error("getTokenBalance failed:", e.message);
    return null;
  }
}

export async function getTokenLedger(limit = 50) {
  try {
    return await request(`/tokens/ledger?limit=${limit}`);
  } catch (e) {
    console.error("getTokenLedger failed:", e.message);
    return [];
  }
}
