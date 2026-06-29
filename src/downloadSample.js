// Sample download — no SQL.
//
//   node src/downloadSample.js
//
// Authenticates with Payworks (whichever login is configured in .env) and
// downloads Report 53 to data/report-53-sample.json. Does NOT touch SQL Server.
// Handy for verifying that login + data download work end to end.

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getPayworksData, logoutPayworks } from './payworks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'data', 'report-53-sample.json');

const REPORT_53_PATH = '/pwnext/ReportBuilder/GenerateReport/53';

(async () => {
    try {
        console.log('Authenticating and downloading Report 53 (sample; no SQL import)...');
        const data = await getPayworksData(REPORT_53_PATH);

        fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
        const body = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        fs.writeFileSync(OUT_FILE, body);

        const rows = data?.reportData?.Series?.length;
        const rowNote = rows != null ? ` (${rows} rows)` : '';
        console.log(`Saved ${body.length} bytes -> ${path.relative(ROOT, OUT_FILE)}${rowNote}`);
    } catch (err) {
        console.error('Sample download failed:', err.message);
        process.exitCode = 1;
    } finally {
        await logoutPayworks().catch(() => {});
    }
})();
