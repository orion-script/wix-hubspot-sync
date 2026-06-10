import { NextRequest, NextResponse } from 'next/server';
import { syncHubSpotToWix } from '@/lib/sync';
import { verifyHmac } from '@/lib/crypto';
import { hubspotApi } from '@/lib/hubspot';
import { getDb } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

        // HubSpot signs: HMAC-SHA256(clientSecret + rawBody)
    const hsSignature = request.headers.get('x-hubspot-signature') || '';
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET || '';

    if (hsSignature && clientSecret) {
      const isValid = verifyHmac(clientSecret, rawBody, hsSignature);
      if (!isValid) {
        console.warn('[Webhook] HubSpot contact webhook: invalid signature — rejecting');
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
      }
    }

    const events: any[] = JSON.parse(rawBody);
    if (!Array.isArray(events)) {
      return NextResponse.json({ error: 'Expected array of events' }, { status: 400 });
    }

    const db = await getDb();

    for (const event of events) {
      const type = event.subscriptionType as string;
      if (!type.startsWith('contact.')) continue;

      const hubspotContactId = String(event.objectId);
      const portalId = String(event.portalId);

      // Map HubSpot portal ID → Wix instance ID
      let wixInstanceId: string | undefined;
      const conn = await db.get('SELECT wixInstanceId FROM connections WHERE hubspotPortalId = ?', [portalId]);
      wixInstanceId = conn?.wixInstanceId;

            if (!wixInstanceId) {
        const fallback = await db.get('SELECT wixInstanceId FROM connections LIMIT 1');
        wixInstanceId = fallback?.wixInstanceId;
      }

      if (!wixInstanceId) {
        console.warn('[Webhook] No Wix instance found for HubSpot portal:', portalId);
        continue;
      }

            const props = 'firstname,lastname,email,phone,company,hs_lastmodifieddate';
      const hsRes = await hubspotApi(wixInstanceId, `/crm/v3/objects/contacts/${hubspotContactId}?properties=${props}`);
      if (!hsRes.ok) continue;

      const hsData = await hsRes.json();
      const hsProperties: Record<string, string> = hsData.properties || {};

            const hsUpdatedAt = hsProperties.hs_lastmodifieddate
        ? new Date(hsProperties.hs_lastmodifieddate).getTime()
        : Date.now();

      syncHubSpotToWix(wixInstanceId, hubspotContactId, hsProperties, hsUpdatedAt).catch(err => {
        console.error('[Webhook] HS→Wix background sync failed:', err);
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Webhook] HubSpot contact error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
