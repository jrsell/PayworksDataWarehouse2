import dotenv from 'dotenv';

dotenv.config();

function getBooleanEnv(value, defaultValue) {
    if (value === undefined) {
        return defaultValue;
    }

    return value.toLowerCase() === 'true';
}

function getNumberEnv(value, defaultValue) {
    if (value === undefined || value === '') {
        return defaultValue;
    }

    const parsedValue = Number(value);
    return Number.isNaN(parsedValue) ? defaultValue : parsedValue;
}

const requiredVars = ['MSSQL_USER', 'MSSQL_PASSWORD', 'MSSQL_SERVER', 'MSSQL_DATABASE'];
const missingVars = requiredVars.filter((name) => !process.env[name]);

if (missingVars.length > 0) {
    throw new Error(`Missing required MSSQL environment variables: ${missingVars.join(', ')}`);
}

const rawServer = process.env.MSSQL_SERVER;
const [serverHost, instanceName] = rawServer.split('\\');
const port = getNumberEnv(process.env.MSSQL_PORT, undefined);

export const mssqlConfig = {
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    server: serverHost,
    database: process.env.MSSQL_DATABASE,
    options: {
        trustServerCertificate: getBooleanEnv(process.env.MSSQL_TRUST_SERVER_CERTIFICATE, true),
        // Prefer a fixed port when MSSQL_PORT is set — connects straight to the
        // instance and avoids the SQL Server Browser service entirely. Fall back
        // to resolving the named instance (requires SQL Browser running).
        ...(port ? { port } : (instanceName ? { instanceName } : {})),
    },
    requestTimeout: getNumberEnv(process.env.MSSQL_REQUEST_TIMEOUT, 20000),
};