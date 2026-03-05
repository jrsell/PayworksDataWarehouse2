import sql from 'mssql';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import { getPayworksData } from './payworks.js';
import { getAICompletion } from './openAi.js';
import { bulkLoad, leftJoin, runLoader } from './loadUtils.js';

const promptToGenderizeNames = fs.readFileSync('research/promptToGenderizeNames.txt', 'utf8');

export async function loadEmployees() {
    await runLoader('Employees', async () => {
        const employeesPath = '/pwnextv2api/v3.0/Employees?includeTerminated=true&includeDeleted=true&fields=id,number,firstName,lastName,startDate,seniorityDate,isTerminated,status,payGroupId,departmentId';
        const employeesJSON = await getPayworksData(employeesPath);

        console.log('Using AI to determine employee Genders...');
        const firstNames = Array.from(new Set(employeesJSON.filter((obj) => !obj.isTerminated).map((obj) => obj.firstName)));
        const aiGenders = await getAICompletion(promptToGenderizeNames, firstNames.join('\n'));
        const aiGendersArray = JSON.parse(aiGenders.replace('```json', '').replace('```', ''));
        const employeesWithGenderJSON = leftJoin(employeesJSON, aiGendersArray, 'firstName', 'fn');

        const reportPath = '/pwnext/ReportBuilder/GenerateReport/128';
        const employeesJSON2 = await getPayworksData(reportPath);
        const employeesJSON2Cleaned = employeesJSON2.reportData.Series.map((entry) => {
            const obj = {};
            entry.Data.forEach((value, index) => {
                obj[employeesJSON2.reportData.ReportColumnDescriptions[index].Name] = value;
            });
            return obj;
        });

        const employeesJSONJoined = leftJoin(employeesWithGenderJSON, employeesJSON2Cleaned, 'number', 'Employee Number');

        await bulkLoad('Employees', [
            { name: 'id', type: sql.Int, options: { nullable: false, primary: true } },
            { name: 'firstName', type: sql.NVarChar(50) },
            { name: 'lastName', type: sql.NVarChar(50) },
            { name: 'isTerminated', type: sql.Bit },
            { name: 'payGroupId', type: sql.Int },
            { name: 'departmentId', type: sql.Int },
            { name: 'startDate', type: sql.Date },
            { name: 'seniorityDate', type: sql.Date },
            { name: 'status', type: sql.Int },
            { name: 'gender', type: sql.NVarChar(10) },
            { name: 'Employee Number', mappedName: 'employeeNumber', type: sql.Int },
            { name: 'Birth Date', mappedName: 'birthDate', type: sql.Date },
            { name: 'Address', mappedName: 'street', type: sql.NVarChar(100) },
            { name: 'City', mappedName: 'city', type: sql.NVarChar(40) },
            { name: 'Postal Code', mappedName: 'postalCode', type: sql.NVarChar(20) },
            { name: 'Cell Area Code', mappedName: 'cellPhoneAreaCode', type: sql.Int },
            { name: 'Cell Phone Number', mappedName: 'cellPhoneNumber', type: sql.Int },
            { name: 'Area Code', mappedName: 'homePhoneAreaCode', type: sql.Int },
            { name: 'Phone Number', mappedName: 'homePhoneNumber', type: sql.Int },
            { name: 'Email', mappedName: 'email', type: sql.NVarChar(100) },
            { name: 'Emergency Contact Name', mappedName: 'emergencyContactName', type: sql.NVarChar(100) },
            { name: 'Emergency Contact Phone', mappedName: 'emergencyContactPhone', type: sql.NVarChar(100) },
            { name: 'Emergency Relationship', mappedName: 'emergencyContactRelationship', type: sql.NVarChar(100) },
        ], employeesJSONJoined);

        await sql.query('delete from employees where isTerminated = 1');
    });
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    loadEmployees().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}