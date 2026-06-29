// Payworks browser-based authenticator (new email/OIDC login).
//
// Headlessly logs into the new email-based Payworks login (OIDC/SSO) and hands
// back an auth token (the ASP.NET_SessionId cookie) that you can reuse across
// many data requests. Login uses a persistent browser profile (user-data/) so
// the one-time SMS 2FA is remembered (run `node src/interactive-login.js` once to set that up).
//
// Public API:
//   getAuthToken(opts)         -> { token, cookieHeader, capturedAt }
//   fetchData(auth, url, opts) -> parsed JSON (or text)
//   logout(auth)               -> { ok }
//   TwoFactorRequiredError, SessionExpiredError
//
// `auth` may be the object returned by getAuthToken, a raw ASP.NET_SessionId
// string, or omitted (falls back to .auth/session.json, then PAYWORKS_AUTH_TOKEN).

import { chromium } from 'playwright';
import axios from 'axios';
import https from 'https';
import crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

dotenv.config();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

export const USER_DATA = path.join(ROOT, 'user-data');
export const AUTH_DIR = path.join(ROOT, '.auth');
export const SESSION_PATH = path.join(AUTH_DIR, 'session.json');

export const LOGIN_URL = 'https://login.payworks.ca/login';
export const PORTAL_URL = 'https://payroll.payworks.ca/pwnextv2/portal';
export const LOGOFF_URL = 'https://payroll.payworks.ca/logoff.asp';

const SESSION_COOKIE = 'ASP.NET_SessionId';

// Some Payworks endpoints sit behind a TLS stack needing legacy renegotiation.
export const legacyAgent = new https.Agent({
  secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
export class TwoFactorRequiredError extends Error {
  constructor() {
    super('2FA required — device trust has expired. Run `node src/interactive-login.js` (headed) to re-establish it.');
    this.name = 'TwoFactorRequiredError';
    this.code = 'TWO_FACTOR_REQUIRED';
  }
}
export class SessionExpiredError extends Error {
  constructor(msg) {
    super(msg || 'Session expired or invalid — obtain a fresh token with getAuthToken().');
    this.name = 'SessionExpiredError';
    this.code = 'SESSION_EXPIRED';
  }
}

// ---------------------------------------------------------------------------
// Low-level login helpers (also used by src/interactive-login.js for the headed 2FA setup)
// ---------------------------------------------------------------------------

// Server-side auth probe: GET the portal with redirects disabled. 200 means we
// are authenticated; a 3xx means we were bounced to a login screen. This does
// not execute page JS, so it reflects the true server-side session state.
export async function isAuthenticated(context) {
  try {
    const resp = await context.request.get(PORTAL_URL, { maxRedirects: 0, timeout: 20000 });
    return resp.status() === 200;
  } catch {
    return false;
  }
}

// The "active session" interstitial ("You are already logged into Payworks")
// offers a "Log out of current session" button. Clicking it clears the stale
// session so a fresh login can proceed.
export async function logOutStaleSession(page, log = () => {}) {
  const btn = page.locator('button:has-text("Log out of current session")').first();
  if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await btn.click().catch(() => {});
    log('  clicked "Log out of current session"');
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await sleep(2000);
    return true;
  }
  return false;
}

// Fill + submit the login form, then wait for an outcome.
// Returns 'ok' | 'activeSession' | 'twofa' | 'fail'.
export async function attemptLogin(context, page, { log = () => {}, timeoutMs = 90000 } = {}) {
  const email = process.env.PAYWORKS_EMAIL;
  const password = process.env.PAYWORKS_PASSWORD;
  if (!email || !password) {
    throw new Error('PAYWORKS_EMAIL and PAYWORKS_PASSWORD must be set in .env');
  }

  await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 60000 });

  const emailField = page.locator('#username__input');
  if (await emailField.isVisible({ timeout: 15000 }).catch(() => false)) {
    await emailField.fill(email);
    await page.locator('#password__input').fill(password);
    await page.locator('#loginLogInButton').click();
    log('  submitted credentials');
  } else {
    log('  no login form shown (an SSO session already exists)');
  }

  const start = Date.now();
  const deadline = start + timeoutMs;
  while (Date.now() < deadline) {
    if (page.url().includes('activeSession')) return 'activeSession';
    if (await isAuthenticated(context)) {
      // Guard against the transient portal->loginscreen bounce: confirm twice.
      await sleep(2500);
      if (!page.url().includes('activeSession') && (await isAuthenticated(context))) return 'ok';
    }
    if (
      Date.now() - start > 25000 &&
      page.url().includes('login.payworks.ca/login') &&
      !page.url().includes('activeSession') &&
      (await page.locator('#password__input').isVisible().catch(() => false))
    ) {
      return 'twofa';
    }
    await sleep(2500);
  }
  return 'fail';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Headlessly authenticate and return a reusable auth token. Closes the browser
