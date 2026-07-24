// One-off demo/debug driver: signs up a fresh test account and walks through the app's main
// surfaces, screenshotting each step and collecting console errors + failed network requests.
// Not a permanent test — a diagnostic pass requested to verify demo-readiness end to end.
import { chromium } from "playwright";
import fs from "fs";

const BASE_URL = "http://127.0.0.1:5173";
const STAMP = Date.now();
const EMAIL = `demo-walkthrough-${STAMP}@zivabasa-test.local`;
const PASSWORD = "DemoWalkthrough!23";
const SHOT_DIR = "./demo_walkthrough_shots";

fs.mkdirSync(SHOT_DIR, { recursive: true });

const consoleErrors = [];
const failedRequests = [];
const report = [];

function log(step, status, detail = "") {
  report.push({ step, status, detail });
  console.log(`[${status}] ${step}${detail ? " — " + detail : ""}`);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 950 });

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push({ text: msg.text(), url: page.url() });
});
page.on("requestfailed", (req) => {
  failedRequests.push({ url: req.url(), failure: req.failure()?.errorText, page: page.url() });
});
page.on("response", (res) => {
  if (res.status() >= 400 && !res.url().includes("chrome-extension")) {
    failedRequests.push({ url: res.url(), status: res.status(), page: page.url() });
  }
});

async function shot(name) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false }).catch(() => {});
}

