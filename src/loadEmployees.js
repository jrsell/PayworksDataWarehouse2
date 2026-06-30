import sql from 'mssql';
import { pathToFileURL } from 'url';
import { getPayworksData } from './payworks.js';
import { bulkLoad, runLoader } from './loadUtils.js';

const SCHEMA = [
    // No need for the internal ID, since EmployeeNum is the only link into LabourHours
    { name: 'id',                    mappedName: 'EmployeeID',     type: sql.Int, options: { nullable: false, primary: true } },
    { name: 'number',                mappedName: 'EmployeeNum',    type: sql.NVarChar(20) },
    { name: 'firstName',             mappedName: 'First Name',     type: sql.NVarChar(50) },
    { name: 'lastName',              mappedName: 'Last Name',      type: sql.NVarChar(50) },
    { name: 'isTerminated',          mappedName: 'Is Terminated',  type: sql.Bit          },
    // Remove these to avoid confusion
    //{ name: 'payGroupId',           mappedName: 'PayGroupID',     type: sql.Int          },
    //{ name: 'departmentId',         mappedName: 'DepartmentID',   type: sql.Int          },
    { name: 'startDate',              mappedName: 'Start Date',     type: sql.Date         },
    { name: 'seniorityDate',          mappedName: 'Seniority Date', type: sql.Date         },
    { name: 'status',                 mappedName: 'Status',         type: sql.Int          },
    { name: 'employeeName',           mappedName: 'Employee Name', type: sql.NVarChar(50)  },
    { name: 'employeeNameLastFirst',  mappedName: 'Employee Name (Last, First)', type: sql.NVarChar(50), },

];

export async function loadEmployees() {
    await runLoader('Employees', async () => {
        // Simple, clean fetch of the employee list — no AI enrichment, no extra reports.
        const apiPath = '/pwnextv2api/v3.0/Employees?includeTerminated=true&includeDeleted=true&fields=id,number,firstName,lastName,startDate,seniorityDate,isTerminated,status,payGroupId,departmentId';
        const rows = await getPayworksData(apiPath);

        // Remove the 'N1' prefix from employee numbers, add employeeName field, employeeNameLastFirst
        const rows2 = rows.map(e => ({ ...e, number: e.number.replace(/^N1/, '') }));
        const rows3 = rows2.map(e => ({ ...e, employeeName: `${e.firstName} ${e.lastName}` }));
        const rows4 = rows3.map(e => ({ ...e, employeeNameLastFirst: `${e.lastName}, ${e.firstName}` }));

        // Bulk load the employees into the database
        const rowCount = await bulkLoad('Employees', SCHEMA, rows4);

        // await sql.query('delete from Employees where [Is Terminated] = 1');

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
