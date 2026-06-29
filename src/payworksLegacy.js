// Payworks LEGACY authenticator (old customer-number / basic-auth login).
//
// This is the original login mechanism: it posts basic-auth credentials to the
// external Payworks authenticator service, gets back a session cookie, and
// reuses it for data requests. It is selected automatically by src/payworks.js
// when PAYWORKS_CUSTOMER is set in .env. Kept as an alternative to the new
// browser-based email login in payworksBrowserLogin.js.

import axios from 'axios';
import * as dotenv from 'dotenv';
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

export async function authenticateWithPayworks() {
    if (!PAYWORKS_AUTHTOK) {
        const customerNumber = process.env.PAYWORKS_CUSTOMER;
        if (!customerNumber) {
            throw new Error('PAYWORKS_CUSTOMER is not defined in environment variables.');
        }
        console.log('Authenticating with Payworks (legacy)...');
        PAYWORKS_AUTHTOK = await getPayworksAuthTok(customerNumber);
    }
}

export async function getPayworksData(path) {
    const url = `${PAYWORKSURL}${path}`;
    try {
        await authenticateWithPayworks();
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