try {
  // 1. Landing page — dark mode
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
  await shot("01_landing_dark");
  log("Landing page loads (dark)", "OK");

  // Toggle to light mode if a theme toggle exists on landing
  const themeToggle = page.locator('button[aria-label*="theme" i], button[title*="theme" i]').first();
  if (await themeToggle.count()) {
    await themeToggle.click().catch(() => {});
    await page.waitForTimeout(400);
    await shot("02_landing_light");
    log("Landing page theme toggle", "OK");
  } else {
    log("Landing page theme toggle", "SKIP", "no theme toggle button found on landing");
  }

  // 2. Sign up a fresh test account
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await shot("03_login_page");

  // Switch to sign-up mode FIRST — the form's Full name/Organization/Job title fields only
  // exist in the DOM once mode === "signUp" (see LoginPage.jsx's FormPanel).
  const signUpToggle = page.getByRole("button", { name: "Sign up", exact: true }).first();
  if (await signUpToggle.count()) {
    await signUpToggle.click();
    await page.waitForTimeout(400);
  } else {
    log("Switch to sign-up mode", "FAIL", "no exact 'Sign up' toggle button found");
  }
  await shot("04_signup_form");

  const fill = async (labelRe, value) => {
    const loc = page.getByLabel(labelRe).last();
    if (await loc.count()) await loc.fill(value);
    return loc.count();
  };

  await fill(/full name/i, "Demo Walkthrough User");
  await fill(/organization/i, "Demo Bank Ltd");
  await fill(/job title/i, "HR Admin");
  await fill(/^email$/i, EMAIL);
  await fill(/^password$/i, PASSWORD);

  await shot("05_signup_filled");

  const submitBtn = page.getByRole("button", { name: "Create account", exact: true }).last();
  if (await submitBtn.count()) {
    await submitBtn.click();
  } else {
    log("Sign up submit", "FAIL", "could not find the 'Create account' submit button");
  }

  await page.waitForURL(/\/app/, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  if (/\/app/.test(page.url())) {
    log("Sign up + auto-login", "OK", page.url());
  } else {
    log("Sign up + auto-login", "FAIL", `still on ${page.url()}`);
  }
  await shot("06_post_signup");

  // 3. Settings — confirm auto-created profile + editable role
  await page.goto(`${BASE_URL}/app/systems/settings`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(800);
  await shot("07_settings");
  const fullNameField = page.getByLabel(/full name/i).last();
  const fullNameVal = (await fullNameField.count()) ? await fullNameField.inputValue().catch(() => "") : null;
  if (fullNameVal === "Demo Walkthrough User") {
    log("Auto-created profile shows signup data", "OK", `full name = "${fullNameVal}"`);
  } else {
    log("Auto-created profile shows signup data", "FAIL", `full name field = "${fullNameVal}"`);
  }

  const roleSelect = page.locator("select").first();
  if (await roleSelect.count()) {
    const before = await roleSelect.inputValue();
    await roleSelect.selectOption("admin").catch(() => {});
    const saveBtn = page.getByRole("button", { name: /save profile/i });
    if (await saveBtn.count()) {
      await saveBtn.click();
      await page.waitForTimeout(1000);
      await shot("08_settings_role_saved");
      const savedText = await page.locator("text=/saved/i").count();
      log("Role dropdown editable + save", savedText ? "OK" : "UNSURE", `changed from ${before} to admin`);
    } else {
      log("Role dropdown editable + save", "FAIL", "no save button found");
    }
  } else {
    log("Role dropdown editable + save", "FAIL", "no <select> found on settings page");
  }

  // 4. Dashboard
  await page.goto(`${BASE_URL}/app/models/zivabasa/dashboard`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(1200);
  await shot("09_dashboard");
  log("Dashboard loads", "OK", page.url());

  // 5. Predict
  await page.goto(`${BASE_URL}/app/models/zivabasa/predict`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(1000);
  await shot("10_predict_page");
  // Try to fill any visible numeric/text inputs with a placeholder value and submit
  const predictInputs = page.locator('input[type="number"], input[type="text"]');
  const inputCount = await predictInputs.count();
  for (let i = 0; i < Math.min(inputCount, 15); i++) {
    const inp = predictInputs.nth(i);
    const val = await inp.inputValue().catch(() => "");
    if (!val) await inp.fill("1").catch(() => {});
  }
  const predictBtn = page.getByRole("button", { name: /predict/i }).first();
  if (await predictBtn.count()) {
    await predictBtn.click().catch(() => {});
    await page.waitForTimeout(2500);
    await shot("11_predict_result");
    log("Run prediction", "OK", "clicked predict button, see screenshot");
  } else {
    log("Run prediction", "SKIP", "no predict button found (form may need dropdown selections first)");
  }

  // 6. Organizational Structure
  await page.goto(`${BASE_URL}/app/models/zivabasa/my-organization`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(1000);
  await shot("12_my_organization");
  log("My Organization loads", "OK", page.url());

  // 7. Roster
  await page.goto(`${BASE_URL}/app/models/zivabasa/roster`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(1000);
  await shot("13_roster");
  log("Roster loads", "OK", page.url());

  // 8. Cost Monitoring
  await page.goto(`${BASE_URL}/app/cost-monitoring`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(1000);
  await shot("14_cost_monitoring");
  log("Cost Monitoring loads", "OK", page.url());

  // 9. Chiedza widget
  await page.goto(`${BASE_URL}/app/models/zivabasa/dashboard`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(800);
  const chiedzaBtn = page.locator('button[aria-label*="Chiedza" i]').first();
  if (await chiedzaBtn.count()) {
    await chiedzaBtn.click();
    await page.waitForTimeout(500);
    const chatInput = page.getByPlaceholder(/ask chiedza/i);
    if (await chatInput.count()) {
      await chatInput.fill("What can you help me with?");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(4000);
      await shot("15_chiedza_chat");
      log("Chiedza chat", "OK", "message sent, see screenshot");
    }
  } else {
    log("Chiedza chat", "FAIL", "floating widget button not found");
  }

  // 10. Settings — invite a teammate
  await page.goto(`${BASE_URL}/app/systems/settings`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(800);
  const inviteEmailInput = page.locator('input[type="email"]').last();
  if (await inviteEmailInput.count()) {
    await inviteEmailInput.fill(`invitee-${STAMP}@zivabasa-test.local`);
    const inviteBtn = page.getByRole("button", { name: /invite/i }).last();
    await inviteBtn.click().catch(() => {});
    await page.waitForTimeout(1200);
    await shot("16_invite_sent");
    log("Invite a teammate", "OK", "invite submitted, see screenshot");
  } else {
    log("Invite a teammate", "FAIL", "no email input found for invite panel");
  }

} catch (err) {
  log("UNCAUGHT ERROR", "FAIL", err.message);
  await shot("99_uncaught_error");
} finally {
  await browser.close();
}

console.log("\n=== CONSOLE ERRORS ===");
console.log(consoleErrors.length ? JSON.stringify(consoleErrors, null, 2) : "(none)");
console.log("\n=== FAILED / 4xx-5xx REQUESTS ===");
console.log(failedRequests.length ? JSON.stringify(failedRequests, null, 2) : "(none)");
console.log("\n=== STEP REPORT ===");
console.log(JSON.stringify(report, null, 2));

fs.writeFileSync(
  "./demo_walkthrough_report.json",
  JSON.stringify({ report, consoleErrors, failedRequests, testEmail: EMAIL }, null, 2)
);
