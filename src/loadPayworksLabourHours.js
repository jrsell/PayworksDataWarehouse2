import sql from 'mssql';
import { pathToFileURL } from 'url';
import { getPayworksData } from './payworks.js';
import { bulkLoad, runLoader } from './loadUtils.js';

const SCHEMA = [
    { name: 'ee number',                mappedName: 'EmployeeNum',            type: sql.NVarChar(10)  },
    { name: 'ee name',                  mappedName: 'Employee Name',           type: sql.NVarChar(50)  },
    { name: 'department number',        mappedName: 'DepartmentNum',          type: sql.NVarChar(50),  transform: (v) => v?.match(/(\d{6})$/)?.[1] ?? v },
    { name: 'department name',          mappedName: 'Department Name',         type: sql.NVarChar(60)  },
    { name: 'type',                     mappedName: 'Pay Element Type',                    type: sql.NVarChar(1)   },
    { name: 'pay element description',  mappedName: 'Pay Element Description', type: sql.NVarChar(50)  },
    { name: 'amount',                   mappedName: 'Wages',                  type: sql.Money         },
    { name: 'hours',                    mappedName: 'Hours',                   type: sql.Float         },
    { name: 'gl account',               mappedName: 'GL Account',              type: sql.NVarChar(10)  },
    { name: 'year',                     mappedName: 'Payroll Year',            type: sql.Int           },
    { name: 'pay group',                mappedName: 'Pay Group',               type: sql.NVarChar(30)  },
    { name: 'run type',                 mappedName: 'Payroll Run Type',         type: sql.NVarChar(10)  },
    { name: 'pay period',               mappedName: 'Pay Period Number',          type: sql.Int           },
    { name: 'pay period ending date',   mappedName: 'Pay Period Ending',       type: sql.Date          },
];

export async function loadPayworksLabourHours() {
    await runLoader('PayworksLabourHours', async () => {
        // Pull a fresh, complete set of live data from Payworks 
        const apiPath = '/pwnext/ReportBuilder/GenerateReport/53';
        const report = await getPayworksData(apiPath);

        // Transform the report data into a format suitable for bulk loading into SQL Server
        const columnNames = report.reportData.ReportColumnDescriptions.map((col) => col.Name);
        const rows = report.reportData.Series.map((entry) =>
            Object.fromEntries(entry.Data.map((value, index) => [columnNames[index], value]))
        );
        const rows2 = rows.map(e => ({ ...e, 'ee number': e['ee number'].replace(/^N1/, '') }));

        const rowCount = await bulkLoad('_LabourHours', SCHEMA, rows2, { append: false });

        await sql.query(`


DROP TABLE IF EXISTS PayGroups;
SELECT 
    ROW_NUMBER() OVER (ORDER BY [Pay Group]) AS PayGroupID,
    [Pay Group]
Into PayGroups
FROM (
    SELECT DISTINCT [Pay Group]
    FROM _LabourHours
) AS DistinctGroups;

DROP TABLE IF EXISTS [PayElementTypes];
SELECT 
    ROW_NUMBER() OVER (ORDER BY [Pay Element Type], [Pay Element Description]) AS PayElementID,
    [Pay Element Type], [Pay Element Description], 
	CASE WHEN ([Pay Element Type] = 'W') THEN 'WCB'
	WHEN [Pay Element Description] LIKE 'CPP%' THEN 'CPP'
	ELSE [Pay Element Description] END as [Pay Element]

Into [PayElementTypes]
FROM (
    SELECT DISTINCT [Pay Element Type], [Pay Element Description]
    FROM _LabourHours
) AS DistinctElements;


DROP TABLE IF EXISTS LabourHours;
SELECT 
	lh.[Pay Period Ending],
	lh.[Pay Period Number],
	lh.[Payroll Run Type],
	lh.[Payroll Year],
	lh.DepartmentNum,
	lh.EmployeeNum,
	pg.PayGroupID,
	pe.PayElementID,
	lh.[Hours],
	lh.Wages
INTO LabourHours
FROM _LabourHours lh
INNER JOIN PayElementTypes pe on lh.[Pay Element Type] = pe.[Pay Element Type] and lh.[Pay Element Description] = pe.[Pay Element Description]
INNER JOIN PayGroups pg on lh.[Pay Group] = pg.[Pay Group]

DROP TABLE IF EXISTS _LabourHours;

        `);

        return rowCount;
    });


    
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    loadPayworksLabourHours().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
