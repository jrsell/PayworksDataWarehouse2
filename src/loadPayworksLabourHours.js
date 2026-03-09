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
    { name: 'ee number',                mappedName: 'employeeNum',             type: sql.NVarChar(10)  },  // maxLen: 4
    { name: 'ee name',                  mappedName: 'employeeName',            type: sql.NVarChar(50)  },  // maxLen: 27
    { name: 'department number',        mappedName: 'departmentNum',           type: sql.NVarChar(50),  transform: (v) => v?.match(/(\d{6})$/)?.[1] ?? v },  // maxLen: 35
    { name: 'department name',          mappedName: 'departmentName',          type: sql.NVarChar(60)  },  // maxLen: 50
    { name: 'type',                     mappedName: 'type',                    type: sql.NVarChar(1)   },  // maxLen: 1
    { name: 'pay element description',  mappedName: 'payElementDescription',   type: sql.NVarChar(50)  },  // maxLen: 30
    { name: 'amount',                   mappedName: 'amount',                  type: sql.Money         },
    { name: 'hours',                    mappedName: 'hours',                   type: sql.Float         },
    { name: 'gl account',               mappedName: 'glAccount',               type: sql.NVarChar(10)  },  // maxLen: 4
    { name: 'year',                     mappedName: 'payrollYear',             type: sql.Int           },
    { name: 'pay group',                mappedName: 'payGroup',                type: sql.NVarChar(30)  },  // maxLen: 20
    { name: 'run type',                 mappedName: 'payPeriodType',           type: sql.NVarChar(10)  },  // maxLen: 7
    { name: 'pay period',               mappedName: 'payPeriodNum',            type: sql.Int           },
    { name: 'pay period ending date',   mappedName: 'payPeriodEnding',         type: sql.Date          },
    { name: 'payment date',             mappedName: 'paymentDate',             type: sql.Date          },
    { name: 'Location',                 mappedName: 'location',                type: sql.NVarChar(100) },
    { name: 'Job Description',          mappedName: 'jobDescription',          type: sql.NVarChar(200) },
];

export async function loadPayworksLabourHours() {
    await runLoader('PayworksLabourHours', async () => {

        const deptMapping = await loadDepartmentMapping();

        // Load archive CSVs — first year drops/recreates the table, subsequent years append
        const ARCHIVE_YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
        for (const year of ARCHIVE_YEARS) {
            const rows = leftJoin(loadArchiveRows(`PayworksLabourHoursArchive${year}.csv`), deptMapping, 'department name', 'Department Name');
            await bulkLoad('PayworksLabourHours', SCHEMA, rows, { append: year !== ARCHIVE_YEARS[0] });
        }

        // Load 2: live API data — appends to the table created above
        const apiPath = '/pwnext/ReportBuilder/GenerateReport/53';
        const report = await getPayworksData(apiPath);

        const liveRows = report.reportData.Series.map((entry) => {
            const obj = {};
            entry.Data.forEach((value, index) => {
                obj[report.reportData.ReportColumnDescriptions[index].Name] = value;
            });
            return obj;
        }).filter((row) => row['year'] >= 2026);

        const joinedLiveRows = leftJoin(liveRows, deptMapping, 'department name', 'Department Name');
        await bulkLoad('PayworksLabourHours', SCHEMA, joinedLiveRows, { append: true });
    });
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    loadPayworksLabourHours().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
