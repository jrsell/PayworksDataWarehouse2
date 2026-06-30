# PayworksDataWarehouse2

Logs in to Payworks, downloads payroll/HR data, and loads it into a SQL Server
database. Each run rebuilds the tables (Employees, Departments, Labour hours, …).

## First-time setup

1. **Install** dependencies and the browser used for login:
   ```
   npm install
   npx playwright install chromium
   ```
2. **Create `.env`** — copy `.env.example` to `.env` and fill it in (see below).
3. **Log in once** — run `InteractiveLogin.bat`. A browser opens: sign in, enter
   the SMS code, and tick "remember this device". After that, every later run
   logs in automatically (no code needed) for about a year.

## .env settings

**Payworks login** (the normal email login):

| Variable | What to put |
|----------|-------------|
| `PAYWORKS_EMAIL` | Your Payworks login email |
| `PAYWORKS_PASSWORD` | Your Payworks password |

**SQL Server** (where the data is written):

| Variable | What to put | Example |
|----------|-------------|---------|
| `MSSQL_SERVER` | Server\instance | `NICEASUS\SQLEXPRESS` |
| `MSSQL_PORT` | TCP port to connect on | `1433` |
| `MSSQL_DATABASE` | Database name | `PayworksDataWarehouse` |
| `MSSQL_USER` | SQL login name | `PayworksWarehouseWriter` |
| `MSSQL_PASSWORD` | That login's password | |
| `MSSQL_TRUST_SERVER_CERTIFICATE` | Leave `true` for local SQL | `true` |
| `MSSQL_REQUEST_TIMEOUT` | Query timeout, in ms | `20000` |

> Leave `PAYWORKS_CUSTOMER` blank. Setting it switches to the old customer-number
> login instead of the email login — not normally used.

## Running it

Double-click any of these (or run from a terminal in the project folder):

| File | What it does |
|------|--------------|
| `InteractiveLogin.bat` | One-time browser login + SMS code. Run it during setup, or any time logins start failing. |
| `DownloadSample.bat` | Logs in and saves a sample report to `data\report-53-sample.json`. **Touches no database** — a quick check that login + download work. |
| `RefreshEmployees.bat` | Refreshes just the Employees table. |
| `RefreshAll.bat` | Refreshes everything. |

Progress and errors are written to the console, to `logs\Refresh-Log.txt`, and to
the `RefreshLog` table in the database (with row counts per table).

## If logins start failing

Payworks occasionally forgets the device (you'll see a 2FA or "login failed"
error). Just run `InteractiveLogin.bat` again to sign in and re-remember the
device, then re-run your refresh.
