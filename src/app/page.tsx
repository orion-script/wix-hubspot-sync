'use client';

import { useEffect, useState, useCallback } from 'react';

type Mapping = {
  id?: number;
  wixField: string;
  hubspotProperty: string;
  direction: 'WIX_TO_HUBSPOT' | 'HUBSPOT_TO_WIX' | 'BIDIRECTIONAL';
  transform: 'none' | 'trim' | 'lowercase' | 'trim_lowercase';
};

const TRANSFORM_LABELS: Record<string, string> = {
  none:           'No transform',
  trim:           'Trim whitespace',
  lowercase:      'Lowercase',
  trim_lowercase: 'Trim + Lowercase',
};

type HubSpotProperty = { name: string; label: string };

const WIX_FIELDS = [
  { name: 'name.first', label: 'First Name' },
  { name: 'name.last', label: 'Last Name' },
  { name: 'emails[0].email', label: 'Email' },
  { name: 'phones[0].phone', label: 'Phone' },
  { name: 'company', label: 'Company' },
  { name: 'addresses[0].addressLine', label: 'Street Address' },
  { name: 'addresses[0].city', label: 'City' },
  { name: 'addresses[0].country', label: 'Country' },
];

const DIRECTION_LABELS: Record<Mapping['direction'], string> = {
  WIX_TO_HUBSPOT: 'Wix → HubSpot',
  HUBSPOT_TO_WIX: 'HubSpot → Wix',
  BIDIRECTIONAL: '⇄ Bi-directional',
};

