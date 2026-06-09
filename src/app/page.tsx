'use client';

import { useEffect, useState } from 'react';

type Mapping = {
  wixField: string;
  hubspotProperty: string;
  direction: 'WIX_TO_HUBSPOT' | 'HUBSPOT_TO_WIX' | 'BIDIRECTIONAL';
};

export default function Dashboard() {
  const [instanceId, setInstanceId] = useState<string>('test-instance-123'); // Default for local dev
  const [hubspotProperties, setHubspotProperties] = useState<{name: string, label: string}[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connected, setConnected] = useState(false);

  const wixFields = [
    { name: 'name.first', label: 'First Name' },
    { name: 'name.last', label: 'Last Name' },
    { name: 'emails[0].email', label: 'Email' },
    { name: 'phones[0].phone', label: 'Phone' },
    { name: 'company', label: 'Company' },
  ];

  useEffect(() => {
    // In a real Wix app, you would initialize the Wix SDK here to get the instance ID.
    const urlParams = new URLSearchParams(window.location.search);
    const inst = urlParams.get('instanceId') || 'test-instance-123';
    setInstanceId(inst);
    
    fetchData(inst);
  }, []);

  const fetchData = async (inst: string) => {
    try {
      setLoading(true);
      // Fetch mappings
      const mapRes = await fetch(`/api/mappings?instanceId=${inst}`);
      const mapData = await mapRes.json();
      if (mapData.mappings) {
        setMappings(mapData.mappings);
      }

      // Fetch HubSpot properties
      const propRes = await fetch(`/api/hubspot/properties?instanceId=${inst}`);
      if (propRes.ok) {
        setConnected(true);
        const propData = await propRes.json();
        setHubspotProperties(propData.properties || []);
      } else {
        setConnected(false);
      }
    } catch (e) {
      console.error('Failed to fetch data', e);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectHubSpot = () => {
    window.location.href = `/api/auth/hubspot?instanceId=${instanceId}`;
  };

  const addMapping = () => {
    setMappings([...mappings, { wixField: '', hubspotProperty: '', direction: 'WIX_TO_HUBSPOT' }]);
  };

  const updateMapping = (index: number, field: keyof Mapping, value: string) => {
    const newMappings = [...mappings];
    newMappings[index][field] = value as any;
    setMappings(newMappings);
  };

  const removeMapping = (index: number) => {
    setMappings(mappings.filter((_, i) => i !== index));
  };

  const saveMappings = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wixInstanceId: instanceId, mappings }),
      });
      if (res.ok) {
        alert('Mappings saved successfully!');
      } else {
        alert('Failed to save mappings.');
      }
    } catch (e) {
      alert('Error saving mappings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Loading dashboard...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-md overflow-hidden">
        <div className="p-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Wix ↔ HubSpot Integration</h1>
            <div className="text-sm text-gray-500">Instance: {instanceId}</div>
          </div>

          {!connected ? (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-yellow-800">HubSpot Not Connected</h3>
                  <p className="mt-2 text-sm text-yellow-700">Please connect your HubSpot account to enable sync.</p>
                </div>
                <button
                  onClick={handleConnectHubSpot}
                  className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded"
                >
                  Connect HubSpot
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="bg-green-50 border-l-4 border-green-400 p-4 mb-8">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-green-700 font-medium">HubSpot Connected Successfully</p>
                  </div>
                </div>
              </div>

              <h2 className="text-xl font-semibold mb-4 text-gray-800">Field Mappings</h2>
              <p className="text-gray-600 mb-4">Map your Wix contact fields to HubSpot properties to keep them in sync.</p>
              
              <div className="space-y-4 mb-6">
                {mappings.map((mapping, idx) => (
                  <div key={idx} className="flex gap-4 items-end bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Wix Field</label>
                      <select
                        value={mapping.wixField}
                        onChange={(e) => updateMapping(idx, 'wixField', e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 bg-white text-black"
                      >
                        <option value="">Select a field...</option>
                        {wixFields.map((f) => (
                          <option key={f.name} value={f.name}>{f.label} ({f.name})</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">HubSpot Property</label>
                      <select
                        value={mapping.hubspotProperty}
                        onChange={(e) => updateMapping(idx, 'hubspotProperty', e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 bg-white text-black"
                      >
                        <option value="">Select a property...</option>
                        {hubspotProperties.map((p) => (
                          <option key={p.name} value={p.name}>{p.label} ({p.name})</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Sync Direction</label>
                      <select
                        value={mapping.direction}
                        onChange={(e) => updateMapping(idx, 'direction', e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 bg-white text-black"
                      >
                        <option value="WIX_TO_HUBSPOT">Wix → HubSpot</option>
                        <option value="HUBSPOT_TO_WIX">HubSpot → Wix</option>
                        <option value="BIDIRECTIONAL">Bi-directional</option>
                      </select>
                    </div>

                    <button
                      onClick={() => removeMapping(idx)}
                      className="bg-red-100 text-red-600 hover:bg-red-200 p-2 rounded-md font-medium text-sm"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-4">
                <button
                  onClick={addMapping}
                  className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 py-2 px-4 rounded-md shadow-sm text-sm font-medium"
                >
                  + Add Mapping
                </button>
                <button
                  onClick={saveMappings}
                  disabled={saving}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-md shadow-sm text-sm font-medium disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save All Mappings'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
