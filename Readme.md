## PayworksDataWarehouse2

Pulls tables and reports from Payworks and loads them into a SQL Server data
warehouse (Employees, Departments, Shifts, Time-off requests, Labour hours).

This is the successor to PayworksDataWarehouse. The data-download and SQL
ingestion code is unchanged; the **login mechanism** has been upgraded to the
new email-based Payworks login, with the original login kept as a fallback.

### Login: two mechanisms

`src/payworks.js` exposes `getPayworksData(path)` to every loader and picks the
login automatically based on `.env`:

| `.env`                        | Mechanism | Credentials |
|-------------------------------|-----------|-------------|
| `PAYWORKS_CUSTOMER` **set**   | **Legacy** — customer number + basic auth via the external authenticator service (`src/payworksLegacy.js`). | `PAYWORKS_USER_NAME`, `PAYWORKS_PASSWORD` |
| `PAYWORKS_CUSTOMER` **blank** | **New** — Playwright headless OIDC/SSO email login (`src/payworksBrowserLogin.js`). | `PAYWORKS_EMAIL`, `PAYWORKS_PASSWORD` |

To fall back to the legacy login, just set `PAYWORKS_CUSTOMER` in `.env`.

### How the new login works

The new login is an OIDC/SSO flow, not a simple form POST, and uses a one-time
SMS 2FA. We drive a real browser with **Playwright** using a **persistent
profile** (`user-data/`). The first login requires you to type the SMS code; the
profile then remembers the device (~1-year cookie) so later logins run headless
with no 2FA. After login we reuse the `ASP.NET_SessionId` cookie for plain
`axios` data requests.

### Setup

```bash
npm install
npx playwright install chromium      # only needed for the new login
cp .env.example .env                 # then fill in credentials + MSSQL_*
```

**One-time (new login only):** establish device trust in a visible browser —
complete the SMS 2FA in the window and enable "remember this device":

```bash
npm run login        # = node interactive-login.js
```

### Running the refresh

```bash
npm run refresh      # = node src\loadAll.js
```

or the existing batch file (used by Task Scheduler):

```bat
RefreshAll.bat
```

Node handles all logging (console + `logs\Refresh-Log.txt` + the SQL `RefreshLog`
table). Individual loaders can also be run directly, e.g. `node src\loadEmployees.js`.

### Notes

- If Payworks expires the remembered device, the headless login throws
  `TwoFactorRequiredError` and the refresh fails. Re-run `npm run login` (headed)
  to re-establish trust.
- Only one live Payworks session is allowed per user; the new login auto-recovers
  from a stale "active session" and the refresh logs out when it finishes.
- Secrets and live session state are git-ignored: never commit `.env`, `.auth/`,
  or `user-data/`.
