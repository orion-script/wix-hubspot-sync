import { NextRequest, NextResponse } from 'next/server';
import { syncWixToHubSpot } from '@/lib/sync';
import { verifyHmac } from '@/lib/crypto';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

        // Wix signs webhooks with HMAC-SHA256 using your app's secret key.
    const wixSignature = request.headers.get('x-wix-signature') || '';
    const wixWebhookSecret = process.env.WIX_WEBHOOK_SECRET || '';

    if (wixWebhookSecret && wixSignature) {
      const isValid = verifyHmac(wixWebhookSecret, rawBody, wixSignature);
      if (!isValid) {
        console.warn('[Webhook] Wix contact webhook: invalid signature — rejecting');
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
      }
    }

    const payload = JSON.parse(rawBody);

    // Wix webhook payload structure:
    // { instanceId, data: { contactId, updatedAt, name, emails, phones, ... } }
    const wixInstanceId = payload.instanceId;
    const contactData = payload.data;

    if (!wixInstanceId || !contactData?.contactId) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

        const wixUpdatedAt = contactData.updatedAt
      ? new Date(contactData.updatedAt).getTime()
      : Date.now();

        syncWixToHubSpot(wixInstanceId, contactData.contactId, contactData, wixUpdatedAt).catch(err => {
      console.error('[Webhook] Wix→HS background sync failed:', err);
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Webhook] Wix contact error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
