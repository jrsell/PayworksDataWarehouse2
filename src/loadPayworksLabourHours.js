import sql from 'mssql';
import { pathToFileURL } from 'url';
import { getPayworksData } from './payworks.js';
import { bulkLoad, runLoader } from './loadUtils.js';

const SCHEMA = [
    { name: 'ee number',                mappedName: 'EmployeeNum',            type: sql.NVarChar(10)  },
    { name: 'ee name',                  mappedName: 'Employee Name',           type: sql.NVarChar(50)  },
    { name: 'department number',        mappedName: 'DepartmentNum',          type: sql.NVarChar(50),  transform: (v) => v?.match(/(\d{6})$/)?.[1] ?? v },
    { name: 'department name',          mappedName: 'Department Name',         type: sql.NVarChar(60)  },
    { name: 'type',                     mappedName: 'Type',                    type: sql.NVarChar(1)   },
    { name: 'pay element description',  mappedName: 'Pay Element Description', type: sql.NVarChar(50)  },
    { name: 'amount',                   mappedName: 'Amount',                  type: sql.Money         },
    { name: 'hours',                    mappedName: 'Hours',                   type: sql.Float         },
    { name: 'gl account',               mappedName: 'GL Account',              type: sql.NVarChar(10)  },
    { name: 'year',                     mappedName: 'Payroll Year',            type: sql.Int           },
    { name: 'pay group',                mappedName: 'Pay Group',               type: sql.NVarChar(30)  },
    { name: 'run type',                 mappedName: 'Pay Period Type',         type: sql.NVarChar(10)  },
    { name: 'pay period',               mappedName: 'Pay Period Num',          type: sql.Int           },
    { name: 'pay period ending date',   mappedName: 'Pay Period Ending',       type: sql.Date          },
    { name: 'payment date',             mappedName: 'Payment Date',            type: sql.Date          },
];

export async function loadPayworksLabourHours() {
    await runLoader('PayworksLabourHours', async () => {
        // Pull a fresh, complete set of live data from Payworks each run and fully
        // rebuild the table — no archive CSVs, no department mapping, no filtering.
        const report = await getPayworksData('/pwnext/ReportBuilder/GenerateReport/53');

        const columnNames = report.reportData.ReportColumnDescriptions.map((col) => col.Name);
        const rows = report.reportData.Series.map((entry) =>
            Object.fromEntries(entry.Data.map((value, index) => [columnNames[index], value]))
        );

        return await bulkLoad('PayworksLabourHours', SCHEMA, rows, { append: false });
    });
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    loadPayworksLabourHours().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
