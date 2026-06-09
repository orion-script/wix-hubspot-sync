import { NextRequest, NextResponse } from 'next/server';
import { hubspotApi } from '@/lib/hubspot';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const wixInstanceId = searchParams.get('instanceId');

  if (!wixInstanceId) {
    return NextResponse.json({ error: 'Missing instanceId' }, { status: 400 });
  }

  try {
    const response = await hubspotApi(wixInstanceId, '/crm/v3/properties/contacts');
    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch properties from HubSpot' }, { status: response.status });
    }

    const data = await response.json();
    const properties = data.results.map((prop: any) => ({
      name: prop.name,
      label: prop.label,
    }));

    return NextResponse.json({ properties });
  } catch (error) {
    console.error('Properties fetch error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
