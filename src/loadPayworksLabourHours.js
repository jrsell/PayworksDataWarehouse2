import sql from 'mssql';
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
            { name: 'Employee Num',             mappedName: 'employeeNum',             type: sql.NVarChar(20)  },
            { name: 'Employee Name',            mappedName: 'employeeName',            type: sql.NVarChar(100) },
            { name: 'Department Num',           mappedName: 'departmentNum',           type: sql.NVarChar(20)  },
            { name: 'Department Name',          mappedName: 'departmentName',          type: sql.NVarChar(100) },
            { name: 'Type',                     mappedName: 'type',                    type: sql.NVarChar(50)  },
            { name: 'Pay Element Description',  mappedName: 'payElementDescription',   type: sql.NVarChar(150) },
            { name: 'Amount',                   mappedName: 'amount',                  type: sql.Money         },
            { name: 'Hours',                    mappedName: 'hours',                   type: sql.Float         },
            { name: 'GL Account',               mappedName: 'glAccount',               type: sql.NVarChar(50)  },
            { name: 'Payroll Year',             mappedName: 'payrollYear',             type: sql.NVarChar(10)  },
            { name: 'Pay Group',                mappedName: 'payGroup',                type: sql.NVarChar(50)  },
            { name: 'Pay Period Type',          mappedName: 'payPeriodType',           type: sql.NVarChar(50)  },
            { name: 'Pay Period Num',           mappedName: 'payPeriodNum',            type: sql.Int           },
            { name: 'Pay Period Ending',        mappedName: 'payPeriodEnding',         type: sql.Date          },
            { name: 'Payment Date',             mappedName: 'paymentDate',             type: sql.Date          },
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
