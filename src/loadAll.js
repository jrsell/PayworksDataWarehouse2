import { pathToFileURL } from 'url';
import { loadDepartments } from './loadDepartments.js';
import { loadEmployees } from './loadEmployees.js';
import { loadShifts } from './loadShifts.js';
import { loadTimeOffRequests } from './loadTimeOffRequests.js';
import { loadPayworksLabourHours } from './loadPayworksLabourHours.js';

export async function loadDatabaseSchema() {
    const startTime = new Date();
    console.log(`Loading database schema at ${startTime.toLocaleString()}`);

    await loadEmployees();
    await loadDepartments();
    await loadShifts();
    await loadTimeOffRequests();
    await loadPayworksLabourHours();

    const endTime = new Date();
    const durationSec = (endTime - startTime) / 1000;
    console.log(`Full refresh completed at ${endTime.toLocaleString()}. Duration: ${durationSec} seconds.`);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    loadDatabaseSchema().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
