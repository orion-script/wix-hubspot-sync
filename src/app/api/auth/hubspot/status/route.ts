import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET: Check connection status
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const wixInstanceId = searchParams.get('instanceId');

  if (!wixInstanceId) {
    return NextResponse.json({ connected: false });
  }

  const db = await getDb();
  const row = await db.get(
    'SELECT wixInstanceId, hubspotPortalId FROM connections WHERE wixInstanceId = ?',
    [wixInstanceId]
  );

  return NextResponse.json({ connected: !!row, portalId: row?.hubspotPortalId });
}

// DELETE: Disconnect HubSpot
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const wixInstanceId = searchParams.get('instanceId');

  if (!wixInstanceId) {
    return NextResponse.json({ error: 'Missing instanceId' }, { status: 400 });
  }

  const db = await getDb();
  await db.run('DELETE FROM connections WHERE wixInstanceId = ?', [wixInstanceId]);
  await db.run('DELETE FROM mappings WHERE wixInstanceId = ?', [wixInstanceId]);

  return NextResponse.json({ success: true });
}
