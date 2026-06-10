import { getDb } from './db';
import { hubspotApi } from './hubspot';
import { hashProps } from './crypto';
import {
  findWixContactByEmail,
  createWixContact,
  updateWixContact,
  buildWixPayload,
} from './wix';

/** Apply field transform based on mapping config */
function applyTransform(value: string, transform: string): string {
  switch (transform) {
    case 'trim':          return value.trim();
    case 'lowercase':     return value.toLowerCase();
    case 'trim_lowercase':return value.trim().toLowerCase();
    default:              return value;
  }
}

/** Extract a value from a nested object using a dot/bracket path like 'emails[0].email' */
function extractByPath(obj: any, path: string): string | undefined {
  let val = obj;
  for (const part of path.split('.')) {
    if (!val) return undefined;
    const arrayMatch = part.match(/^(.*)\[(\d+)\]$/);
    if (arrayMatch) {
      val = val[arrayMatch[1]]?.[parseInt(arrayMatch[2], 10)];
    } else {
      val = val[part];
    }
  }
  return val !== undefined ? String(val) : undefined;
}

// Wix → HubSpot
export async function syncWixToHubSpot(
  wixInstanceId: string,
  wixContactId: string,
  wixContactData: any,
  wixUpdatedAt: number = Date.now()
) {
  const db = await getDb();

    const syncState = await db.get(
    'SELECT * FROM sync_state WHERE wixContactId = ? AND wixInstanceId = ?',
    [wixContactId, wixInstanceId]
  );

  if (syncState?.lastSource === 'HUBSPOT_TO_WIX') {
    if (Date.now() - syncState.lastSyncedAt < 15000) {
      console.log('[Sync] Skipping Wix→HS echo (within dedup window)');
      return;
    }
  }

    if (syncState && wixUpdatedAt < syncState.hsUpdatedAt) {
    console.log('[Sync] Skipping Wix→HS: HubSpot version is newer');
    return;
  }

    const mappings = await db.all(
    `SELECT wixField, hubspotProperty, transform
     FROM mappings
     WHERE wixInstanceId = ? AND direction IN ('WIX_TO_HUBSPOT', 'BIDIRECTIONAL')`,
    [wixInstanceId]
  );
  if (mappings.length === 0) return;

    const properties: Record<string, string> = {};
  for (const m of mappings) {
    const raw = extractByPath(wixContactData, m.wixField);
    if (raw !== undefined) {
      properties[m.hubspotProperty] = applyTransform(raw, m.transform || 'none');
    }
  }
  if (Object.keys(properties).length === 0) return;

    const newHash = hashProps(properties);
  if (syncState?.lastWixHash === newHash) {
    console.log('[Sync] Skipping Wix→HS: values unchanged (idempotent)');
    return;
  }

    let hubspotContactId: string | undefined = syncState?.hubspotContactId;

  if (!hubspotContactId && properties.email) {
    const searchRes = await hubspotApi(wixInstanceId, '/crm/v3/objects/contacts/search', {
      method: 'POST',
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: properties.email }] }],
      }),
    });
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.total > 0) hubspotContactId = searchData.results[0].id;
    }
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
    console.error('[Sync] HubSpot upsert failed:', await res.text());
    return;
  }

  const data = await res.json();
  hubspotContactId = data.id;

    await db.run(
    `INSERT INTO sync_state
       (wixContactId, hubspotContactId, wixInstanceId, lastSyncedAt, lastSource, wixUpdatedAt, lastWixHash)
     VALUES (?, ?, ?, ?, 'WIX_TO_HUBSPOT', ?, ?)
     ON CONFLICT(wixContactId, hubspotContactId) DO UPDATE SET
       lastSyncedAt  = excluded.lastSyncedAt,
       lastSource    = excluded.lastSource,
       wixUpdatedAt  = excluded.wixUpdatedAt,
       lastWixHash   = excluded.lastWixHash`,
    [wixContactId, hubspotContactId, wixInstanceId, Date.now(), wixUpdatedAt, newHash]
  );

  console.log(`[Sync] Wix→HubSpot complete: wix=${wixContactId} → hs=${hubspotContactId}`);
}

// HubSpot → Wix
export async function syncHubSpotToWix(
  wixInstanceId: string,
  hubspotContactId: string,
  hubspotProperties: Record<string, string>,
  hsUpdatedAt: number = Date.now()
) {
  const db = await getDb();

    const syncState = await db.get(
    'SELECT * FROM sync_state WHERE hubspotContactId = ? AND wixInstanceId = ?',
    [hubspotContactId, wixInstanceId]
  );

  if (syncState?.lastSource === 'WIX_TO_HUBSPOT') {
    if (Date.now() - syncState.lastSyncedAt < 15000) {
      console.log('[Sync] Skipping HS→Wix echo (within dedup window)');
      return;
    }
  }

    if (syncState && hsUpdatedAt < syncState.wixUpdatedAt) {
    console.log('[Sync] Skipping HS→Wix: Wix version is newer');
    return;
  }

    const mappings = await db.all(
    `SELECT wixField, hubspotProperty, transform
     FROM mappings
     WHERE wixInstanceId = ? AND direction IN ('HUBSPOT_TO_WIX', 'BIDIRECTIONAL')`,
    [wixInstanceId]
  );
  if (mappings.length === 0) return;

    const wixFieldMap: Record<string, string> = {};
  for (const m of mappings) {
    if (hubspotProperties[m.hubspotProperty] !== undefined) {
      wixFieldMap[m.wixField] = applyTransform(hubspotProperties[m.hubspotProperty], m.transform || 'none');
    }
  }
  if (Object.keys(wixFieldMap).length === 0) return;

    const newHash = hashProps(wixFieldMap);
  if (syncState?.lastHsHash === newHash) {
    console.log('[Sync] Skipping HS→Wix: values unchanged (idempotent)');
    return;
  }

    const payload = buildWixPayload(wixFieldMap);
  let wixContactId: string | undefined = syncState?.wixContactId;

  if (wixContactId) {
    await updateWixContact(wixContactId, payload);
  } else {
    // Try to find by email first
    const email = wixFieldMap['emails[0].email'];
    if (email) wixContactId = (await findWixContactByEmail(email)) ?? undefined;

    if (wixContactId) {
      await updateWixContact(wixContactId, payload);
    } else {
      wixContactId = (await createWixContact(payload)) ?? undefined;
    }
  }

  if (!wixContactId) {
    console.error('[Sync] Failed to upsert Wix contact');
    return;
  }

    await db.run(
    `INSERT INTO sync_state
       (wixContactId, hubspotContactId, wixInstanceId, lastSyncedAt, lastSource, hsUpdatedAt, lastHsHash)
     VALUES (?, ?, ?, ?, 'HUBSPOT_TO_WIX', ?, ?)
     ON CONFLICT(wixContactId, hubspotContactId) DO UPDATE SET
       lastSyncedAt = excluded.lastSyncedAt,
       lastSource   = excluded.lastSource,
       hsUpdatedAt  = excluded.hsUpdatedAt,
       lastHsHash   = excluded.lastHsHash`,
    [wixContactId, hubspotContactId, wixInstanceId, Date.now(), hsUpdatedAt, newHash]
  );

  console.log(`[Sync] HubSpot→Wix complete: hs=${hubspotContactId} → wix=${wixContactId}`);
}
