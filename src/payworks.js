// Payworks data-access facade.
//
// Exposes a single getPayworksData(path) used by every loader, and dispatches
// to one of two login mechanisms based on .env:
//
//   • PAYWORKS_CUSTOMER set   -> LEGACY login (customer number + basic auth,
//                                via the external authenticator service).
//   • PAYWORKS_CUSTOMER unset  -> NEW browser/email login (Playwright headless
//                                OIDC/SSO; requires a one-time `node interactive-login.js`).
//
// This keeps both styles available so we can fall back to the legacy flow just
// by setting PAYWORKS_CUSTOMER in .env.

import * as dotenv from 'dotenv';
import * as legacy from './payworksLegacy.js';
import { getAuthToken, fetchData, logout } from './payworksBrowserLogin.js';

dotenv.config();

const PAYWORKSURL = 'https://payroll.payworks.ca';

// LEGACY when a customer number is configured; otherwise the new browser login.
const useLegacy = !!(process.env.PAYWORKS_CUSTOMER && process.env.PAYWORKS_CUSTOMER.trim());

// Cached auth token for the new browser login (authenticate once, reuse for all
// requests in the process — mirrors how the legacy module caches its cookie).
let cachedAuth;

export function isLegacyLogin() {
    return useLegacy;
}

// Ensure we are authenticated (new login only; legacy authenticates lazily on
// its own first request). Returns the cached auth token for the new login.
export async function authenticateWithPayworks() {
    if (useLegacy) return legacy.authenticateWithPayworks();
    if (!cachedAuth) {
        console.log('Authenticating with Payworks (browser/email login)...');
        cachedAuth = await getAuthToken();
    }
    return cachedAuth;
}

// Fetch Payworks data for an API/report path (e.g. '/pwnextv2api/v3.0/Employees').
// Returns parsed JSON (or text). The path is relative to payroll.payworks.ca.
export async function getPayworksData(path) {
    if (useLegacy) return legacy.getPayworksData(path);
    if (!cachedAuth) await authenticateWithPayworks();
    return fetchData(cachedAuth, `${PAYWORKSURL}${path}`);
}

// Release the server-side session. No-op for the legacy login (which has no
// explicit logout). Safe to call even if never authenticated.
export async function logoutPayworks() {
    if (useLegacy) return;
    if (cachedAuth) {
        await logout(cachedAuth);
        cachedAuth = undefined;
    }
}
