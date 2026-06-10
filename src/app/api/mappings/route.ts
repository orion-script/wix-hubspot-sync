import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const wixInstanceId = searchParams.get('instanceId');
  if (!wixInstanceId) return NextResponse.json({ mappings: [] });

  const db = await getDb();
  const mappings = await db.all(
    'SELECT id, wixField, hubspotProperty, direction, transform FROM mappings WHERE wixInstanceId = ?',
    [wixInstanceId]
  );
  return NextResponse.json({ mappings });
}

export async function POST(request: NextRequest) {
  try {
    const { wixInstanceId, mappings } = await request.json();
    if (!wixInstanceId || !Array.isArray(mappings)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Validate: no duplicate HubSpot property per instance
    const hsProps = mappings.filter((m: any) => m.hubspotProperty).map((m: any) => m.hubspotProperty);
    const duplicates = hsProps.filter((p: string, i: number) => hsProps.indexOf(p) !== i);
    if (duplicates.length > 0) {
      return NextResponse.json(
        { error: `Duplicate HubSpot property: "${duplicates[0]}"` },
        { status: 422 }
      );
    }

    const db = await getDb();
    await db.run('DELETE FROM mappings WHERE wixInstanceId = ?', [wixInstanceId]);

    const stmt = await db.prepare(
      'INSERT INTO mappings (wixInstanceId, wixField, hubspotProperty, direction, transform) VALUES (?, ?, ?, ?, ?)'
    );
    for (const m of mappings) {
      if (m.wixField && m.hubspotProperty) {
        await stmt.run(wixInstanceId, m.wixField, m.hubspotProperty, m.direction, m.transform || 'none');
      }
    }
    await stmt.finalize();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Mappings save error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
