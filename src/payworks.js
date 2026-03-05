import axios from 'axios';
import * as dotenv from 'dotenv'
import crypto from 'crypto';
import https from 'https';
const allowLegacyRenegotiationforNodeJsOptions = {
    httpsAgent: new https.Agent({

        secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
    }),
};

const PAYWORKSURL = 'https://payroll.payworks.ca';
var PAYWORKS_AUTHTOK = undefined;

// Read the .env environment variables
dotenv.config();
const base64Decode = (str) => Buffer.from(str, 'base64').toString('binary');
const base64Encode = (str) => Buffer.from(str, 'binary').toString('base64');

function encodePayworksLogin() {
    const rawCredentials = `${process.env.PAYWORKS_USER_NAME}:${process.env.PAYWORKS_PASSWORD}`;
    const base64Credentials = base64Encode(rawCredentials);
    const basicAuthToken = `Basic ${base64Credentials}`;
    return basicAuthToken;
}

async function getPayworksAuthTok(customerNumber) {
    const authTok = encodePayworksLogin();
    const url = `http://payworks-authenticator.azurewebsites.net/login?customerNumber=${customerNumber}`;
    const result = await axios.get(url, { headers: { 'Authorization': `${authTok}` } });
    return result.data;
}

export async function authenticateWithPayworks(customerNumber) {
    PAYWORKS_AUTHTOK = await getPayworksAuthTok(customerNumber);
}

export async function getPayworksData(path) {
    const url = `${PAYWORKSURL}${path}`;
    try {
        const response = await axios.request(
            {
                ...allowLegacyRenegotiationforNodeJsOptions,
                url,
                headers: { 'Cookie': PAYWORKS_AUTHTOK },
                method: 'GET',
            });

        return response.data;
    } catch (e) {
        console.log(e);
    }
}


