import sql from 'mssql';
import { mssqlConfig } from './mssqlConfig.js';

export async function connectToDatabase() {
    await sql.connect(mssqlConfig);
}

export function disconnectFromDatabase() {
    sql.close();
}

export async function bulkLoad(tableName, jsonSchema, jsonData, { append = false } = {}) {
    console.log(`Loading table: ${tableName}`);

    if (!append) {
        await sql.query(`IF OBJECT_ID('${tableName}', 'U') IS NOT NULL DROP TABLE ${tableName}`);
    }

    const table = new sql.Table(tableName);
    table.create = !append;

    for (const column of jsonSchema) {
        table.columns.add(column.mappedName || column.name, column.type, column.options);
    }

    for (const row of jsonData) {
        table.rows.add(...jsonSchema.map((column) => {
            const value = row[column.name];
            return column.transform ? column.transform(value) : value;
        }));
    }

    const request = new sql.Request();
    await request.bulk(table);
}

export function leftJoin(arr1, arr2, key1, key2) {
    return arr1.map((item1) => {
        const matchingItem = arr2.find((item2) => item1[key1] === item2[key2]);
        return matchingItem ? { ...item1, ...matchingItem } : { ...item1 };
    });
}

export async function runLoader(loaderName, loadFn) {
    const startTime = new Date();
    console.log(`Loading ${loaderName} at ${startTime.toLocaleString()}`);

    try {
        await connectToDatabase();
        await loadFn();
    } finally {
        disconnectFromDatabase();
    }

    const endTime = new Date();
    const durationSec = (endTime - startTime) / 1000;
    console.log(`Done ${loaderName} at ${endTime.toLocaleString()}. Duration: ${durationSec} seconds.\n`);
}