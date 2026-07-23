// One-off verification script: log into the running ZivaBasa frontend as a real user,
// then exercise the exact predict_history insert path (same table/shape as history.js's
// logHistoryEntry) using the browser's live Supabase session, to prove RLS + schema are
// correctly wired end-to-end. Cleans up the test row it inserts.
import { chromium } from "playwright";

const EMAIL = process.argv[2];
const PASSWORD = process.argv[3];
const BASE_URL = "http://localhost:5173";

if (!EMAIL || !PASSWORD) {
  console.error("Usage: node verify_supabase_write.mjs <email> <password>");
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage();

try {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });

  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();

  await page.waitForURL(/\/app/, { timeout: 15000 });
  console.log("Login OK, landed on:", page.url());

  // Give supabase-js a moment to persist the session to localStorage.
  await page.waitForTimeout(1000);

  const result = await page.evaluate(async () => {
    const supabaseUrl = import.meta?.env?.VITE_SUPABASE_URL;
    // Fall back: read directly from whatever key supabase-js stored the session under.
    const storageKey = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    if (!storageKey) return { error: "no supabase session key found in localStorage" };
    const session = JSON.parse(localStorage.getItem(storageKey));
    const accessToken = session?.access_token;
    const anonKey = session?.access_token ? null : null;
    return { storageKey, hasAccessToken: !!accessToken, accessToken, userId: session?.user?.id };
  });

  if (result.error || !result.hasAccessToken) {
    console.error("FAIL: could not extract session token from browser:", result);
    process.exit(1);
  }
  console.log("Extracted live session for user:", result.userId);

  const anonKey = await page.evaluate(() => {
    // Grab it straight from the bundle's env at runtime via the already-constructed client's
    // internal fetch — simplest reliable path is just re-reading the env the app itself built with.
    return window.__VITE_SUPABASE_ANON_KEY__ || null;
  });

  // If the app doesn't expose the anon key on window, read it from the .env file passed in via argv.
  const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;

  const insertRes = await page.evaluate(
    async ({ url, anonKey, accessToken }) => {
      const resp = await fetch(`${url}/rest/v1/predict_history`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
          Prefer: "return=representation",
        },
        body: JSON.stringify({ results: { __verification_probe__: true, ts: Date.now() } }),
      });
      const body = await resp.json().catch(() => null);
      return { status: resp.status, body };
    },
    { url: SUPABASE_URL, anonKey: ANON_KEY, accessToken: result.accessToken }
  );

  console.log("INSERT response:", insertRes.status, JSON.stringify(insertRes.body));

  if (insertRes.status >= 200 && insertRes.status < 300 && Array.isArray(insertRes.body) && insertRes.body[0]?.id) {
    const rowId = insertRes.body[0].id;
    console.log("PASS: row inserted into predict_history with id", rowId);

    const delRes = await page.evaluate(
      async ({ url, anonKey, accessToken, id }) => {
        const resp = await fetch(`${url}/rest/v1/predict_history?id=eq.${id}`, {
          method: "DELETE",
          headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
        });
        return resp.status;
      },
      { url: SUPABASE_URL, anonKey: ANON_KEY, accessToken: result.accessToken, id: rowId }
    );
    console.log("Cleanup DELETE status:", delRes);
  } else {
    console.error("FAIL: insert did not succeed as expected");
    process.exit(1);
  }
} catch (err) {
  console.error("FAIL:", err);
  await page.screenshot({ path: "verify_failure.png" }).catch(() => {});
  process.exit(1);
} finally {
  await browser.close();
}
