import { getDb } from './db';

const HUBSPOT_CLIENT_ID = process.env.HUBSPOT_CLIENT_ID!;
const HUBSPOT_CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET!;
const HUBSPOT_REDIRECT_URI = process.env.HUBSPOT_REDIRECT_URI!;

export async function getHubspotAccessToken(wixInstanceId: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.get(
    'SELECT hubspotAccessToken, hubspotRefreshToken, hubspotExpiresAt FROM connections WHERE wixInstanceId = ?',
    [wixInstanceId]
  );

  if (!row) return null;

  // If token is expired or expiring within 5 minutes, refresh it
  if (Date.now() > row.hubspotExpiresAt - 5 * 60 * 1000) {
    console.log('Refreshing HubSpot token for instance:', wixInstanceId);
    
    const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: HUBSPOT_CLIENT_ID,
        client_secret: HUBSPOT_CLIENT_SECRET,
        refresh_token: row.hubspotRefreshToken,
      }),
    });

    if (!response.ok) {
      console.error('Failed to refresh HubSpot token', await response.text());
      return null;
    }

    const data = await response.json();
    const newExpiresAt = Date.now() + data.expires_in * 1000;

    await db.run(
      'UPDATE connections SET hubspotAccessToken = ?, hubspotRefreshToken = ?, hubspotExpiresAt = ? WHERE wixInstanceId = ?',
      [data.access_token, data.refresh_token, newExpiresAt, wixInstanceId]
    );

    return data.access_token;
  }

  return row.hubspotAccessToken;
}

export async function hubspotApi(wixInstanceId: string, endpoint: string, options: RequestInit = {}) {
  const token = await getHubspotAccessToken(wixInstanceId);
  if (!token) {
    throw new Error('No HubSpot connection found or failed to refresh token');
  }

  const url = `https://api.hubapi.com${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  return response;
}
