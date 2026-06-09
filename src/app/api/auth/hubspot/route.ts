import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const wixInstanceId = searchParams.get('instanceId');

  if (!wixInstanceId) {
    return NextResponse.json({ error: 'Missing Wix Instance ID' }, { status: 400 });
  }

  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const redirectUri = process.env.HUBSPOT_REDIRECT_URI; // e.g., https://your-app.com/api/auth/hubspot/callback
  const scopes = 'crm.objects.contacts.read crm.objects.contacts.write crm.schemas.contacts.read';
  
  // We pass the wixInstanceId in the state parameter to correlate it when the callback returns
  const state = encodeURIComponent(wixInstanceId);

  const authUrl = `https://app.hubspot.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scopes}&state=${state}`;

  return NextResponse.redirect(authUrl);
}
