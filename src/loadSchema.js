import sql from 'mssql';
import * as fs from 'fs';
import { authenticateWithPayworks, getPayworksData } from './payworks.js';
import { startOfWeek, addDays, format } from 'date-fns';
import { getAICompletion } from './openAi.js';

// Read the database configuration from the JSON file
const config = JSON.parse(fs.readFileSync('mssql-admin.json'));

// Read the database configuration from the JSON file
const promptToGenderizeNames = fs.readFileSync('research/promptToGenderizeNames.txt', 'utf8');


// Connect to the database
export async function connectToDatabase() {
    await sql.connect(config);
}

export function disconnectFromDatabase() {
    sql.close();
}

async function bulkLoad(tableName, jsonSchema, jsonData) {

    console.log(`Loading table: ${tableName}`);

    // Drop if exists
    await sql.query(`IF OBJECT_ID('${tableName}', 'U') IS NOT NULL DROP TABLE ${tableName}`);

    // Create table
    const table = new sql.Table(tableName) // or temporary table, e.g. #temptable
    table.create = true;

    // Add columns
    for (const column of jsonSchema) {
        table.columns.add(column.mappedName || column.name, column.type, column.options);
    }

    // Add rows. Only add cells that exist in the schema
    for (const row of jsonData) {
        table.rows.add(...jsonSchema.map((column) => row[column.name]));
    }

    // Bulk load
    const request = new sql.Request();
    await request.bulk(table);

}

async function updateRow(tableName, idColumnName, columnsToUpdate) {

    // Build set Cluase
    const setClause = columnsToUpdate.filter(column => column.name != idColumnName)
        .map(column => `${column.name} = @${column.name}`)
        .join(', ');

    // Build update query
    const updateQuery = `update ${tableName} set ${setClause} where ${idColumnName}=@${idColumnName}`;

    // Define parameters
    const request = new sql.Request();
    for (const column of columnsToUpdate) {
        request.input(column.name, column.type, column.value);
    }

    // Execute the SQL update
    await request.query(updateQuery);
}

// Perform the left join of two arrays
function leftJoin(arr1, arr2, key1, key2) {
    return arr1.map(item1 => {
        const matchingItem = arr2.find(item2 => item1[key1] === item2[key2]);
        if (matchingItem) {
            return { ...item1, ...matchingItem };
        } else {
            return { ...item1 };
        }
    });
}

