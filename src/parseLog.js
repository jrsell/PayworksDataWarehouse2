import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Directory containing the log files
const logsDir = path.join(__dirname, '../logs');

// Read all files in the logs directory
const logFiles = fs.readdirSync(logsDir).filter(file => file.startsWith('HBot-Service-log'));

let results = [];
logFiles.forEach(logFile => {
    const logFilePath = path.join(logsDir, logFile);
    const logData = fs.readFileSync(logFilePath, 'utf-8');

    const regex = /Received message on \w+ (\w+ \d+ \d+) (\d{2}:\d{2}:\d{2}) .*?: '(.*?)' from: (.*?)\naiResult: (.*?)\n```sql\n(.*?)```/gs;

    // Parse the text
    let match;
    while ((match = regex.exec(logData)) !== null) {
        results.push(
            {
                Date: match[1].trim(),
                Time: match[2].trim(),
                DateTime: new Date(match[1].trim() + ' ' + match[2].trim()),
                Email: match[4].trim(),
                Message: match[3].trim(),
                AIResult: match[5].trim(),
                SQLResult: match[6].trim()
            }
        );
    }
});

// Sort the results by date and time
results = results.sort((a, b) => a.DateTime - b.DateTime);

// Build CSV data
const csvData = ['Date,Time,Email,Message,SQLResult']; //,AIResult,SQLResult'];
for (const result of results) {
    const { Date, Time, Email, Message, SQLResult } = result;
    const MessageEscaped = `"${Message.replace(/"/g, '""')}"`;
    const SQLResultEscaped = `"${SQLResult.replace(/"/g, '""')}"`;
    csvData.push(`${Date},${Time},${Email},${MessageEscaped},${SQLResultEscaped}`); // ,${AIResult},${SQLResult}`);
}

// Write the CSV data to a file
const bom = '\uFEFF'; // UTF-8 BOM
const csvFilePath = path.join(logsDir, 'log_data.csv');
fs.writeFileSync(csvFilePath, csvData.join('\n'), 'utf-8');

console.log('CSV file created successfully:', csvFilePath);