export default function Dashboard() {
  const [instanceId, setInstanceId] = useState('test-instance-123');
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [hubspotProperties, setHubspotProperties] = useState<HubSpotProperty[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const fetchData = useCallback(async (inst: string) => {
    setLoading(true);
    try {
      // Fetch mappings
      const mapRes = await fetch(`/api/mappings?instanceId=${inst}`);
      const mapData = await mapRes.json();
      if (mapData.mappings?.length) setMappings(mapData.mappings);

      // Fetch HubSpot properties to check connection + populate dropdowns
      const propRes = await fetch(`/api/hubspot/properties?instanceId=${inst}`);
      if (propRes.ok) {
        setConnected(true);
        const propData = await propRes.json();
        setHubspotProperties(propData.properties || []);
                if (!mapData.mappings?.length) {
          setMappings([
            { wixField: 'name.first',       hubspotProperty: 'firstname', direction: 'BIDIRECTIONAL', transform: 'none' },
            { wixField: 'name.last',        hubspotProperty: 'lastname',  direction: 'BIDIRECTIONAL', transform: 'none' },
            { wixField: 'emails[0].email',  hubspotProperty: 'email',     direction: 'BIDIRECTIONAL', transform: 'trim_lowercase' },
            { wixField: 'phones[0].phone',  hubspotProperty: 'phone',     direction: 'BIDIRECTIONAL', transform: 'trim' },
          ]);
        }
      } else {
        setConnected(false);
      }
    } catch (e) {
      console.error('Failed to fetch data', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const inst = urlParams.get('instanceId') || 'test-instance-123';
    setInstanceId(inst);
    fetchData(inst);
  }, [fetchData]);

  const handleConnectHubSpot = () => {
    window.location.href = `/api/auth/hubspot?instanceId=${instanceId}`;
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect HubSpot? All mappings will be deleted.')) return;
    setDisconnecting(true);
    try {
      await fetch(`/api/auth/hubspot/status?instanceId=${instanceId}`, { method: 'DELETE' });
      setConnected(false);
      setMappings([]);
      setHubspotProperties([]);
    } finally {
      setDisconnecting(false);
    }
  };

  const addMapping = () => {
    setMappings(prev => [...prev, { wixField: '', hubspotProperty: '', direction: 'BIDIRECTIONAL', transform: 'none' }]);
  };

  const updateMapping = (index: number, field: keyof Mapping, value: string) => {
    setMappings(prev => prev.map((m, i) => i === index ? { ...m, [field]: value } : m));
  };

  const removeMapping = (index: number) => {
    setMappings(prev => prev.filter((_, i) => i !== index));
  };

  const saveMappings = async () => {
    // Validate: no duplicate HubSpot property
    const hsProps = mappings.filter(m => m.hubspotProperty).map(m => m.hubspotProperty);
    const duplicates = hsProps.filter((p, i) => hsProps.indexOf(p) !== i);
    if (duplicates.length > 0) {
      alert(`Duplicate HubSpot property detected: "${duplicates[0]}". Each HubSpot property can only be mapped once.`);
      return;
    }

    setSaving(true);
    setSaveStatus('idle');
    try {
      const res = await fetch('/api/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wixInstanceId: instanceId, mappings }),
      });
      setSaveStatus(res.ok ? 'success' : 'error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-lg">
              W↔H
            </div>
            <div>
              <h1 className="text-base font-semibold text-white">Wix ↔ HubSpot Sync</h1>
              <p className="text-xs text-slate-400">Instance: {instanceId}</p>
            </div>
          </div>
          {connected && (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-3 py-1 text-xs font-medium">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                HubSpot Connected
              </span>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="cursor-pointer text-xs text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-500/40 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {!connected ? (
          /* ── CONNECT PANEL ── */
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-orange-500/20 to-orange-600/10 border border-orange-500/20 rounded-2xl flex items-center justify-center text-4xl">
              🔗
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Connect Your HubSpot Account</h2>
              <p className="text-slate-400 max-w-md">
                Link your HubSpot CRM to automatically sync contacts, capture form leads, and keep your data in sync — in real time.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 max-w-lg w-full my-2">
              {[
                { icon: '🔄', label: 'Bi-directional contact sync' },
                { icon: '🛡️', label: 'Secure OAuth 2.0 connection' },
                { icon: '🎯', label: 'UTM & lead attribution' },
              ].map(f => (
                <div key={f.label} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 text-center">
                  <div className="text-2xl mb-2">{f.icon}</div>
                  <p className="text-xs text-slate-400">{f.label}</p>
                </div>
              ))}
            </div>
            <button
              onClick={handleConnectHubSpot}
              className="cursor-pointer bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-semibold px-8 py-3.5 rounded-xl shadow-lg shadow-orange-500/20 transition-all hover:scale-105 active:scale-100"
            >
              Connect HubSpot →
            </button>
          </div>
        ) : (
          /* ── CONNECTED: FIELD MAPPING UI ── */
          <div className="space-y-8">
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Active Mappings', value: mappings.filter(m => m.wixField && m.hubspotProperty).length, icon: '🗂️' },
                { label: 'Sync Direction', value: 'Bi-directional', icon: '🔄' },
                { label: 'HubSpot Properties', value: hubspotProperties.length, icon: '📊' },
              ].map(stat => (
                <div key={stat.label} className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-5">
                  <div className="text-2xl mb-2">{stat.icon}</div>
                  <p className="text-2xl font-bold text-white">{stat.value}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Field Mapping Table */}
            <div className="bg-slate-800/60 border border-slate-700/40 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-700/40">
                <div>
                  <h2 className="text-base font-semibold text-white">Field Mappings</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Map Wix contact fields to HubSpot properties</p>
                </div>
                <button
                  onClick={addMapping}
                  className="cursor-pointer text-xs bg-slate-700 hover:bg-slate-600 text-white border border-slate-600 rounded-lg px-4 py-2 transition-colors font-medium"
                >
                  + Add Row
                </button>
              </div>

              {/* Table Header */}
              <div className="grid grid-cols-[1fr_1fr_160px_160px_36px] gap-3 px-6 py-3 bg-slate-900/40 border-b border-slate-700/30">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Wix Field</span>
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">HubSpot Property</span>
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Direction</span>
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Transform</span>
                <span />
              </div>

              {/* Rows */}
              <div className="divide-y divide-slate-700/30">
                {mappings.length === 0 ? (
                  <div className="px-6 py-10 text-center text-slate-500 text-sm">
                    No mappings yet. Click "+ Add Row" to get started.
                  </div>
                ) : (
                  mappings.map((mapping, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_1fr_160px_160px_36px] gap-3 items-center px-6 py-3.5 hover:bg-slate-700/20 transition-colors">
                      <select
                        value={mapping.wixField}
                        onChange={e => updateMapping(idx, 'wixField', e.target.value)}
                        className="cursor-pointer bg-slate-900/60 border border-slate-700/60 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500/60 transition-colors"
                      >
                        <option value="">Select Wix field...</option>
                        {WIX_FIELDS.map(f => (
                          <option key={f.name} value={f.name}>{f.label}</option>
                        ))}
                      </select>

                      <select
                        value={mapping.hubspotProperty}
                        onChange={e => updateMapping(idx, 'hubspotProperty', e.target.value)}
                        className="cursor-pointer bg-slate-900/60 border border-slate-700/60 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500/60 transition-colors"
                      >
                        <option value="">Select HubSpot property...</option>
                        {hubspotProperties.map(p => (
                          <option key={p.name} value={p.name}>{p.label} ({p.name})</option>
                        ))}
                      </select>

                      <select
                        value={mapping.direction}
                        onChange={e => updateMapping(idx, 'direction', e.target.value as Mapping['direction'])}
                        className="cursor-pointer bg-slate-900/60 border border-slate-700/60 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500/60 transition-colors"
                      >
                        {Object.entries(DIRECTION_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>

                      <select
                        value={mapping.transform}
                        onChange={e => updateMapping(idx, 'transform', e.target.value)}
                        className="cursor-pointer bg-slate-900/60 border border-slate-700/60 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500/60 transition-colors"
                      >
                        {Object.entries(TRANSFORM_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>

                      <button
                        onClick={() => removeMapping(idx)}
                        className="cursor-pointer text-slate-500 hover:text-red-400 transition-colors text-lg leading-none"
                        title="Remove mapping"
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-700/40 flex items-center justify-between bg-slate-900/20">
                <p className="text-xs text-slate-500">
                  {mappings.filter(m => m.wixField && m.hubspotProperty).length} of {mappings.length} mappings configured
                </p>
                <div className="flex items-center gap-3">
                  {saveStatus === 'success' && (
                    <span className="text-xs text-emerald-400 font-medium">✓ Mappings saved!</span>
                  )}
                  {saveStatus === 'error' && (
                    <span className="text-xs text-red-400 font-medium">✗ Save failed. Try again.</span>
                  )}
                  <button
                    onClick={saveMappings}
                    disabled={saving}
                    className="cursor-pointer bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-6 py-2.5 rounded-xl shadow-lg shadow-orange-500/20 transition-all hover:scale-105 active:scale-100 disabled:scale-100"
                  >
                    {saving ? 'Saving...' : 'Save Mappings'}
                  </button>
                </div>
              </div>
            </div>

            {/* Webhook Info */}
            <div className="bg-slate-800/40 border border-slate-700/30 rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-semibold text-white">Webhook Endpoints</h3>
              <p className="text-xs text-slate-400">Register these URLs in your Wix Developer Center and HubSpot App settings to enable live sync:</p>
              <div className="space-y-2">
                {[
                  { label: 'Wix Contact Created/Updated', url: '/api/webhooks/wix/contact' },
                  { label: 'Wix Form Submitted', url: '/api/webhooks/wix/form' },
                  { label: 'HubSpot Contact Created/Updated', url: '/api/webhooks/hubspot/contact' },
                ].map(wh => (
                  <div key={wh.url} className="flex items-center justify-between bg-slate-900/50 rounded-lg px-4 py-3 border border-slate-700/30">
                    <div>
                      <p className="text-xs font-medium text-slate-300">{wh.label}</p>
                      <code className="text-xs text-orange-400">{`https://your-app.com${wh.url}`}</code>
                    </div>
                    <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-2 py-0.5">POST</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
