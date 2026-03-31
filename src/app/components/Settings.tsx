import React, { useState, useEffect, useCallback } from 'react';
import type { Settings as SettingsType } from '../../shared/types';
import { KeelIcon } from './KeelIcon';

const CLAUDE_MODELS = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
];

const OPENAI_MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-4.1', label: 'GPT-4.1' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
];

const PROVIDERS = [
  { value: 'claude', label: 'Claude', description: 'Anthropic — best reasoning & writing' },
  { value: 'openai', label: 'OpenAI', description: 'GPT models — strong all-rounder' },
  { value: 'openrouter', label: 'OpenRouter', description: 'Any model via OpenRouter or custom endpoint' },
  { value: 'ollama', label: 'Ollama', description: 'Local models — free, private, offline' },
] as const;

interface Props {
  onBack: () => void;
}

export default function Settings({ onBack }: Props) {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleSyncing, setGoogleSyncing] = useState(false);
  const [googleMessage, setGoogleMessage] = useState('');

  useEffect(() => {
    window.keel.getSettings().then(setSettings).catch(() => {});
    window.keel.googleStatus().then((s) => setGoogleConnected(s.connected)).catch(() => {});
  }, []);

  if (!settings) return null;

  const update = (partial: Partial<SettingsType>) => {
    setSettings({ ...settings, ...partial });
    setSaved(false);
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await window.keel.saveSettings(settings);
      setSaved(true);
    } catch {
      // handle error silently
    }
    setSaving(false);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    background: '#252525', border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.9)', fontSize: 14, outline: 'none',
    fontFamily: 'inherit',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle, appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
    paddingRight: 32, cursor: 'pointer',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)',
    marginBottom: 6, display: 'block', textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: 28,
  };

  const toggleKeyVisibility = (key: string) => {
    setShowApiKey((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderApiKeyInput = (
    label: string,
    value: string,
    field: keyof SettingsType,
    keyId: string
  ) => (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={showApiKey[keyId] ? 'text' : 'password'}
          value={value}
          onChange={(e) => update({ [field]: e.target.value })}
          placeholder="sk-..."
          style={{ ...inputStyle, paddingRight: 48 }}
        />
        <button
          onClick={() => toggleKeyVisibility(keyId)}
          style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
            cursor: 'pointer', fontSize: 12, padding: '4px 6px',
          }}
        >
          {showApiKey[keyId] ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)',
            cursor: 'pointer', fontSize: 18, padding: '2px 6px', borderRadius: 6,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.9)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
        >
          ←
        </button>
        <span style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>Settings</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        <div style={{ maxWidth: 480 }}>

          {/* AI Provider */}
          <div style={sectionStyle}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 14 }}>
              AI Provider
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {PROVIDERS.map((p) => (
                <label
                  key={p.value}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px', borderRadius: 10,
                    background: settings.provider === p.value ? 'rgba(207,122,92,0.12)' : '#252525',
                    border: `1px solid ${settings.provider === p.value ? 'rgba(207,122,92,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <input
                    type="radio"
                    name="provider"
                    checked={settings.provider === p.value}
                    onChange={() => update({ provider: p.value })}
                    style={{ accentColor: '#CF7A5C' }}
                  />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.9)' }}>{p.label}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{p.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Provider-specific config */}
          <div style={sectionStyle}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 14 }}>
              Provider Configuration
            </div>

            {settings.provider === 'claude' && (
              <>
                {renderApiKeyInput('Anthropic API Key', settings.anthropicApiKey, 'anthropicApiKey', 'claude')}
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Model</label>
                  <select
                    value={settings.claudeModel}
                    onChange={(e) => update({ claudeModel: e.target.value })}
                    style={selectStyle}
                  >
                    {CLAUDE_MODELS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {settings.provider === 'openai' && (
              <>
                {renderApiKeyInput('OpenAI API Key', settings.openaiApiKey, 'openaiApiKey', 'openai')}
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Model</label>
                  <select
                    value={settings.openaiModel}
                    onChange={(e) => update({ openaiModel: e.target.value })}
                    style={selectStyle}
                  >
                    {OPENAI_MODELS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {settings.provider === 'openrouter' && (
              <>
                {renderApiKeyInput('API Key', settings.openrouterApiKey, 'openrouterApiKey', 'openrouter')}
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Base URL</label>
                  <input
                    type="text"
                    value={settings.openrouterBaseUrl}
                    onChange={(e) => update({ openrouterBaseUrl: e.target.value })}
                    placeholder="https://openrouter.ai/api/v1"
                    style={inputStyle}
                  />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Model</label>
                  <input
                    type="text"
                    value={settings.openrouterModel}
                    onChange={(e) => update({ openrouterModel: e.target.value })}
                    placeholder="e.g. anthropic/claude-3.5-sonnet, meta-llama/llama-3-70b"
                    style={inputStyle}
                  />
                </div>
              </>
            )}

            {settings.provider === 'ollama' && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Model</label>
                <input
                  type="text"
                  value={settings.ollamaModel}
                  onChange={(e) => update({ ollamaModel: e.target.value })}
                  placeholder="e.g. llama3.2, mistral, gemma2"
                  style={inputStyle}
                />
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
                  Make sure Ollama is running locally with this model pulled.
                </div>
              </div>
            )}
          </div>

          {/* Scheduler */}
          <div style={sectionStyle}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 14 }}>
              Scheduled Briefs
            </div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Daily Brief Time</label>
                <input
                  type="time"
                  value={settings.dailyBriefTime || ''}
                  onChange={(e) => update({ dailyBriefTime: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>EOD Summary Time</label>
                <input
                  type="time"
                  value={settings.eodTime || ''}
                  onChange={(e) => update({ eodTime: e.target.value })}
                  style={inputStyle}
                />
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>
              Set times to auto-generate your daily brief and end-of-day summary. Leave empty to disable.
            </div>
            {(settings.dailyBriefTime || settings.eodTime) && (
              <button
                onClick={() => update({ dailyBriefTime: '', eodTime: '' })}
                style={{
                  background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
                  fontSize: 12, cursor: 'pointer', padding: 0, textDecoration: 'underline',
                }}
              >
                Clear schedule
              </button>
            )}
          </div>

          {/* Google Integration */}
          <div style={sectionStyle}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 14 }}>
              Google Integration
            </div>

            {/* Client credentials */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Google Client ID</label>
              <input
                type="text"
                value={settings.googleClientId || ''}
                onChange={(e) => update({ googleClientId: e.target.value })}
                placeholder="your-client-id.apps.googleusercontent.com"
                style={inputStyle}
              />
            </div>
            {renderApiKeyInput('Google Client Secret', settings.googleClientSecret || '', 'googleClientSecret', 'google')}

            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 16 }}>
              Create OAuth credentials at console.cloud.google.com. Enable Calendar and Docs APIs.
            </div>

            {/* Connection status + actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: googleConnected ? '#4ade80' : 'rgba(255,255,255,0.2)',
              }} />
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                {googleConnected ? 'Connected to Google' : 'Not connected'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {!googleConnected ? (
                <button
                  onClick={async () => {
                    setGoogleMessage('');
                    try {
                      await window.keel.googleConnect();
                      setGoogleConnected(true);
                      setGoogleMessage('Connected successfully!');
                    } catch (err) {
                      setGoogleMessage(err instanceof Error ? err.message : 'Connection failed');
                    }
                  }}
                  disabled={!settings.googleClientId || !settings.googleClientSecret}
                  style={{
                    padding: '8px 16px', borderRadius: 8, border: 'none',
                    background: settings.googleClientId && settings.googleClientSecret ? '#CF7A5C' : '#333',
                    color: 'white', fontSize: 13, cursor: settings.googleClientId && settings.googleClientSecret ? 'pointer' : 'default',
                    opacity: settings.googleClientId && settings.googleClientSecret ? 1 : 0.5,
                  }}
                >
                  Connect Google Account
                </button>
              ) : (
                <>
                  <button
                    onClick={async () => {
                      setGoogleSyncing(true);
                      setGoogleMessage('');
                      try {
                        const result = await window.keel.googleSyncCalendar();
                        setGoogleMessage(`Synced ${result.eventCount} events`);
                      } catch (err) {
                        setGoogleMessage(err instanceof Error ? err.message : 'Sync failed');
                      }
                      setGoogleSyncing(false);
                    }}
                    disabled={googleSyncing}
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: 'none',
                      background: '#CF7A5C', color: 'white', fontSize: 13,
                      cursor: googleSyncing ? 'default' : 'pointer',
                      opacity: googleSyncing ? 0.6 : 1,
                    }}
                  >
                    {googleSyncing ? 'Syncing...' : 'Sync Calendar'}
                  </button>
                  <button
                    onClick={async () => {
                      await window.keel.googleDisconnect();
                      setGoogleConnected(false);
                      setGoogleMessage('Disconnected');
                    }}
                    style={{
                      padding: '8px 16px', borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: 'transparent', color: 'rgba(255,255,255,0.5)',
                      fontSize: 13, cursor: 'pointer',
                    }}
                  >
                    Disconnect
                  </button>
                </>
              )}
            </div>

            {googleMessage && (
              <div style={{ fontSize: 12, color: googleMessage.includes('fail') || googleMessage.includes('error') || googleMessage.includes('must') ? '#f87171' : '#4ade80', marginTop: 4 }}>
                {googleMessage}
              </div>
            )}
          </div>

          {/* Brain Path */}
          <div style={sectionStyle}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 14 }}>
              Data Storage
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Brain Path</label>
              <input
                type="text"
                value={settings.brainPath}
                onChange={(e) => update({ brainPath: e.target.value })}
                style={inputStyle}
              />
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
                Where Keel stores your files, notes, and context.
              </div>
            </div>
          </div>

          {/* Save */}
          <button
            onClick={save}
            disabled={saving}
            style={{
              padding: '12px 28px', borderRadius: 10, border: 'none',
              background: saved ? '#2a5a3a' : '#CF7A5C',
              color: 'white', fontSize: 14, fontWeight: 600,
              cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.6 : 1,
              transition: 'all 0.2s',
            }}
          >
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
