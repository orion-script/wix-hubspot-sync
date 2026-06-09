import { NextRequest, NextResponse } from 'next/server';
import { hubspotApi } from '@/lib/hubspot';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    
    // Wix Form Submit Webhook payload
    const wixInstanceId = payload.instanceId;
    const formData = payload.data; // Includes fields, context, etc.

    if (!wixInstanceId || !formData) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Extract fields
    const email = formData.fields?.find((f: any) => f.name === 'Email' || f.name === 'email')?.value;
    const firstName = formData.fields?.find((f: any) => f.name === 'First Name' || f.name === 'firstName')?.value;
    const lastName = formData.fields?.find((f: any) => f.name === 'Last Name' || f.name === 'lastName')?.value;

    if (!email) {
      console.warn('Form submission skipped: No email provided.');
      return NextResponse.json({ success: true, note: 'No email' });
    }

    // Extract UTM parameters and context (Wix forms usually include this in the `context` or `submissionTime`)
    // Mocking extraction as it depends on exact Wix form schema
    const context = formData.context || {};
    const utmSource = context.utm_source || 'Wix Form';
    const utmMedium = context.utm_medium || '';
    const utmCampaign = context.utm_campaign || '';
    const pageUrl = context.pageUrl || '';

    // Push to HubSpot
    const properties: any = {
      email,
      firstname: firstName,
      lastname: lastName,
      hs_analytics_source: 'EXTENSION', // or other valid HubSpot source enum
      hs_analytics_source_data_1: utmSource,
      hs_analytics_source_data_2: utmMedium,
      message: `Submitted form from ${pageUrl} - Campaign: ${utmCampaign}`
    };

    // Clean up undefined properties
    Object.keys(properties).forEach(key => {
      if (properties[key] === undefined) delete properties[key];
    });

    // We can use the Contacts API to upsert (create or update based on email)
    // Actually, HubSpot offers a specific endpoint for upserting by email: 
    // POST /crm/v3/objects/contacts/search to find, then PATCH, or just use forms API.
    // For this assignment, we'll try to find by email and then create/update.
    
    let hubspotContactId;
    const searchRes = await hubspotApi(wixInstanceId, `/crm/v3/objects/contacts/search`, {
      method: 'POST',
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }]
      })
    });
    
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.total > 0) {
        hubspotContactId = searchData.results[0].id;
      }
    }

    let endpoint = '/crm/v3/objects/contacts';
    let method = 'POST';
    
    if (hubspotContactId) {
      endpoint = `/crm/v3/objects/contacts/${hubspotContactId}`;
      method = 'PATCH';
    }

    const res = await hubspotApi(wixInstanceId, endpoint, {
      method,
      body: JSON.stringify({ properties })
    });

    if (!res.ok) {
      console.error('HubSpot Form Capture Error:', await res.text());
      return NextResponse.json({ error: 'Failed to push to HubSpot' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Wix form webhook error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
