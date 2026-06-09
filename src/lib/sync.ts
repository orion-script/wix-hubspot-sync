import { getDb } from './db';
import { hubspotApi } from './hubspot';

export async function syncWixToHubSpot(wixInstanceId: string, wixContactId: string, wixContactData: any) {
  const db = await getDb();

  // 1. Check infinite loop: Did we just update this contact from HubSpot?
  const syncState = await db.get(
    'SELECT lastSyncedAt, lastSource FROM sync_state WHERE wixContactId = ? AND wixInstanceId = ?',
    [wixContactId, wixInstanceId]
  );
  
  if (syncState && syncState.lastSource === 'HUBSPOT_TO_WIX') {
    // If it was synced very recently (e.g. last 10 seconds), ignore this echo
    if (Date.now() - syncState.lastSyncedAt < 10000) {
      console.log('Ignoring echo from HubSpot to Wix sync.');
      return;
    }
  }

  // 2. Load mappings
  const mappings = await db.all(
    "SELECT wixField, hubspotProperty FROM mappings WHERE wixInstanceId = ? AND direction IN ('WIX_TO_HUBSPOT', 'BIDIRECTIONAL')",
    [wixInstanceId]
  );

  if (mappings.length === 0) return;

  // 3. Translate properties
  const properties: Record<string, string> = {};
  for (const m of mappings) {
    // Basic extraction (handling simple and basic array paths like emails[0].email)
    let val = wixContactData;
    const parts = m.wixField.split('.');
    for (const part of parts) {
      if (!val) break;
      const arrayMatch = part.match(/(.*)\[(\d+)\]/);
      if (arrayMatch) {
        const arrName = arrayMatch[1];
        const arrIdx = parseInt(arrayMatch[2], 10);
        val = val[arrName] ? val[arrName][arrIdx] : undefined;
      } else {
        val = val[part];
      }
    }
    if (val !== undefined) {
      properties[m.hubspotProperty] = String(val);
    }
  }

  // If no properties to sync, skip
  if (Object.keys(properties).length === 0) return;

  // 4. Upsert to HubSpot
  let hubspotContactId = syncState?.hubspotContactId;
  
  // If we don't know the hubspotContactId, we try to create, or search by email first
  if (!hubspotContactId && properties.email) {
    const searchRes = await hubspotApi(wixInstanceId, `/crm/v3/objects/contacts/search`, {
      method: 'POST',
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: properties.email }] }]
      })
    });
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.total > 0) {
        hubspotContactId = searchData.results[0].id;
      }
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
    console.error('HubSpot Sync Error:', await res.text());
    return;
  }

  const data = await res.json();
  hubspotContactId = data.id;

  // 5. Update Sync State
  await db.run(
    `INSERT INTO sync_state (wixContactId, hubspotContactId, wixInstanceId, lastSyncedAt, lastSource)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(wixContactId, hubspotContactId) DO UPDATE SET
     lastSyncedAt=excluded.lastSyncedAt, lastSource=excluded.lastSource`,
    [wixContactId, hubspotContactId, wixInstanceId, Date.now(), 'WIX_TO_HUBSPOT']
  );
}

export async function syncHubSpotToWix(wixInstanceId: string, hubspotContactId: string, hubspotProperties: any) {
  const db = await getDb();

  // 1. Check infinite loop
  const syncState = await db.get(
    'SELECT wixContactId, lastSyncedAt, lastSource FROM sync_state WHERE hubspotContactId = ? AND wixInstanceId = ?',
    [hubspotContactId, wixInstanceId]
  );
  
  if (syncState && syncState.lastSource === 'WIX_TO_HUBSPOT') {
    if (Date.now() - syncState.lastSyncedAt < 10000) {
      console.log('Ignoring echo from Wix to HubSpot sync.');
      return;
    }
  }

  // 2. Load mappings
  const mappings = await db.all(
    "SELECT wixField, hubspotProperty FROM mappings WHERE wixInstanceId = ? AND direction IN ('HUBSPOT_TO_WIX', 'BIDIRECTIONAL')",
    [wixInstanceId]
  );

  if (mappings.length === 0) return;

  // 3. Translate properties
  const wixPayload: any = {};
  for (const m of mappings) {
    if (hubspotProperties[m.hubspotProperty] !== undefined) {
      // Very basic structural build for Wix based on the path
      const parts = m.wixField.split('.');
      if (parts[0] === 'emails' && parts[1] === '[0].email') {
        wixPayload.emails = wixPayload.emails || [];
        wixPayload.emails[0] = { email: hubspotProperties[m.hubspotProperty], tag: 'MAIN' };
      } else if (parts[0] === 'phones' && parts[1] === '[0].phone') {
        wixPayload.phones = wixPayload.phones || [];
        wixPayload.phones[0] = { phone: hubspotProperties[m.hubspotProperty], tag: 'MAIN' };
      } else if (parts[0] === 'name') {
        wixPayload.name = wixPayload.name || {};
        if (parts[1] === 'first') wixPayload.name.first = hubspotProperties[m.hubspotProperty];
        if (parts[1] === 'last') wixPayload.name.last = hubspotProperties[m.hubspotProperty];
      } else {
        wixPayload[m.wixField] = hubspotProperties[m.hubspotProperty];
      }
    }
  }

  if (Object.keys(wixPayload).length === 0) return;

  // 4. Upsert to Wix
  // In a real app we'd use Wix SDK with wixInstanceId / offline token.
  // Here we mock the API request to Wix since we don't have the real Wix credentials/SDK configured.
  let wixContactId = syncState?.wixContactId;

  console.log('Mock: Syncing to Wix Contact API:', { wixContactId, payload: wixPayload });
  if (!wixContactId) {
    // Mock creating a wix contact ID
    wixContactId = 'wix-c-' + Math.random().toString(36).substring(7);
  }

  // 5. Update Sync State
  await db.run(
    `INSERT INTO sync_state (wixContactId, hubspotContactId, wixInstanceId, lastSyncedAt, lastSource)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(wixContactId, hubspotContactId) DO UPDATE SET
     lastSyncedAt=excluded.lastSyncedAt, lastSource=excluded.lastSource`,
    [wixContactId, hubspotContactId, wixInstanceId, Date.now(), 'HUBSPOT_TO_WIX']
  );
}
