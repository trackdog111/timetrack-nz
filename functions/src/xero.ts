import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import axios from 'axios';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const XERO_CLIENT_ID = '7E18E534BCF5478CA63E6DFCAB04B2D1';
const XERO_CLIENT_SECRET = 'KD2y9ClwmpsC5xvpBDexCP6okIL4eK39xp2RO3PCOr2aWnF7';
const XERO_REDIRECT_URI = 'https://timetrack-nz.web.app/xero/callback';

const XERO_SCOPES = [
  'openid',
  'profile',
  'email',
  'accounting.transactions',
  'payroll.employees',
  'payroll.timesheets',
  'payroll.settings',
  'offline_access'
].join(' ');

export const xeroGetAuthUrl = functions
  .region('australia-southeast1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { companyId } = data;
    if (!companyId) {
      throw new functions.https.HttpsError('invalid-argument', 'Company ID required');
    }

    const state = Buffer.from(JSON.stringify({
      companyId,
      userId: context.auth.uid,
      timestamp: Date.now()
    })).toString('base64');

    await db.collection('xeroAuthStates').doc(state).set({
      companyId,
      userId: context.auth.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    const authUrl = new URL('https://login.xero.com/identity/connect/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', XERO_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', XERO_REDIRECT_URI);
    authUrl.searchParams.set('scope', XERO_SCOPES);
    authUrl.searchParams.set('state', state);

    return { authUrl: authUrl.toString() };
  });

export const xeroCallback = functions
  .region('australia-southeast1')
  .https.onRequest(async (req, res) => {
    try {
      const { code, state, error } = req.query;

      if (error) {
        console.error('Xero OAuth error:', error);
        res.redirect(`https://timetrack-nz.web.app/settings?xero_error=${error}`);
        return;
      }

      if (!code || !state) {
        res.redirect('https://timetrack-nz.web.app/settings?xero_error=missing_params');
        return;
      }

      const stateDoc = await db.collection('xeroAuthStates').doc(state as string).get();
      if (!stateDoc.exists) {
        res.redirect('https://timetrack-nz.web.app/settings?xero_error=invalid_state');
        return;
      }

      const stateData = stateDoc.data()!;
      const { companyId, userId } = stateData;

      await stateDoc.ref.delete();

      const tokenResponse = await axios.post(
        'https://identity.xero.com/connect/token',
        new URLSearchParams({
          grant_type: 'authorization_code',
          code: code as string,
          redirect_uri: XERO_REDIRECT_URI
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`).toString('base64')}`
          }
        }
      );

      const { access_token, refresh_token, expires_in } = tokenResponse.data;

      const connectionsResponse = await axios.get('https://api.xero.com/connections', {
        headers: { 'Authorization': `Bearer ${access_token}` }
      });

      const connections = connectionsResponse.data;
      if (!connections || connections.length === 0) {
        res.redirect('https://timetrack-nz.web.app/settings?xero_error=no_organisation');
        return;
      }

      const xeroTenant = connections[0];

      await db.collection('xeroConnections').doc(companyId).set({
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: new Date(Date.now() + expires_in * 1000),
        tenantId: xeroTenant.tenantId,
        tenantName: xeroTenant.tenantName,
        tenantType: xeroTenant.tenantType,
        connectedBy: userId,
        connectedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      res.redirect(`https://timetrack-nz.web.app/settings?xero_connected=true&org=${encodeURIComponent(xeroTenant.tenantName)}`);

    } catch (error: any) {
      console.error('Xero callback error:', error.response?.data || error.message);
      res.redirect(`https://timetrack-nz.web.app/settings?xero_error=token_exchange_failed`);
    }
  });

async function refreshXeroToken(companyId: string): Promise<string> {
  const connectionDoc = await db.collection('xeroConnections').doc(companyId).get();
  
  if (!connectionDoc.exists) {
    throw new Error('No Xero connection found');
  }

  const connection = connectionDoc.data()!;
  
  const expiresAt = connection.expiresAt.toDate();
  const needsRefresh = expiresAt.getTime() - Date.now() < 5 * 60 * 1000;

  if (!needsRefresh) {
    return connection.accessToken;
  }

  const tokenResponse = await axios.post(
    'https://identity.xero.com/connect/token',
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: connection.refreshToken
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`).toString('base64')}`
      }
    }
  );

  const { access_token, refresh_token, expires_in } = tokenResponse.data;

  await connectionDoc.ref.update({
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt: new Date(Date.now() + expires_in * 1000),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return access_token;
}

export const xeroGetStatus = functions
  .region('australia-southeast1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { companyId } = data;
    if (!companyId) {
      throw new functions.https.HttpsError('invalid-argument', 'Company ID required');
    }

    const connectionDoc = await db.collection('xeroConnections').doc(companyId).get();
    
    if (!connectionDoc.exists) {
      return { connected: false };
    }

    const connection = connectionDoc.data()!;
    
    return {
      connected: true,
      tenantName: connection.tenantName,
      connectedAt: connection.connectedAt?.toDate?.()?.toISOString() || null
    };
  });

export const xeroDisconnect = functions
  .region('australia-southeast1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { companyId } = data;
    if (!companyId) {
      throw new functions.https.HttpsError('invalid-argument', 'Company ID required');
    }

    await db.collection('xeroConnections').doc(companyId).delete();
    
    return { success: true };
  });

export const xeroGetEmployees = functions
  .region('australia-southeast1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { companyId } = data;
    if (!companyId) {
      throw new functions.https.HttpsError('invalid-argument', 'Company ID required');
    }

    const connectionDoc = await db.collection('xeroConnections').doc(companyId).get();
    if (!connectionDoc.exists) {
      throw new functions.https.HttpsError('failed-precondition', 'Xero not connected');
    }

    const connection = connectionDoc.data()!;
    const accessToken = await refreshXeroToken(companyId);

    const response = await axios.get(
      'https://api.xero.com/payroll.xro/2.0/Employees',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Xero-tenant-id': connection.tenantId,
          'Accept': 'application/json'
        }
      }
    );

    const employees = response.data.employees || [];
    
    return {
      employees: employees.map((emp: any) => ({
        xeroId: emp.employeeID,
        firstName: emp.firstName,
        lastName: emp.lastName,
        email: emp.email
      }))
    };
  });

