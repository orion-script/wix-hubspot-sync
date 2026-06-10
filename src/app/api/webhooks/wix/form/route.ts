import { NextRequest, NextResponse } from 'next/server';
import { hubspotApi } from '@/lib/hubspot';
import { verifyHmac } from '@/lib/crypto';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

        const wixSignature = request.headers.get('x-wix-signature') || '';
    const wixWebhookSecret = process.env.WIX_WEBHOOK_SECRET || '';
    if (wixWebhookSecret && wixSignature) {
      if (!verifyHmac(wixWebhookSecret, rawBody, wixSignature)) {
        console.warn('[Webhook] Wix form: invalid signature — rejecting');
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
      }
    }

    const payload = JSON.parse(rawBody);
    const wixInstanceId: string = payload.instanceId;
    const formData = payload.data;

    if (!wixInstanceId || !formData) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

        const fields: { name: string; value: string }[] = formData.fields || [];
    const getField = (names: string[]) =>
      fields.find(f => names.some(n => n.toLowerCase() === f.name.toLowerCase()))?.value || '';

    const email     = getField(['email', 'Email', 'email address']);
    const firstName = getField(['first name', 'firstname', 'first_name', 'name']);
    const lastName  = getField(['last name', 'lastname', 'last_name', 'surname']);

    if (!email) {
      console.warn('[Form] Submission skipped: no email field found');
      return NextResponse.json({ success: true, note: 'no email' });
    }

        const ctx = formData.context || {};
    const utmSource   = ctx.utm_source   || '';
    const utmMedium   = ctx.utm_medium   || '';
    const utmCampaign = ctx.utm_campaign || '';
    const utmTerm     = ctx.utm_term     || '';
    const utmContent  = ctx.utm_content  || '';
    const pageUrl     = ctx.pageUrl      || ctx.page_url || '';
    const referrer    = ctx.referrer     || ctx.referrerUrl || '';
    const submittedAt = new Date(formData.submittedAt || Date.now()).toISOString();

            const properties: Record<string, string> = {
      email,
      ...(firstName && { firstname: firstName }),
      ...(lastName  && { lastname: lastName }),
            hs_analytics_source:        utmSource  ? 'OFFLINE'  : 'DIRECT_TRAFFIC',
      hs_analytics_source_data_1: utmSource,
      hs_analytics_source_data_2: utmMedium,
                  hs_latest_source:           utmSource  || 'Wix Form',
      hs_latest_source_data_1:    utmSource,
      hs_latest_source_data_2:    utmMedium,
            message: [
        `Source: ${utmSource || 'direct'}`,
        `Medium: ${utmMedium || 'none'}`,
        `Campaign: ${utmCampaign || 'none'}`,
        `Term: ${utmTerm || 'none'}`,
        `Content: ${utmContent || 'none'}`,
        `Page: ${pageUrl}`,
        `Referrer: ${referrer}`,
        `Submitted: ${submittedAt}`,
      ].join(' | '),
    };

        for (const k of Object.keys(properties)) {
      if (!properties[k]) delete properties[k];
    }

        let hubspotContactId: string | undefined;
    const searchRes = await hubspotApi(wixInstanceId, '/crm/v3/objects/contacts/search', {
      method: 'POST',
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
      }),
    });

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.total > 0) hubspotContactId = searchData.results[0].id;
    }

    const endpoint = hubspotContactId
      ? `/crm/v3/objects/contacts/${hubspotContactId}`
      : '/crm/v3/objects/contacts';
    const method = hubspotContactId ? 'PATCH' : 'POST';

    const res = await hubspotApi(wixInstanceId, endpoint, {
      method,
      body: JSON.stringify({ properties }),
    });

    if (!res.ok) {
      console.error('[Form] HubSpot upsert failed:', await res.text());
      return NextResponse.json({ error: 'Failed to push to HubSpot' }, { status: 500 });
    }

    const result = await res.json();
    console.log(`[Form] Lead captured → HubSpot contact ${result.id}, utm_source="${utmSource}", page="${pageUrl}"`);

    return NextResponse.json({ success: true, hubspotContactId: result.id });
  } catch (error) {
    console.error('[Webhook] Wix form error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
