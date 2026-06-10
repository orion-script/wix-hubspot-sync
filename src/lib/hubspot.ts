import { getDb } from './db';
import { encrypt, decrypt } from './crypto';

const HUBSPOT_CLIENT_ID = process.env.HUBSPOT_CLIENT_ID!;
const HUBSPOT_CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET!;

export async function getHubspotAccessToken(wixInstanceId: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.get(
    'SELECT hubspotAccessToken, hubspotRefreshToken, hubspotExpiresAt FROM connections WHERE wixInstanceId = ?',
    [wixInstanceId]
  );
  if (!row) return null;

  // Refresh token if expiring within 5 minutes
  if (Date.now() > row.hubspotExpiresAt - 5 * 60 * 1000) {
    const decryptedRefresh = decrypt(row.hubspotRefreshToken);
    const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: HUBSPOT_CLIENT_ID,
        client_secret: HUBSPOT_CLIENT_SECRET,
        refresh_token: decryptedRefresh,
      }),
    });

    if (!response.ok) {
      console.error('Failed to refresh HubSpot token');
      return null;
    }

    const data = await response.json();
    const newExpiresAt = Date.now() + data.expires_in * 1000;
    await db.run(
      'UPDATE connections SET hubspotAccessToken=?, hubspotRefreshToken=?, hubspotExpiresAt=? WHERE wixInstanceId=?',
      [encrypt(data.access_token), encrypt(data.refresh_token), newExpiresAt, wixInstanceId]
    );
    return data.access_token;
  }

  return decrypt(row.hubspotAccessToken);
}

export async function hubspotApi(
  wixInstanceId: string,
  endpoint: string,
  options: RequestInit = {}
) {
  const token = await getHubspotAccessToken(wixInstanceId);
  if (!token) throw new Error('No HubSpot connection found or failed to refresh token');

  const response = await fetch(`https://api.hubapi.com${endpoint}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  return response;
}
