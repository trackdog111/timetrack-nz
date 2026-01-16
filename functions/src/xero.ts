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
  'payroll.settings.read',
  'payroll.payruns',
  'payroll.payslip',
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

// ============================================================
// NEW: Fetch Reimbursement Types from Xero
// ============================================================
export const xeroGetReimbursementTypes = functions
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

    try {
      const response = await axios.get(
        'https://api.xero.com/payroll.xro/2.0/Reimbursements',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Xero-tenant-id': connection.tenantId,
            'Accept': 'application/json'
          }
        }
      );

      const reimbursementTypes = response.data.reimbursements || [];
      
      // Store in Firestore for reference
      await db.collection('xeroConnections').doc(companyId).update({
        reimbursementTypes: reimbursementTypes.map((r: any) => ({
          id: r.reimbursementID,
          name: r.name,
          accountID: r.expenseAccountID
        })),
        reimbursementTypesUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        reimbursementTypes: reimbursementTypes.map((r: any) => ({
          id: r.reimbursementID,
          name: r.name
        }))
      };

    } catch (error: any) {
      console.error('Error fetching reimbursement types:', error.response?.data || error.message);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to fetch reimbursement types from Xero. Make sure you have reimbursement types configured in Xero Payroll > Pay Items > Reimbursements'
      );
    }
  });

// ============================================================
// NEW: Save Expense Category Mappings
// ============================================================
export const xeroSaveExpenseMappings = functions
  .region('australia-southeast1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { companyId, mappings } = data;
    if (!companyId) {
      throw new functions.https.HttpsError('invalid-argument', 'Company ID required');
    }

    if (!mappings || typeof mappings !== 'object') {
      throw new functions.https.HttpsError('invalid-argument', 'Mappings object required');
    }

    // mappings format: { "Fuel": "uuid-from-xero", "Mileage": "uuid-from-xero" }
    await db.collection('xeroConnections').doc(companyId).update({
      expenseMappings: mappings,
      expenseMappingsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true };
  });

// ============================================================
// NEW: Get Expense Category Mappings
// ============================================================
export const xeroGetExpenseMappings = functions
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
      return { mappings: {}, reimbursementTypes: [] };
    }

    const connection = connectionDoc.data()!;
    
    return {
      mappings: connection.expenseMappings || {},
      reimbursementTypes: connection.reimbursementTypes || []
    };
  });

