/**
 * Wix Contacts API client using Wix API Keys (server-side only).
 * Docs: https://dev.wix.com/docs/rest/crm/contacts/contacts/contacts/create-or-update-contact
 */

const WIX_API_KEY = process.env.WIX_API_KEY!;
const WIX_SITE_ID = process.env.WIX_SITE_ID!;
const WIX_BASE = 'https://www.wixapis.com';

async function wixRequest(endpoint: string, options: RequestInit = {}) {
  return fetch(`${WIX_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: WIX_API_KEY,
      'wix-site-id': WIX_SITE_ID,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Finds a Wix contact by email. Returns the contactId or null.
 */
export async function findWixContactByEmail(email: string): Promise<string | null> {
  const res = await wixRequest('/contacts/v4/contacts/query', {
    method: 'POST',
    body: JSON.stringify({
      query: {
        filter: { 'info.emails.email': { $eq: email } },
        paging: { limit: 1 },
      },
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.contacts?.[0]?.id ?? null;
}

/**
 * Creates a new Wix contact. Returns the contactId or null.
 */
export async function createWixContact(payload: WixContactPayload): Promise<string | null> {
  const res = await wixRequest('/contacts/v4/contacts', {
    method: 'POST',
    body: JSON.stringify({ info: payload }),
  });
  if (!res.ok) {
    console.error('Wix createContact failed:', await res.text());
    return null;
  }
  const data = await res.json();
  return data.contact?.id ?? null;
}

/**
 * Updates an existing Wix contact by contactId.
 */
export async function updateWixContact(contactId: string, payload: WixContactPayload): Promise<boolean> {
  const res = await wixRequest(`/contacts/v4/contacts/${contactId}`, {
    method: 'PATCH',
    body: JSON.stringify({ info: payload, revision: '1' }),
  });
  if (!res.ok) {
    console.error('Wix updateContact failed:', await res.text());
    return false;
  }
  return true;
}

export type WixContactPayload = {
  name?: { first?: string; last?: string };
  emails?: { email: string; tag?: string }[];
  phones?: { phone: string; tag?: string }[];
  company?: string;
  [key: string]: any;
};

/**
 * Converts a flat HubSpot → Wix field path map to a WixContactPayload.
 * e.g. { 'name.first': 'John', 'emails[0].email': 'a@b.com' }
 */
export function buildWixPayload(fieldMap: Record<string, string>): WixContactPayload {
  const payload: WixContactPayload = {};
  for (const [wixPath, value] of Object.entries(fieldMap)) {
    if (wixPath === 'name.first') {
      payload.name = { ...(payload.name || {}), first: value };
    } else if (wixPath === 'name.last') {
      payload.name = { ...(payload.name || {}), last: value };
    } else if (wixPath === 'emails[0].email') {
      payload.emails = [{ email: value, tag: 'MAIN' }];
    } else if (wixPath === 'phones[0].phone') {
      payload.phones = [{ phone: value, tag: 'MAIN' }];
    } else if (wixPath === 'company') {
      payload.company = value;
    }
  }
  return payload;
}
