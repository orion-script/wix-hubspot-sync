import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// Get current mappings
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const wixInstanceId = searchParams.get('instanceId');

  if (!wixInstanceId) {
    return NextResponse.json({ error: 'Missing instanceId' }, { status: 400 });
  }

  const db = await getDb();
  const mappings = await db.all('SELECT * FROM mappings WHERE wixInstanceId = ?', [wixInstanceId]);

  return NextResponse.json({ mappings });
}

// Save mappings
export async function POST(request: NextRequest) {
  try {
    const { wixInstanceId, mappings } = await request.json();

    if (!wixInstanceId || !Array.isArray(mappings)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const db = await getDb();
    
    // Simplest approach: Delete existing mappings for this instance and insert new ones
    await db.run('DELETE FROM mappings WHERE wixInstanceId = ?', [wixInstanceId]);

    const stmt = await db.prepare('INSERT INTO mappings (wixInstanceId, wixField, hubspotProperty, direction) VALUES (?, ?, ?, ?)');
    for (const mapping of mappings) {
      await stmt.run(wixInstanceId, mapping.wixField, mapping.hubspotProperty, mapping.direction);
    }
    await stmt.finalize();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save mappings:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
