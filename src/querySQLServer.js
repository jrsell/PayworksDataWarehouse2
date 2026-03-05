import sql from 'mssql';
import { mssqlConfig } from './mssqlConfig.js';

await sql.connect(mssqlConfig);

export async function fetchData(query) {
    // Query the database and get the records
    const result = await sql.query(query);
    return result.recordset;
}

