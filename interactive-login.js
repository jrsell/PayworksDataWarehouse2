// One-time setup: headed login to establish device trust for headless runs.
//
//   node interactive-login.js                 # headed; complete the SMS 2FA in the window
//   KEEP_SESSION=1 node interactive-login.js  # keep the session + save token (skip logoff)
//
// After you complete the 2FA once, the persistent profile (user-data/) remembers
// the device, so the nightly refresh (node src/loadAll.js) can authenticate
// headlessly with no 2FA. By default this logs off when done (device trust
// persists regardless). Only relevant to the NEW browser/email login — not used
// by the legacy customer-number login.

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import {
  attemptLogin,
  logOutStaleSession,
  AUTH_DIR,
  SESSION_PATH,
  LOGOFF_URL,
  USER_DATA,
} from './src/payworksBrowserLogin.js';

dotenv.config();

const STATE_PATH = path.join(AUTH_DIR, 'state.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const context = await chromium.launchPersistentContext(USER_DATA, {
    headless: false,
    viewport: null,
    args: ['--start-maximized'],
  });
  const page = context.pages()[0] || (await context.newPage());
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) console.log(`  -> ${f.url().split('?')[0]}`);
  });

  try {
    console.log('Opening login. Auto-filling credentials ...');
    console.log('\n========================================================');
    console.log(' If a 2FA code is requested, TYPE IT IN THE BROWSER WINDOW');
    console.log(' and enable "remember this device". Waiting up to 5 min ...');
    console.log('========================================================\n');

    // Long timeout so there is time to enter the SMS code by hand.
    let result = await attemptLogin(context, page, { log: console.log, timeoutMs: 5 * 60 * 1000 });
    let tries = 0;
    while (result === 'activeSession' && tries < 3) {
      tries++;
      console.log(`Active session already exists (attempt ${tries}) — logging it out and retrying.`);
      await logOutStaleSession(page, console.log);
      result = await attemptLogin(context, page, { log: console.log, timeoutMs: 5 * 60 * 1000 });
    }

    if (result !== 'ok') {
      console.error(`\nSetup did not complete (state: ${result}).`);
      console.error('If you ran out of time on the 2FA prompt, just run `node interactive-login.js` again.');
      process.exitCode = 2;
      return;
    }

    // Persist the storage state (device trust) for portability/debugging.
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    await context.storageState({ path: STATE_PATH });

    if (process.env.KEEP_SESSION === '1') {
      const cookie = (await context.cookies()).find(
        (c) => c.name === 'ASP.NET_SessionId' && c.domain.includes('payworks.ca')
      );
      fs.writeFileSync(
        SESSION_PATH,
        JSON.stringify(
          {
            token: cookie.value,
            cookieHeader: `ASP.NET_SessionId=${cookie.value}`,
            capturedAt: new Date().toISOString(),
          },
          null,
          2
        )
      );
      console.log('\nDevice trust saved. Session kept alive (KEEP_SESSION=1).');
      console.log('You can now run: node src/loadAll.js  (or use the token in .auth/session.json)');
    } else {
      await page.goto(LOGOFF_URL, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      if (fs.existsSync(SESSION_PATH)) fs.rmSync(SESSION_PATH);
      console.log('\nDevice trust established and saved. Logged off ->', page.url().split('?')[0]);
      console.log('2FA should not be needed again. Run headless jobs with: node src/loadAll.js');
    }
  } catch (err) {
    console.error('SETUP ERROR:', err.message);
    process.exitCode = 1;
  } finally {
    await sleep(500);
    await context.close();
  }
})();
