import { NextRequest, NextResponse } from 'next/server';
import { syncHubSpotToWix } from '@/lib/sync';
import { hubspotApi } from '@/lib/hubspot';
import { getDb } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const events = await request.json();
    
    // HubSpot sends an array of events
    if (!Array.isArray(events)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const db = await getDb();

    for (const event of events) {
      if (event.subscriptionType === 'contact.creation' || event.subscriptionType === 'contact.propertyChange') {
        const hubspotContactId = String(event.objectId);
        
        // Find which wixInstanceId this belongs to. In a real app, HubSpot webhook 
        // doesn't send our tenant ID. We have to map HubSpot portal ID to Wix Instance ID.
        // Let's get the portal ID from the event (portalId).
        const portalId = String(event.portalId);
        
        const connection = await db.get('SELECT wixInstanceId FROM connections WHERE hubspotPortalId = ?', [portalId]);
        
        // If we don't have portalId mapped, fallback to finding via sync_state or assume single-tenant for this mock.
        // For simplicity in this assignment, we'll fetch the first active connection if portalId mapping isn't fully implemented.
        let wixInstanceId = connection?.wixInstanceId;
        if (!wixInstanceId) {
           const fallback = await db.get('SELECT wixInstanceId FROM connections LIMIT 1');
           wixInstanceId = fallback?.wixInstanceId;
        }

        if (wixInstanceId) {
          // Fetch full contact from HubSpot to sync all mapped fields
          const hsRes = await hubspotApi(wixInstanceId, `/crm/v3/objects/contacts/${hubspotContactId}?properties=firstname,lastname,email,phone,company`);
          if (hsRes.ok) {
            const hsData = await hsRes.json();
            syncHubSpotToWix(wixInstanceId, hubspotContactId, hsData.properties).catch(err => {
               console.error('HubSpot -> Wix sync failed in background:', err);
            });
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('HubSpot contact webhook error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