// ============================================================
// UPDATED: Export Timesheet with Proper Expense Mapping
// ============================================================
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

    // Get expense mappings from connection doc
    const expenseMappings = connection.expenseMappings || {};

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

      // Query approved expenses for this employee within the week
      const weekEndDate = new Date(endDate);
      weekEndDate.setHours(23, 59, 59, 999);
      
      const expensesSnapshot = await db.collection('expenses')
        .where('companyId', '==', companyId)
        .where('odEmail', '==', employeeEmail)
        .where('status', '==', 'approved')
        .get();

      // Filter expenses that fall within this week
      const weekExpenses = expensesSnapshot.docs.filter(doc => {
        const expense = doc.data();
        const expenseDate = expense.date?.toDate?.();
        if (!expenseDate) return false;
        return expenseDate >= startDateObj && expenseDate <= weekEndDate;
      });

      let expensesExported = 0;
      let expensesTotal = 0;
      let expensesSkipped = 0;
      const skippedCategories: string[] = [];

      if (weekExpenses.length > 0) {
        // Check if we have any mappings configured
        const hasMappings = Object.keys(expenseMappings).length > 0;
        
        if (!hasMappings) {
          console.log('No expense mappings configured - skipping expense export');
          expensesSkipped = weekExpenses.length;
        } else {
          // Find a Draft PayRun for this pay period to add reimbursements
          try {
            const payRunsResponse = await axios.get(
              'https://api.xero.com/payroll.xro/2.0/PayRuns?status=Draft',
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Xero-tenant-id': connection.tenantId,
                  'Accept': 'application/json'
                }
              }
            );

            const payRuns = payRunsResponse.data.payRuns || [];
            
            // Find a draft pay run for this calendar
            let targetPayRun = payRuns.find((pr: any) => 
              pr.payrollCalendarID === payCalendarId && 
              pr.payRunStatus === 'Draft'
            );

            if (targetPayRun) {
              console.log('Found draft PayRun:', targetPayRun.payRunID);
              
              // Get payslips for this pay run
              const paySlipsResponse = await axios.get(
                `https://api.xero.com/payroll.xro/2.0/PaySlips?PayRunID=${targetPayRun.payRunID}`,
                {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Xero-tenant-id': connection.tenantId,
                    'Accept': 'application/json'
                  }
                }
              );

              const paySlips = paySlipsResponse.data.paySlips || [];
              
              // Find the payslip for this employee
              const employeePaySlip = paySlips.find((ps: any) => 
                ps.employeeID === xeroEmployeeId
              );

              if (employeePaySlip) {
                console.log('Found employee PaySlip:', employeePaySlip.paySlipID);

                // Get full payslip details
                const paySlipDetailResponse = await axios.get(
                  `https://api.xero.com/payroll.xro/2.0/PaySlips/${employeePaySlip.paySlipID}`,
                  {
                    headers: {
                      'Authorization': `Bearer ${accessToken}`,
                      'Xero-tenant-id': connection.tenantId,
                      'Accept': 'application/json'
                    }
                  }
                );

                const fullPaySlip = paySlipDetailResponse.data.paySlip || paySlipDetailResponse.data.paySlips?.[0];
                const existingReimbursementLines = fullPaySlip?.reimbursementLines || [];

                // Build reimbursement lines for expenses that have mappings
                const newReimbursementLines: any[] = [];
                
                for (const expenseDoc of weekExpenses) {
                  const expense = expenseDoc.data();
                  const category = expense.category || 'Other';
                  const mappedReimbursementId = expenseMappings[category];
                  
                  if (mappedReimbursementId) {
                    newReimbursementLines.push({
                      reimbursementTypeID: mappedReimbursementId,
                      description: `${category}: ${expense.note || 'Reimbursement'}`,
                      amount: expense.amount || 0
                    });
                  } else {
                    // No mapping for this category
                    expensesSkipped++;
                    if (!skippedCategories.includes(category)) {
                      skippedCategories.push(category);
                    }
                    console.log(`Skipping expense - no mapping for category: ${category}`);
                  }
                }

                if (newReimbursementLines.length > 0) {
                  // Combine existing and new reimbursement lines
                  const allReimbursementLines = [
                    ...existingReimbursementLines,
                    ...newReimbursementLines
                  ];

                  // Update the payslip with reimbursement lines
                  try {
                    await axios.put(
                      `https://api.xero.com/payroll.xro/2.0/PaySlips/${employeePaySlip.paySlipID}`,
                      {
                        reimbursementLines: allReimbursementLines
                      },
                      {
                        headers: {
                          'Authorization': `Bearer ${accessToken}`,
                          'Xero-tenant-id': connection.tenantId,
                          'Content-Type': 'application/json',
                          'Accept': 'application/json'
                        }
                      }
                    );

                    console.log('Successfully added reimbursements to payslip');

                    // Mark exported expenses
                    for (const expenseDoc of weekExpenses) {
                      const expense = expenseDoc.data();
                      const category = expense.category || 'Other';
                      
                      // Only mark as exported if it had a mapping
                      if (expenseMappings[category]) {
                        expensesExported++;
                        expensesTotal += expense.amount || 0;

                        await expenseDoc.ref.update({
                          xeroExported: true,
                          xeroExportedAt: admin.firestore.FieldValue.serverTimestamp(),
                          xeroExportedWeek: weekStart,
                          xeroPaySlipID: employeePaySlip.paySlipID
                        });
                      }
                    }

                  } catch (paySlipError: any) {
                    console.error('Error updating payslip with reimbursements:', 
                      paySlipError.response?.data || paySlipError.message);
                  }
                }
              } else {
                console.log('No payslip found for employee in this PayRun');
              }
            } else {
              console.log('No draft PayRun found for this pay calendar - expenses will need to be added manually or when a PayRun is created');
            }
          } catch (reimbError: any) {
            console.error('Error processing expenses:', reimbError.response?.data || reimbError.message);
          }
        }
      }

      await db.collection('xeroExports').add({
        companyId,
        employeeEmail,
        weekStart,
        xeroTimesheetId: createdTimesheet?.timesheetID,
        totalHours: roundedHours,
        expensesExported,
        expensesTotal,
        expensesSkipped,
        skippedCategories,
        exportedBy: context.auth.uid,
        exportedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        timesheetId: createdTimesheet?.timesheetID,
        status: createdTimesheet?.status,
        expensesExported,
        expensesTotal,
        expensesSkipped,
        skippedCategories: skippedCategories.length > 0 ? skippedCategories : undefined
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
