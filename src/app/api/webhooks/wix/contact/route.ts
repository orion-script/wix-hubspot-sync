import { NextRequest, NextResponse } from 'next/server';
import { syncWixToHubSpot } from '@/lib/sync';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    
    // Wix Webhook payloads typically include data and instanceId
    // For this assignment, assuming a standard structure:
    // { "instanceId": "...", "data": { "contactId": "...", ...contactProperties } }
    
    const wixInstanceId = payload.instanceId;
    const contactData = payload.data;
    
    if (!wixInstanceId || !contactData || !contactData.contactId) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Run sync asynchronously so we don't block the webhook response
    syncWixToHubSpot(wixInstanceId, contactData.contactId, contactData).catch(err => {
      console.error('Wix -> HubSpot sync failed in background:', err);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Wix contact webhook error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
