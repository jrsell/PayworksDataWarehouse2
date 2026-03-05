import sql from 'mssql';
import { pathToFileURL } from 'url';
import { getPayworksData } from './payworks.js';
import { bulkLoad, runLoader } from './loadUtils.js';

export async function loadDepartments() {
    await runLoader('Departments', async () => {
        const apiPath = '/pwnextv2api/api/Department?includeDeleted=true&includePublic=true';
        const jsonDepartments = await getPayworksData(apiPath);

        await bulkLoad('Departments', [
            { name: 'departmentId', type: sql.Int, options: { nullable: false, primary: true } },
            { name: 'departmentName', type: sql.NVarChar(100) },
            { name: 'storeName', type: sql.NVarChar(50) },
            { name: 'department', type: sql.NVarChar(100) },
            { name: 'deleted', type: sql.Bit },
        ], jsonDepartments);

        await sql.query(`
            update departments set
            storeName = trim(replace(substring( departmentName, 0 , charindex ('-', departmentName)), 'DELETED_', '' )),
            department = trim(replace(replace(substring( departmentName, charindex ('-', departmentName), 100), '-', ''), 'DELETED_',''))
        `);

        await sql.query(`
            update departments set
            storeName = CASE
                WHEN storeName = 'HO' THEN 'Head Office'
                WHEN storeName = 'Carboro Bay' THEN 'Cadboro Bay'
                WHEN storeName = 'St Anthonys' THEN 'St. Anthonys'
                WHEN storeName = 'St. Anthony s' THEN 'St. Anthonys'
                ELSE storeName
                END
        `);
    });
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    loadDepartments().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}