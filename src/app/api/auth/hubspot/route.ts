import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { encrypt } from '@/lib/crypto';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const wixInstanceId = searchParams.get('instanceId');

  if (!wixInstanceId) return NextResponse.json({ error: 'Missing Wix Instance ID' }, { status: 400 });

  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const redirectUri = process.env.HUBSPOT_REDIRECT_URI;
  const scopes = 'crm.objects.contacts.read crm.objects.contacts.write';
  const state = encodeURIComponent(wixInstanceId);

  const authUrl = `https://app.hubspot.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri!)}&scope=${encodeURIComponent(scopes)}&state=${state}`;
  return NextResponse.redirect(authUrl);
}
