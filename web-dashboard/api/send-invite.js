export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, name, inviteId } = req.body;

  if (!email || !inviteId) {
    return res.status(400).json({ error: 'Missing email or inviteId' });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const MOBILE_APP_URL = 'https://app.trackable.co.nz';
  const inviteLink = `${MOBILE_APP_URL}?invite=true&email=${encodeURIComponent(email)}`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Trackable NZ <noreply@trackable.co.nz>',
        to: email,
        subject: "You've been invited to Trackable NZ",
        html: `
          <!DOCTYPE html>
          <html>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px;">
            <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <div style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 32px 24px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">Trackable NZ</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">Employee Time Tracking</p>
              </div>
              <div style="padding: 32px 24px;">
                <h2 style="color: #1e293b; margin: 0 0 16px; font-size: 20px;">Hi ${name || 'there'}!</h2>
                <p style="color: #64748b; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
                  Your employer has invited you to join Trackable NZ. Click the button below to set up your account.
                </p>
                <a href="${inviteLink}" style="display: block; background: #16a34a; color: white; text-decoration: none; padding: 16px 24px; border-radius: 12px; font-weight: 600; font-size: 16px; text-align: center; margin-bottom: 24px;">
                  Accept Invite & Create Account
                </a>
                <div style="background: #f1f5f9; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                  <p style="color: #1e293b; font-weight: 600; margin: 0 0 12px; font-size: 14px;">With Trackable NZ you can:</p>
                  <ul style="color: #64748b; font-size: 14px; margin: 0; padding-left: 20px; line-height: 1.8;">
                    <li>Clock in and out from your phone</li>
                    <li>Track breaks (auto-calculated per NZ law)</li>
                    <li>Log travel time between jobs</li>
                    <li>Add job notes and communicate with your team</li>
                  </ul>
                </div>
                <p style="color: #94a3b8; font-size: 13px; margin: 0;">
                  Or copy this link:<br>
                  <a href="${inviteLink}" style="color: #2563eb; word-break: break-all;">${inviteLink}</a>
                </p>
              </div>
              <div style="background: #f8fafc; padding: 20px 24px; border-top: 1px solid #e2e8f0;">
                <p style="color: #94a3b8; font-size: 12px; margin: 0; text-align: center;">
                  This invite was sent by your employer via Trackable NZ.
                </p>
              </div>
            </div>
          </body>
          </html>
        `,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Resend error:', data);
      return res.status(500).json({ error: 'Failed to send email', details: data });
    }

    return res.status(200).json({ success: true, messageId: data.id });
  } catch (error) {
    console.error('Error sending email:', error);
    return res.status(500).json({ error: 'Failed to send email' });
  }
}