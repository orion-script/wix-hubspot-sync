import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { encrypt } from '@/lib/crypto';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code || !state) return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });

  const wixInstanceId = decodeURIComponent(state);
  const clientId = process.env.HUBSPOT_CLIENT_ID!;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET!;
  const redirectUri = process.env.HUBSPOT_REDIRECT_URI!;

  try {
    const tokenResponse = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    });

    if (!tokenResponse.ok) {
      const err = await tokenResponse.text();
      console.error('Failed to get token:', err);
      return NextResponse.json({ error: 'Failed to exchange token' }, { status: 500 });
    }

    const tokenData = await tokenResponse.json();
    const expiresAt = Date.now() + tokenData.expires_in * 1000;

    // Fetch portal info to store portalId for webhook mapping
    const infoRes = await fetch('https://api.hubapi.com/oauth/v1/access-tokens/' + tokenData.access_token);
    const infoData = infoRes.ok ? await infoRes.json() : {};
    const hubspotPortalId = String(infoData.hub_id || '');

    const db = await getDb();

    // Store ENCRYPTED tokens — never store plaintext credentials
    await db.run(
      `INSERT INTO connections (wixInstanceId, hubspotAccessToken, hubspotRefreshToken, hubspotExpiresAt, hubspotPortalId)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(wixInstanceId) DO UPDATE SET
         hubspotAccessToken=excluded.hubspotAccessToken,
         hubspotRefreshToken=excluded.hubspotRefreshToken,
         hubspotExpiresAt=excluded.hubspotExpiresAt,
         hubspotPortalId=excluded.hubspotPortalId`,
      [wixInstanceId, encrypt(tokenData.access_token), encrypt(tokenData.refresh_token), expiresAt, hubspotPortalId]
    );

    return NextResponse.redirect(new URL(`/?instanceId=${wixInstanceId}`, request.url));
  } catch (error) {
    console.error('OAuth Callback Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
