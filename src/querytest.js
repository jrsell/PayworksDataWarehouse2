import sql from 'mssql';
import { mssqlConfig } from './mssqlConfig.js';

// Connect to the database
export async function connectToDatabase() {
    await sql.connect(mssqlConfig);
}

export function disconnectFromDatabase() {
    sql.close();
}

async function fetchData() {
    // Connect to the database
    await connectToDatabase();

    // Query the database and get the records
    const result = await sql.query`SELECT top 10 * FROM Departments`;

    // Process the result
    console.log(result.recordset);

    disconnectFromDatabase();

}

// Call the fetchData function
fetchData();