export const xeroExportTimesheet = functions
  .region('australia-southeast1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { companyId, employeeEmail, weekStart, shifts, totalHours } = data;
    
    if (!companyId || !employeeEmail || !weekStart || !shifts) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }

    const connectionDoc = await db.collection('xeroConnections').doc(companyId).get();
    if (!connectionDoc.exists) {
      throw new functions.https.HttpsError('failed-precondition', 'Xero not connected');
    }

    const connection = connectionDoc.data()!;
    const accessToken = await refreshXeroToken(companyId);

    // Get all employees and find by email
    const employeesResponse = await axios.get(
      'https://api.xero.com/payroll.xro/2.0/Employees',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Xero-tenant-id': connection.tenantId,
          'Accept': 'application/json'
        }
      }
    );

    const xeroEmployees = employeesResponse.data.employees || [];
    const matchedEmployee = xeroEmployees.find(
      (emp: any) => emp.email?.toLowerCase() === employeeEmail.toLowerCase()
    );

    if (!matchedEmployee) {
      throw new functions.https.HttpsError(
        'not-found',
        `No Xero employee found with email: ${employeeEmail}`
      );
    }

    const xeroEmployeeId = matchedEmployee.employeeID;
    const payCalendarId = matchedEmployee.payrollCalendarID;

    if (!payCalendarId) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Employee has no pay calendar assigned in Xero'
      );
    }

    // Get earnings rates from the EarningsRates endpoint
    const earningsRatesResponse = await axios.get(
      'https://api.xero.com/payroll.xro/2.0/EarningsRates',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Xero-tenant-id': connection.tenantId,
          'Accept': 'application/json'
        }
      }
    );

    const earningsRates = earningsRatesResponse.data.earningsRates || [];
    
    if (!earningsRates || earningsRates.length === 0) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'No earnings rates found in Xero. Please set up pay items in Xero first.'
      );
    }

    // Find ordinary time / regular earnings rate
    const ordinaryEarnings = earningsRates.find((e: any) => 
      e.earningsType === 'RegularEarnings' ||
      e.earningsType === 'REGULAREARNINGS' ||
      e.name?.toLowerCase().includes('ordinary') ||
      e.name?.toLowerCase().includes('regular')
    ) || earningsRates[0];

    const earningsRateId = ordinaryEarnings.earningsRateID;

    if (!earningsRateId) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Could not find earningsRateID in: ${JSON.stringify(ordinaryEarnings)}`
      );
    }

    // Round hours to 2 decimal places
    const roundedHours = Math.round(totalHours * 100) / 100;

    // Calculate end date (6 days after start)
    const startDateObj = new Date(weekStart);
    const endDateObj = new Date(startDateObj.getTime() + 6 * 24 * 60 * 60 * 1000);
    const endDate = endDateObj.toISOString().split('T')[0];

    // Create timesheet payload - NZ Payroll requires date on each line
    const timesheetPayload = {
      payrollCalendarID: payCalendarId,
      employeeID: xeroEmployeeId,
      startDate: weekStart,
      endDate: endDate,
      timesheetLines: [
        {
          date: weekStart,  // Put all hours on the start date
          earningsRateID: earningsRateId,
          numberOfUnits: roundedHours
        }
      ]
    };

    console.log('Timesheet payload:', JSON.stringify(timesheetPayload, null, 2));

    try {
      const response = await axios.post(
        'https://api.xero.com/payroll.xro/2.0/Timesheets',
        timesheetPayload,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Xero-tenant-id': connection.tenantId,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

      console.log('Xero response:', JSON.stringify(response.data, null, 2));

      const createdTimesheet = response.data.timesheets?.[0] || response.data.timesheet;

      await db.collection('xeroExports').add({
        companyId,
        employeeEmail,
        weekStart,
        xeroTimesheetId: createdTimesheet?.timesheetID,
        totalHours: roundedHours,
        exportedBy: context.auth.uid,
        exportedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        timesheetId: createdTimesheet?.timesheetID,
        status: createdTimesheet?.status
      };

    } catch (error: any) {
      console.error('Xero timesheet creation error:', JSON.stringify(error.response?.data, null, 2) || error.message);
      
      const xeroError = error.response?.data?.problem || 
                        error.response?.data?.Message || 
                        error.response?.data?.Detail ||
                        error.response?.data?.title;
      throw new functions.https.HttpsError(
        'internal',
        xeroError || 'Failed to create timesheet in Xero'
      );
    }
  });

export const xeroCheckExported = functions
  .region('australia-southeast1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { companyId, employeeEmail, weekStart } = data;
    
    const exports = await db.collection('xeroExports')
      .where('companyId', '==', companyId)
      .where('employeeEmail', '==', employeeEmail)
      .where('weekStart', '==', weekStart)
      .limit(1)
      .get();

    if (exports.empty) {
      return { exported: false };
    }

    const exportData = exports.docs[0].data();
    return {
      exported: true,
      exportedAt: exportData.exportedAt?.toDate?.()?.toISOString() || null,
      xeroTimesheetId: exportData.xeroTimesheetId
    };
  });