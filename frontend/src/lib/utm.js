const STORAGE_KEY = "zivabasa-utm";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

// Captures utm_* params from the landing URL on first touch and keeps them in sessionStorage so
// later attribution (e.g. tagging a signup) can read where the visit came from, even after the
// user has navigated to /login or elsewhere and the query string is gone.
export function captureUtmParams() {
  const params = new URLSearchParams(window.location.search);
  const found = {};
  UTM_KEYS.forEach((key) => {
    const value = params.get(key);
    if (value) found[key] = value;
  });
  if (Object.keys(found).length > 0) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...found, landing_path: window.location.pathname }));
  }
}

export function getStoredUtmParams() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