export async function loadDatabaseSchema() {

    const startTime = new Date(); // Record the start time
    console.log(`Loading database schema at ${startTime.toLocaleString()}`)

    // Authenticate with Payworks
    console.log('Authenticating with Payworks...');
    await authenticateWithPayworks(process.env.PAYWORKS_CUSTOMER);

    // Connect to the database
    await connectToDatabase();
    var apiPath = '';

    // Employees
    //const employeesJSON = JSON.parse(fs.readFileSync('research/json/Employees.json'));
    apiPath = '/pwnextv2api/v3.0/Employees?includeTerminated=true&includeDeleted=true&fields=id,number,firstName,lastName,startDate,seniorityDate,isTerminated,status,payGroupId,departmentId';
    const employeesJSON = await getPayworksData(apiPath);

    // Get Genders for names (use AI)
    console.log('Using AI to determine employee Genders...');
    const firstNames = Array.from(new Set(employeesJSON.filter(obj => !obj.isTerminated).map(obj => obj.firstName)));
    const aiGenders = await getAICompletion(promptToGenderizeNames, firstNames.join('\n'));
    const aiGendersArray = JSON.parse(aiGenders.replace('```json', '').replace('```', ''));
    const employeesWithGenderJSON = leftJoin(employeesJSON, aiGendersArray, 'firstName', 'fn')

    // Employees Extra Info. Pulled down from custom report 128
    apiPath = '/pwnext/ReportBuilder/GenerateReport/128';
    const employeesJSON2 = await getPayworksData(apiPath);
    const employeesJSON2Cleaned = employeesJSON2.reportData.Series.map(entry => {
        const obj = {};
        entry.Data.forEach((value, index) => {
            obj[employeesJSON2.reportData.ReportColumnDescriptions[index].Name] = value;
        });
        return obj;
    });

    // Join the two datasets to create the full set of data
    const employeesJSONJoined = leftJoin(employeesWithGenderJSON, employeesJSON2Cleaned, 'number', 'Employee Number')

    await bulkLoad('Employees', [

        // From employeesJSON
        { name: 'id', type: sql.Int, options: { nullable: false, primary: true } },
        { name: 'firstName', type: sql.NVarChar(50) },
        { name: 'lastName', type: sql.NVarChar(50) },
        { name: 'isTerminated', type: sql.Bit },
        { name: 'payGroupId', type: sql.Int },
        { name: 'departmentId', type: sql.Int },
        { name: 'startDate', type: sql.Date },
        { name: 'seniorityDate', type: sql.Date },
        { name: 'status', type: sql.Int },

        // From ai
        { name: 'gender', type: sql.NVarChar(10) },

        // From employeesJSON2Cleaned
        { name: 'Employee Number', mappedName: 'employeeNumber', type: sql.Int },
        { name: 'Birth Date', mappedName: 'birthDate', type: sql.Date },
        { name: 'Address', mappedName: 'street', type: sql.NVarChar(100) },
        { name: 'City', mappedName: 'city', type: sql.NVarChar(40) },
        { name: 'Postal Code', mappedName: 'postalCode', type: sql.NVarChar(20) },
        //        { name: 'Gender', mappedName: 'gender', type: sql.NVarChar(20) },
        { name: 'Cell Area Code', mappedName: 'cellPhoneAreaCode', type: sql.Int },
        { name: 'Cell Phone Number', mappedName: 'cellPhoneNumber', type: sql.Int },
        { name: 'Area Code', mappedName: 'homePhoneAreaCode', type: sql.Int },
        { name: 'Phone Number', mappedName: 'homePhoneNumber', type: sql.Int },
        { name: 'Email', mappedName: 'email', type: sql.NVarChar(100) },
        //    { name: 'Annual Salary', mappedName: 'annualSalary', type: sql.Float },
        { name: 'Emergency Contact Name', mappedName: 'emergencyContactName', type: sql.NVarChar(100) },
        { name: 'Emergency Contact Phone', mappedName: 'emergencyContactPhone', type: sql.NVarChar(100) },
        { name: 'Emergency Relationship', mappedName: 'emergencyContactRelationship', type: sql.NVarChar(100) }

        /*
        { name: 'birthDate', type: sql.Date },                      // employeeSensitive.birthDate
        { name: 'genderCode', type: sql.NVarChar(20) },             // empDets.employeeSensitive.genderCode
        { name: 'cellPhone', type: sql.NVarChar(20) },              // employeePhoneNumbers.cellPhone
        { name: 'homePhone', type: sql.NVarChar(20) },              // employeePhoneNumbers.homePhone
        { name: 'primaryAddress', type: sql.NVarChar(50) },         // employeeContact.primaryAddress,
        { name: 'primaryCity', type: sql.NVarChar(30) },            // employeeContact.primaryCity,
        { name: 'primaryPostalCode', type: sql.NVarChar(20) },      // employeeContact.primaryPostalCode,
        { name: 'emailAddress', type: sql.NVarChar(100) },          // employeeContact.emailAddress,
        { name: 'personalEmailAddress', type: sql.NVarChar(100) },  // employeeContact.personalEmailAddress,
        */

    ], employeesJSONJoined);


    // Add details to each employee row. These need to be fetched 1 at a time!
    /*
    if (false) {
        for (const emp of employeesJSON) {
            apiPath = `/pwnextv2/view/EmployeeInfo/ProfileTab/${emp.id}`;
            const empDets = await getPayworksData(apiPath);

            await updateRow('Employees', 'id', [
                { name: 'id', type: sql.Int, value: emp.id },
                { name: 'birthDate', type: sql.Date, value: empDets.employeeSensitive.birthDate },
                { name: 'genderCode', type: sql.NVarChar(20), value: empDets.employeeSensitive.genderCode },
                { name: 'cellPhone', type: sql.NVarChar(20), value: empDets.employeePhoneNumbers.cellPhone },
                { name: 'homePhone', type: sql.NVarChar(20), value: empDets.employeePhoneNumbers.homePhone },
                { name: 'primaryAddress', type: sql.NVarChar(50), value: empDets.employeeContact.primaryAddress },
                { name: 'primaryCity', type: sql.NVarChar(30), value: empDets.employeeContact.primaryCity },
                { name: 'primaryPostalCode', type: sql.NVarChar(20), value: empDets.employeeContact.primaryPostalCode },
                { name: 'emailAddress', type: sql.NVarChar(100), value: empDets.employeeContact.emailAddress },
                { name: 'personalEmailAddress', type: sql.NVarChar(100), value: empDets.employeeContact.personalEmailAddress },
            ]);

            console.log(`Updating employee: ${emp.id} ${emp.lastName}, ${emp.firstName}`);
        }
    }
    */

    // Departments
    // const jsonDepartments = JSON.parse(fs.readFileSync('research/json/Departments.json'));
    apiPath = '/pwnextv2api/api/Department?includeDeleted=true&includePublic=true';
    const jsonDepartments = await getPayworksData(apiPath);
    await bulkLoad('Departments', [
        { name: 'departmentId', type: sql.Int, options: { nullable: false, primary: true } },
        { name: 'departmentName', type: sql.NVarChar(100) },
        { name: 'storeName', type: sql.NVarChar(50) },
        { name: 'department', type: sql.NVarChar(100) },
        { name: 'deleted', type: sql.Bit },
    ], jsonDepartments);

    // Shifts
    //const jsonShifts = JSON.parse(fs.readFileSync('research/json/Shifts-Small.json'));

    // Get Shift data
    const startDateFmt = '2022-01-01'; // Get everyting from start of 2022
    const startOfWeekDate = startOfWeek(new Date(), { weekStartsOn: 1 }); // 1 means Monday
    const endDate = addDays(startOfWeekDate, 13); // Get everything up to the next 2 weeks...
    const endDateFmt = format(endDate, 'yyyy-MM-dd');
    apiPath = `/pwnextv2api/v3.0/TimeManagement/EmployeeShifts?lowerBound=${startDateFmt}&upperBound=${endDateFmt}`;
    const jsonShifts = await getPayworksData(apiPath);

    await bulkLoad('Shifts', [
        { name: 'id', type: sql.Int, options: { nullable: false, primary: true } },
        { name: 'scheduleId', type: sql.Int },
        { name: 'employeeId', type: sql.Int },
        { name: 'startTime', type: sql.DateTimeOffset },
        { name: 'endTime', type: sql.DateTimeOffset },
        { name: 'deleted', type: sql.Bit },
        { name: 'positionId', type: sql.Int },
        { name: 'departmentId', type: sql.Int },
        { name: 'date', type: sql.Date }

    ], jsonShifts);

    // TimeOffRequests
    apiPath = '/pwnextv2api/tom/TimeOffRequestGroups?lowerBound=2023-01-01';
    const jsonTimeOffRequests = await getPayworksData(apiPath);

    // Get the 'childRows out of the structure... this is where the detail data is
    const jsonTimeOffRequestsChildRows = [...new Set(jsonTimeOffRequests.flatMap(item => item.childRows))];
    await bulkLoad('TimeOffRequests', [
        { name: 'torId', type: sql.Int }, //, options: { nullable: false, primary: true } },
        { name: 'startTime', type: sql.DateTimeOffset },
        { name: 'endTime', type: sql.DateTimeOffset },
        { name: 'timeOffTypeName', type: sql.NVarChar(50) },
        { name: 'status', type: sql.NVarChar(50) },
        { name: 'totalHours', type: sql.Float },
        { name: 'numberOfDays', type: sql.Float },
        { name: 'employeeId', type: sql.Int },
        { name: 'date', type: sql.Date }

    ], jsonTimeOffRequestsChildRows);


    // Clean up a few things
    await sql.query('delete from shifts where employeeId is null');
    await sql.query('delete from employees where isTerminated = 1');
    await sql.query('update shifts set date = convert(date, startTime)');
    await sql.query('update timeOffRequests set date = convert(date, startTime)');
    await sql.query(`
        ALTER TABLE shifts ALTER COLUMN startTime datetime;
        ALTER TABLE shifts ALTER COLUMN endTime datetime;
        ALTER TABLE timeOffRequests ALTER COLUMN startTime datetime;
        ALTER TABLE timeOffRequests ALTER COLUMN endTime datetime;
        `);

    // Split the departmentName into storeName and department
    await sql.query(`
        update departments set
        storeName = trim(replace(substring( departmentName, 0 , charindex ('-', departmentName)), 'DELETED_', '' )),
        department = trim(replace(replace(substring( departmentName, charindex ('-', departmentName), 100), '-', ''), 'DELETED_',''))   
        `);

    // Clean up a few storenames... This should be configurable
    await sql.query(`
        update departments set
        storeName = CASE 
            WHEN storeName = 'HO' THEN 'Head Office'
            WHEN storeName = 'Carboro Bay' THEN 'Cadboro Bay'
            WHEN storeName = 'St Anthonys' THEN 'St. Anthonys'
            WHEN storeName = 'St. Anthony s' THEN 'St. Anthonys'
            ELSE storeName 
            END
        `);

    disconnectFromDatabase();

    const endTime = new Date(); // Record the end time
    const durationMs = endTime - startTime; // Calculate the duration in milliseconds
    const durationSec = durationMs / 1000; // Convert milliseconds to seconds
    console.log(`Done at ${endTime.toLocaleString()}. Duration: ${durationSec} seconds.\n`);

}

// Call the fetchData function
loadDatabaseSchema();
