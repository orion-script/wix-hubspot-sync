import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // This contains our wixInstanceId

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
  }

  const wixInstanceId = decodeURIComponent(state);

  const clientId = process.env.HUBSPOT_CLIENT_ID!;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET!;
  const redirectUri = process.env.HUBSPOT_REDIRECT_URI!;

  try {
    const tokenResponse = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code: code,
      }),
    });

    if (!tokenResponse.ok) {
      const err = await tokenResponse.text();
      console.error('Failed to get token:', err);
      return NextResponse.json({ error: 'Failed to exchange token' }, { status: 500 });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in; // in seconds
    const expiresAt = Date.now() + expiresIn * 1000;

    const db = await getDb();
    
    // UPSERT connection details
    await db.run(
      `INSERT INTO connections (wixInstanceId, hubspotAccessToken, hubspotRefreshToken, hubspotExpiresAt)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(wixInstanceId) DO UPDATE SET
       hubspotAccessToken=excluded.hubspotAccessToken,
       hubspotRefreshToken=excluded.hubspotRefreshToken,
       hubspotExpiresAt=excluded.hubspotExpiresAt`,
      [wixInstanceId, accessToken, refreshToken, expiresAt]
    );

    // Redirect to the UI (e.g., closing the popup or redirecting back to Wix dashboard)
    return NextResponse.redirect(new URL('/dashboard/success', request.url));
  } catch (error) {
    console.error('OAuth Callback Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
