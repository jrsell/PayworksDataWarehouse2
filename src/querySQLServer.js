import sql from 'mssql';
import * as fs from 'fs';

// Read the configuration from the JSON file
const config = JSON.parse(fs.readFileSync('mssql.json'));
await sql.connect(config);

export async function fetchData(query) {
    // Query the database and get the records
    const result = await sql.query(query);
    return result.recordset;
}

