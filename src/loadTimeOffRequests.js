import sql from 'mssql';
import { pathToFileURL } from 'url';
import { getPayworksData } from './payworks.js';
import { bulkLoad, runLoader } from './loadUtils.js';

export async function loadTimeOffRequests() {
    await runLoader('TimeOffRequests', async () => {
        const apiPath = '/pwnextv2api/tom/TimeOffRequestGroups?lowerBound=2023-01-01';
        const jsonTimeOffRequests = await getPayworksData(apiPath);
        const jsonTimeOffRequestsChildRows = [...new Set(jsonTimeOffRequests.flatMap((item) => item.childRows))];

        await bulkLoad('TimeOffRequests', [
            { name: 'torId', type: sql.Int },
            { name: 'startTime', type: sql.DateTimeOffset },
            { name: 'endTime', type: sql.DateTimeOffset },
            { name: 'timeOffTypeName', type: sql.NVarChar(50) },
            { name: 'status', type: sql.NVarChar(50) },
            { name: 'totalHours', type: sql.Float },
            { name: 'numberOfDays', type: sql.Float },
            { name: 'employeeId', type: sql.Int },
            { name: 'date', type: sql.Date },
        ], jsonTimeOffRequestsChildRows);

        await sql.query('update timeOffRequests set date = convert(date, startTime)');
        await sql.query(`
            ALTER TABLE timeOffRequests ALTER COLUMN startTime datetime;
            ALTER TABLE timeOffRequests ALTER COLUMN endTime datetime;
        `);
    });
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    loadTimeOffRequests().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}