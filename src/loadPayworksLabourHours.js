import sql from 'mssql';
import * as fs from 'fs';
import { parse } from 'csv-parse/sync';
import { pathToFileURL } from 'url';
import { getPayworksData } from './payworks.js';
import { bulkLoad, runLoader, leftJoin } from './loadUtils.js';

const ARCHIVE_DIR = new URL('../data/', import.meta.url);

function loadArchiveRows(filename) {
    const content = fs.readFileSync(new URL(filename, ARCHIVE_DIR), 'utf-8');
    return parse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true,
        cast: (value) => value === '' ? null : value,
    });
}

const DEPT_MAPPING_URL = 'https://docs.google.com/spreadsheets/d/1gZn3XVwzJn8mG2BbnWSsptjNqEZ3etcDO1AblFMt-HI/export?format=csv&gid=1938277707';

async function loadDepartmentMapping() {
    const response = await fetch(DEPT_MAPPING_URL);
    const text = await response.text();
    return parse(text, { columns: true, skip_empty_lines: true, trim: true, bom: true,
        cast: (value) => value === '' ? null : value,
    });
}

const SCHEMA = [
    { name: 'payworkscompany',          mappedName: 'PayworksCompany',         type: sql.NVarChar(30)  },  // maxLen: 30
    { name: 'ee number',                mappedName: 'Employee Num',             type: sql.NVarChar(10)  },  // maxLen: 4
    { name: 'ee name',                  mappedName: 'Employee Name',            type: sql.NVarChar(50)  },  // maxLen: 27
    { name: 'department number',        mappedName: 'Department Num',           type: sql.NVarChar(50),  transform: (v) => v?.match(/(\d{6})$/)?.[1] ?? v },  // maxLen: 35
    { name: 'department name',          mappedName: 'Department Name',          type: sql.NVarChar(60)  },  // maxLen: 50
    { name: 'type',                     mappedName: 'Type',                    type: sql.NVarChar(1)   },  // maxLen: 1
    { name: 'pay element description',  mappedName: 'Pay Element Description',   type: sql.NVarChar(50)  },  // maxLen: 30
    { name: 'amount',                   mappedName: 'Amount',                  type: sql.Money         },
    { name: 'hours',                    mappedName: 'Hours',                   type: sql.Float         },
    { name: 'gl account',               mappedName: 'GL Account',               type: sql.NVarChar(10)  },  // maxLen: 4
    { name: 'year',                     mappedName: 'Payroll Year',             type: sql.Int           },
    { name: 'pay group',                mappedName: 'Pay Group',                type: sql.NVarChar(30)  },  // maxLen: 20
    { name: 'run type',                 mappedName: 'Pay Period Type',           type: sql.NVarChar(10)  },  // maxLen: 7
    { name: 'pay period',               mappedName: 'Pay Period Num',            type: sql.Int           },
    { name: 'pay period ending date',   mappedName: 'Pay Period Ending',         type: sql.Date          },
    { name: 'payment date',             mappedName: 'Payment Date',             type: sql.Date          },
    { name: 'Location',                 mappedName: 'Location',                type: sql.NVarChar(100) },
    { name: 'Job Description',          mappedName: 'Job Description',          type: sql.NVarChar(200) },
];

export async function loadPayworksLabourHours() {
    await runLoader('PayworksLabourHours', async () => {

        const deptMapping = await loadDepartmentMapping();

        // Join rows to the department mapping and backfill Location / Job Description.
        const withDeptMapping = (rows) =>
            leftJoin(rows, deptMapping, ['payworkscompany', 'department name'], ['PayworksCompany', 'Department Name'])
                .map((row) => ({
                    ...row,
                    'Location':        row['Location']        ?? row['payworkscompany'],
                    'Job Description': row['Job Description'] ?? row['department name'],
                }));

        // ── Phase 1: gather every dataset BEFORE touching the database. A missing
        //    or unreadable archive file, or a failed API call, throws here — before
        //    any DROP — so the existing table is never left half-rebuilt. ──
        const datasets = [];

        // Archive CSVs. Each missing file is skipped (with a warning) rather than
        // fatal, so deleting some or all archives still lets the refresh run.
        const ARCHIVE_YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
        for (const year of ARCHIVE_YEARS) {
            const filename = `PayworksLabourHoursArchive${year}.csv`;
            if (!fs.existsSync(new URL(filename, ARCHIVE_DIR))) {
                console.warn(`Archive file ${filename} not found — skipping.`);
                continue;
            }
            const rows = withDeptMapping(loadArchiveRows(filename));
            if (rows.length) datasets.push(rows);
        }

        // Live API data (2026 onward).
        const report = await getPayworksData('/pwnext/ReportBuilder/GenerateReport/53');
        const liveRows = withDeptMapping(
            report.reportData.Series.map((entry) => {
                const obj = { payworkscompany: 'Cadboro Bay' };
                entry.Data.forEach((value, index) => {
                    obj[report.reportData.ReportColumnDescriptions[index].Name] = value;
                });
                return obj;
            }).filter((row) => row['year'] >= 2026)
        );
        if (liveRows.length) datasets.push(liveRows);

        // ── Phase 2: rebuild the table. The first dataset drops/recreates it; the
        //    rest append. With no archives present, the live data becomes the first
        //    (table-creating) load, so the refresh still works end to end. ──
        if (datasets.length === 0) {
            throw new Error('No archive rows and no live data to load — leaving the existing PayworksLabourHours table unchanged.');
        }
        for (let i = 0; i < datasets.length; i++) {
            await bulkLoad('PayworksLabourHours', SCHEMA, datasets[i], { append: i !== 0 });
        }
    });
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    loadPayworksLabourHours().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
