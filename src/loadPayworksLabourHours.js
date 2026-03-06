import sql from 'mssql';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import { getPayworksData } from './payworks.js';
import { bulkLoad, runLoader } from './loadUtils.js';

export async function loadPayworksLabourHours() {
    await runLoader('PayworksLabourHours', async () => {
        const apiPath = '/pwnext/ReportBuilder/GenerateReport/53';
        const report = await getPayworksData(apiPath);

        const rows = report.reportData.Series.map((entry) => {
            const obj = {};
            entry.Data.forEach((value, index) => {
                obj[report.reportData.ReportColumnDescriptions[index].Name] = value;
            });
            return obj;
        });

        await bulkLoad('PayworksLabourHours', [
            { name: 'ee number',                mappedName: 'employeeNum',             type: sql.NVarChar(10)  },  // maxLen: 4
            { name: 'ee name',                  mappedName: 'employeeName',            type: sql.NVarChar(50)  },  // maxLen: 27
            { name: 'department number',        mappedName: 'departmentNum',           type: sql.NVarChar(50)  },  // maxLen: 35
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
        ], rows);
    });
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    loadPayworksLabourHours().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
