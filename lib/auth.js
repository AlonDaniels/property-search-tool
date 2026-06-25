// Shared password-gate check for all API endpoints.
// The browser sends the credentials the user typed at the login screen.
export function checkAuth(req) {
  const u = String((req.headers["x-app-user"] || "")).trim();
  const p = String((req.headers["x-app-pass"] || "")).trim();
  const U = process.env.APP_USERNAME || "";
  const P = process.env.APP_PASSWORD || "";
  if (!U || !P) return false;
  return u === U && p === P;
}
