import sql from 'mssql';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { mssqlConfig } from './mssqlConfig.js';

// ── Logger ───────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE = path.join(__dirname, '..', 'logs', 'Refresh-Log.txt');

fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
fs.writeFileSync(LOG_FILE, `Refresh started at ${new Date().toLocaleString()}\n`);

export async function log(message, sqlParams = null) {
    console.log(message);
    fs.appendFileSync(LOG_FILE, message + '\n'); 

    if (sqlParams) {
        try {
            await insertRefreshLog({ message, ...sqlParams });
        } catch (logErr) {
            const warning = `Warning: could not write to RefreshLog: ${logErr.message}`;
            console.log(warning);
            fs.appendFileSync(LOG_FILE, warning + '\n');
        }
    }
}

// ── SQL Server helpers ───────────────────────────────────────────────────────

export async function connectToDatabase() {
    await sql.connect(mssqlConfig);
}

export function disconnectFromDatabase() {
    sql.close();
}


async function insertRefreshLog({ date, startTime, endTime, message, isError, totalSeconds }) {
    await sql.query(`
        IF OBJECT_ID('RefreshLog', 'U') IS NULL
        CREATE TABLE RefreshLog (
            LogID        INT IDENTITY(1,1) PRIMARY KEY,
            Date         DATE,
            StartTime    DATETIME2,
            EndTime      DATETIME2,
            Message      NVARCHAR(500),
            Error        INT,
            TotalSeconds FLOAT
        )
    `);

    const request = new sql.Request();
    request.input('date',         sql.Date,      date);
    request.input('startTime',    sql.DateTime2, startTime);
    request.input('endTime',      sql.DateTime2, endTime);
    request.input('message',      sql.NVarChar(500), message);
    request.input('error',        sql.Int,           isError ?? null);
    request.input('totalSeconds', sql.Float,         totalSeconds);
    await request.query(`
        INSERT INTO RefreshLog (Date, StartTime, EndTime, Message, Error, TotalSeconds)
        VALUES (@date, @startTime, @endTime, @message, @error, @totalSeconds)
    `);
}

// ── Bulk load ────────────────────────────────────────────────────────────────

export async function bulkLoad(tableName, jsonSchema, jsonData, { append = false } = {}) {

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

// ── Left join ────────────────────────────────────────────────────────────────

export function leftJoin(arr1, arr2, key1, key2) {
    return arr1.map((item1) => {
        const matchingItem = arr2.find((item2) => item1[key1] === item2[key2]);
        return matchingItem ? { ...item1, ...matchingItem } : { ...item1 };
    });
}

// ── Run loader ───────────────────────────────────────────────────────────────

export async function runLoader(loaderName, loadFn) {
    const now = new Date();
    const startTime = new Date(now - now.getTimezoneOffset() * 60000);
    log(`Loading ${loaderName} at ${startTime.toISOString().slice(0, 19).replace('T', ' ')}`);

    let caughtError = null;
    try {
        await connectToDatabase();
        await loadFn();
    } catch (err) {
        caughtError = err;
    } finally {
        const now = new Date();
        const endTime = new Date(now - now.getTimezoneOffset() * 60000);
        const totalSeconds = (endTime - startTime) / 1000;

        const message = caughtError
            ? `Error in ${loaderName}: ${caughtError.message}`
            : `Loaded ${loaderName} at ${endTime.toISOString().slice(0, 19).replace('T', ' ')}. Duration: ${totalSeconds} seconds.\n`;

        await log(message, {
            date:         startTime,
            startTime,
            endTime,
            isError:      caughtError ? 1 : null,
            totalSeconds,
        });

        disconnectFromDatabase();
    }

    if (caughtError) throw caughtError;
}