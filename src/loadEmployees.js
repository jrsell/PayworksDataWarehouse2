import sql from 'mssql';
import { pathToFileURL } from 'url';
import { getPayworksData } from './payworks.js';
import { bulkLoad, runLoader } from './loadUtils.js';

export async function loadEmployees() {
    await runLoader('Employees', async () => {
        // Simple, clean fetch of the employee list — no AI enrichment, no extra reports.
        const employeesPath = '/pwnextv2api/v3.0/Employees?includeTerminated=true&includeDeleted=true&fields=id,number,firstName,lastName,startDate,seniorityDate,isTerminated,status,payGroupId,departmentId';
        const employeesJSON = await getPayworksData(employeesPath);

        const rowCount = await bulkLoad('Employees', [
            { name: 'id',            mappedName: 'EmployeeID',    type: sql.Int, options: { nullable: false, primary: true } },
            { name: 'number',        mappedName: 'EmployeeNum',   type: sql.NVarChar(20) },
            { name: 'firstName',     mappedName: 'First Name',     type: sql.NVarChar(50) },
            { name: 'lastName',      mappedName: 'Last Name',      type: sql.NVarChar(50) },
            { name: 'isTerminated',  mappedName: 'Is Terminated',  type: sql.Bit          },
            { name: 'payGroupId',    mappedName: 'PayGroupID',   type: sql.Int          },
            { name: 'departmentId',  mappedName: 'DepartmentID', type: sql.Int          },
            { name: 'startDate',     mappedName: 'Start Date',     type: sql.Date         },
            { name: 'seniorityDate', mappedName: 'Seniority Date', type: sql.Date         },
            { name: 'status',        mappedName: 'Status',         type: sql.Int          },
        ], employeesJSON);

        await sql.query('delete from Employees where [Is Terminated] = 1');

        return rowCount;
    });
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    loadEmployees().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
