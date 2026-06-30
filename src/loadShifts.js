import sql from 'mssql';
import { startOfWeek, addDays, format } from 'date-fns';
import { pathToFileURL } from 'url';
import { getPayworksData } from './payworks.js';
import { bulkLoad, runLoader } from './loadUtils.js';

export async function loadShifts() {
    await runLoader('Shifts', async () => {
        const startDateFmt = '2022-01-01';
        const startOfWeekDate = startOfWeek(new Date(), { weekStartsOn: 1 });
        const endDate = addDays(startOfWeekDate, 13);
        const endDateFmt = format(endDate, 'yyyy-MM-dd');
        const apiPath = `/pwnextv2api/v3.0/TimeManagement/EmployeeShifts?lowerBound=${startDateFmt}&upperBound=${endDateFmt}`;
        const jsonShifts = await getPayworksData(apiPath);

        const rowCount = await bulkLoad('Shifts', [
            { name: 'id', type: sql.Int, options: { nullable: false, primary: true } },
            { name: 'scheduleId', type: sql.Int },
            { name: 'employeeId', type: sql.Int },
            { name: 'startTime', type: sql.DateTimeOffset },
            { name: 'endTime', type: sql.DateTimeOffset },
            { name: 'deleted', type: sql.Bit },
            { name: 'positionId', type: sql.Int },
            { name: 'departmentId', type: sql.Int },
            { name: 'date', type: sql.Date },
        ], jsonShifts);

        await sql.query('delete from shifts where employeeId is null');
        await sql.query('update shifts set date = convert(date, startTime)');
        await sql.query(`
            ALTER TABLE shifts ALTER COLUMN startTime datetime;
            ALTER TABLE shifts ALTER COLUMN endTime datetime;
        `);

        return rowCount;
    });
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    loadShifts().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}