// before returning; the server-side session stays alive until logout() or idle
// timeout, so the token works for subsequent fetchData() calls.
export async function getAuthToken({
  headless = true,
  save = true,
  activeSessionRetries = 3,
  verbose = false,
} = {}) {
  const log = verbose ? console.log : () => {};
  const context = await chromium.launchPersistentContext(USER_DATA, { headless });
  const page = context.pages()[0] || (await context.newPage());
  if (verbose) {
    page.on('framenavigated', (f) => {
      if (f === page.mainFrame()) log(`  -> ${f.url().split('?')[0]}`);
    });
  }

  try {
    let result = await attemptLogin(context, page, { log });
    let tries = 0;
    while (result === 'activeSession' && tries < activeSessionRetries) {
      tries++;
      log(`Active session already exists (attempt ${tries}) — logging it out and retrying.`);
      if (page.url().includes('activeSession')) await logOutStaleSession(page, log);
      result = await attemptLogin(context, page, { log });
    }

    if (result === 'twofa') throw new TwoFactorRequiredError();
    if (result !== 'ok') {
      throw new Error(
        `Payworks login failed (state: ${result}). If this is a new machine or device trust ` +
        'has lapsed, run `node src/interactive-login.js` (or InteractiveLogin.bat) to log in interactively.'
      );
    }

    const cookie = (await context.cookies()).find(
      (c) => c.name === SESSION_COOKIE && c.domain.includes('payworks.ca')
    );
    if (!cookie) throw new Error('Authenticated but no ASP.NET_SessionId cookie found.');

    const auth = {
      token: cookie.value,
      cookieHeader: `${SESSION_COOKIE}=${cookie.value}`,
      capturedAt: new Date().toISOString(),
    };
    if (save) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
      fs.writeFileSync(SESSION_PATH, JSON.stringify(auth, null, 2));
    }
    return auth;
  } finally {
    await context.close();
  }
}

// Normalize whatever the caller passed into a "ASP.NET_SessionId=..." header.
function resolveCookieHeader(auth) {
  if (auth && typeof auth === 'object') {
    if (auth.cookieHeader) return auth.cookieHeader;
    if (auth.token) return `${SESSION_COOKIE}=${auth.token}`;
  }
  if (typeof auth === 'string' && auth.trim()) {
    return auth.includes('=') ? auth : `${SESSION_COOKIE}=${auth}`;
  }
  // Fallbacks: saved session file, then env var.
  if (fs.existsSync(SESSION_PATH)) {
    const s = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
    if (s.cookieHeader) return s.cookieHeader;
    if (s.token) return `${SESSION_COOKIE}=${s.token}`;
  }
  if (process.env.PAYWORKS_AUTH_TOKEN) {
    return `${SESSION_COOKIE}=${process.env.PAYWORKS_AUTH_TOKEN}`;
  }
  throw new Error('No auth token available. Pass one, or run getAuthToken() first.');
}

// Fetch a Payworks URL with a previously obtained auth token. Returns parsed
// JSON when the response is JSON, otherwise the raw text. Throws
// SessionExpiredError if the token is no longer valid (server redirects to login).
export async function fetchData(auth, url, { parse = true } = {}) {
  const cookieHeader = resolveCookieHeader(auth);
  const resp = await axios.request({
    httpsAgent: legacyAgent,
    url,
    method: 'GET',
    headers: { Cookie: cookieHeader },
    maxRedirects: 0,
    validateStatus: (s) => s >= 200 && s < 400,
    responseType: 'text',
  });
  if (resp.status >= 300) {
    throw new SessionExpiredError(`Request to ${url} was redirected (HTTP ${resp.status}) — session likely expired.`);
  }
  const ct = resp.headers['content-type'] || '';
  if (parse && ct.includes('json')) return JSON.parse(resp.data);
  return resp.data;
}

// Release the server-side session. Call when all fetching is done.
export async function logout(auth) {
  let cookieHeader;
  try {
    cookieHeader = resolveCookieHeader(auth);
  } catch {
    // Nothing to log out.
    return { ok: true, note: 'no token' };
  }
  let status = null;
  try {
    const resp = await axios.get(LOGOFF_URL, {
      httpsAgent: legacyAgent,
      headers: { Cookie: cookieHeader },
      maxRedirects: 5,
      validateStatus: () => true,
      timeout: 30000,
    });
    status = resp.status;
  } finally {
    if (fs.existsSync(SESSION_PATH)) fs.rmSync(SESSION_PATH);
  }
  return { ok: true, status };
}
