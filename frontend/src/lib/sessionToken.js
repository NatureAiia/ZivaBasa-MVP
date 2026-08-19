/*
  In-memory-only holder for the current access token (never localStorage/sessionStorage — see
  authStore.jsx's module docstring for why). A separate module from authStore.jsx/api.js purely
  to avoid a circular import: api.js's authHeaders() needs to read the token, authStore.jsx needs
  to write it, and api.js is also used by things authStore.jsx doesn't depend on.
*/
let _accessToken = null;

export function getAccessToken() {
  return _accessToken;
}

export function setAccessToken(token) {
  _accessToken = token;
}
