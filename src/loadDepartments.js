import sql from 'mssql';
import { pathToFileURL } from 'url';
import { getPayworksData } from './payworks.js';
import { bulkLoad, runLoader } from './loadUtils.js';

export async function loadDepartments() {
    await runLoader('Departments', async () => {
        const apiPath = '/pwnextv2api/api/Department?includeDeleted=true&includePublic=true';
        const jsonDepartments = await getPayworksData(apiPath);

        return await bulkLoad('Departments', [
            { name: 'departmentId',     mappedName: 'DepartmentID', type: sql.Int, options: { nullable: false, primary: true } },
            { name: 'departmentNumber', mappedName: 'DepartmentNum', type: sql.NVarChar(50) },
            { name: 'departmentName',   mappedName: 'Department Name', type: sql.NVarChar(100) },
            { name: 'storeName',        mappedName: 'Store Name', type: sql.NVarChar(50) },
            { name: 'department',       mappedName: 'Department', type: sql.NVarChar(100) },
            { name: 'deleted',          mappedName: 'Deleted', type: sql.Bit },
        ], jsonDepartments);



    });
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    loadDepartments().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}