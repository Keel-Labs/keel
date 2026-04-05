import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Settings as SettingsType, OllamaModelInfo } from '../../shared/types';
import { KeelIcon } from './KeelIcon';

const isElectron = typeof window !== 'undefined' && !!(window as any).keelMigrate;

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

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

interface Props {
  onBack: () => void;
}

export default function Settings({ onBack }: Props) {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [googleSyncing, setGoogleSyncing] = useState(false);
  const [googleMessage, setGoogleMessage] = useState('');
  const [ollamaModels, setOllamaModels] = useState<OllamaModelInfo[]>([]);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const [ollamaManualEntry, setOllamaManualEntry] = useState(false);

  const fetchOllamaModels = useCallback(async () => {
    setOllamaLoading(true);
    setOllamaError(null);
    try {
      const result = await window.keel.ollamaListModels();
      if (result.error) {
        setOllamaError(result.error);
        setOllamaModels([]);
      } else {
        setOllamaModels(result.models);
      }
    } catch {
      setOllamaError('Failed to fetch models');
      setOllamaModels([]);
    }
    setOllamaLoading(false);
  }, []);

  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    window.keel.getSettings().then((s) => {
      setSettings(s);
      if (s.provider === 'ollama') fetchOllamaModels();
    }).catch(() => {});
    window.keel.googleStatus().then((s) => {
      setGoogleConnected(s.connected);
      setGoogleConfigured(s.configured ?? false);
    }).catch(() => {});
  }, [fetchOllamaModels]);

  if (!settings) return null;

  const update = (partial: Partial<SettingsType>) => {
    const newSettings = { ...settings, ...partial };
    setSettings(newSettings);
    setSaved(false);
    // Auto-save after 500ms debounce
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await window.keel.saveSettings(newSettings);
        setSaved(true);
      } catch {
        // handle error silently
      }
      setSaving(false);
    }, 500);
  };

  const save = async () => {
    if (!settings) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
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
    width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-lg)',
    background: 'var(--bg-surface)', border: '1px solid var(--border-input)',
    color: 'var(--text-primary)', fontSize: 'var(--text-base)', outline: 'none',
    fontFamily: 'inherit', transition: 'var(--transition-base)',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle, appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
    paddingRight: 32, cursor: 'pointer',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
    marginBottom: 6, display: 'block', textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: 'var(--space-5xl)',
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
        padding: '16px 24px', borderBottom: '1px solid var(--border-default)',
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', color: 'var(--text-tertiary)',
            cursor: 'pointer', fontSize: 'var(--text-xl)', padding: '2px 6px', borderRadius: 'var(--radius-md)',
            transition: 'var(--transition-fast)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; }}
        >
          ←
        </button>
        <span style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)' }}>Settings</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        <div style={{ maxWidth: 480 }}>

          {/* AI Provider */}
          <div style={sectionStyle}>
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 14 }}>
              AI Provider
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {PROVIDERS.map((p) => (
                <label
                  key={p.value}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px', borderRadius: 'var(--radius-lg)',
                    background: settings.provider === p.value ? 'var(--accent-bg)' : 'var(--bg-surface)',
                    border: `1px solid ${settings.provider === p.value ? 'var(--accent-border)' : 'var(--border-default)'}`,
                    cursor: 'pointer', transition: 'var(--transition-base)',
                  }}
                >
                  <input
                    type="radio"
                    name="provider"
                    checked={settings.provider === p.value}
                    onChange={() => update({ provider: p.value })}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  <div>
                    <div style={{ fontSize: 'var(--text-base)', fontWeight: 500, color: 'var(--text-primary)' }}>{p.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 2 }}>{p.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Provider-specific config */}
          <div style={sectionStyle}>
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 14 }}>
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
              <>
                {/* Install instructions */}
                <div style={{
                  padding: '10px 14px', borderRadius: 8, marginBottom: 16,
                  background: 'rgba(207,122,92,0.08)', border: '1px solid rgba(207,122,92,0.2)',
                  fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6,
                }}>
                  Ollama runs AI models locally on your machine.{' '}
                  <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer"
                    style={{ color: '#CF7A5C', textDecoration: 'underline' }}>
                    Download Ollama
                  </a>{' '}
                  if you haven't already. After installing, run{' '}
                  <code style={{
                    background: 'rgba(255,255,255,0.08)', padding: '1px 5px',
                    borderRadius: 3, fontSize: 11,
                  }}>ollama pull llama3.2</code>{' '}
                  in your terminal to download a model.
                </div>

                {/* Model selector */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Model</label>
                    {!ollamaManualEntry && (
                      <button
                        onClick={() => { fetchOllamaModels(); }}
                        disabled={ollamaLoading}
                        style={{
                          background: 'none', border: 'none', color: '#CF7A5C',
                          fontSize: 11, cursor: 'pointer', padding: 0,
                          opacity: ollamaLoading ? 0.5 : 1,
                        }}
                      >
                        {ollamaLoading ? 'Checking...' : 'Refresh'}
                      </button>
                    )}
                  </div>

                  {ollamaError && !ollamaManualEntry && (
                    <div style={{
                      padding: '8px 12px', borderRadius: 6, marginBottom: 8,
                      background: 'rgba(220,80,80,0.1)', border: '1px solid rgba(220,80,80,0.2)',
                      fontSize: 12, color: 'rgba(255,255,255,0.5)',
                    }}>
                      {ollamaError.includes('ECONNREFUSED')
                        ? 'Ollama is not running. Start Ollama and click Refresh.'
                        : `Could not connect to Ollama: ${ollamaError}`}
                    </div>
                  )}

                  {!ollamaManualEntry && !ollamaError && ollamaModels.length > 0 ? (
                    <>
                      <select
                        value={settings.ollamaModel}
                        onChange={(e) => {
                          if (e.target.value === '__manual__') {
                            setOllamaManualEntry(true);
                          } else {
                            update({ ollamaModel: e.target.value });
                          }
                        }}
                        style={selectStyle}
                      >
                        <option value="">Select a model...</option>
                        {ollamaModels.map((m) => (
                          <option key={m.name} value={m.name}>
                            {m.name} ({m.parameterSize ? `${m.parameterSize}, ` : ''}{formatBytes(m.size)})
                          </option>
                        ))}
                        {settings.ollamaModel && !ollamaModels.find((m) => m.name === settings.ollamaModel) && (
                          <option value={settings.ollamaModel}>
                            {settings.ollamaModel} (not installed)
                          </option>
                        )}
                        <option value="__manual__">Type a custom model...</option>
                      </select>
                    </>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={settings.ollamaModel}
                        onChange={(e) => update({ ollamaModel: e.target.value })}
                        placeholder="e.g. llama3.2, mistral, gemma2"
                        style={inputStyle}
                      />
                      {ollamaManualEntry && ollamaModels.length > 0 && (
                        <button
                          onClick={() => setOllamaManualEntry(false)}
                          style={{
                            background: 'none', border: 'none', color: '#CF7A5C',
                            fontSize: 11, cursor: 'pointer', padding: 0, marginTop: 6,
                          }}
                        >
                          Back to model list
                        </button>
                      )}
                      {!ollamaManualEntry && !ollamaError && ollamaModels.length === 0 && !ollamaLoading && (
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
                          No models found. Pull one first:{' '}
                          <code style={{
                            background: 'rgba(255,255,255,0.08)', padding: '1px 5px',
                            borderRadius: 3, fontSize: 11,
                          }}>ollama pull llama3.2</code>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Timezone */}
          <div style={sectionStyle}>
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 14 }}>
              Timezone
            </div>
            <div style={{ marginBottom: 16 }}>
              <select
                value={settings.timezone || ''}
                onChange={(e) => update({ timezone: e.target.value })}
                style={selectStyle}
              >
                <option value="">Auto-detect ({Intl.DateTimeFormat().resolvedOptions().timeZone})</option>
                {[
                  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
                  'America/Anchorage', 'Pacific/Honolulu', 'America/Phoenix',
                  'America/Toronto', 'America/Vancouver',
                  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Amsterdam',
                  'Europe/Zurich', 'Europe/Rome', 'Europe/Madrid', 'Europe/Dublin',
                  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Dubai',
                  'Asia/Kolkata', 'Asia/Seoul', 'Asia/Hong_Kong',
                  'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland',
                  'America/Sao_Paulo', 'America/Mexico_City', 'Africa/Lagos', 'Africa/Cairo',
                ].map((tz) => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                ))}
              </select>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
                Used for reminders, scheduled briefs, and the time shown to your AI.
              </div>
            </div>
          </div>

          {/* Scheduler */}
          <div style={sectionStyle}>
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 14 }}>
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
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 6 }}>
              Google Integration
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 14 }}>
              Connect your Google account to sync Calendar events and export to Google Docs.
            </div>

            {!googleConfigured ? (
              <div style={{
                padding: '12px 16px', borderRadius: 10,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                fontSize: 13, color: 'rgba(255,255,255,0.4)',
              }}>
                Coming soon — Google integration will be available in a future release.
              </div>
            ) : (<>
            {/* Connection status */}
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
                  style={{
                    padding: '8px 16px', borderRadius: 8, border: 'none',
                    background: '#CF7A5C', color: 'white', fontSize: 13, cursor: 'pointer',
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
            </>)}
          </div>

          {/* Brain Path */}
          <div style={sectionStyle}>
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 14 }}>
              Data Storage
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Brain Path</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={settings.brainPath}
                  onChange={(e) => update({ brainPath: e.target.value })}
                  style={{ ...inputStyle, flex: 1 }}
                  readOnly
                />
                <button
                  onClick={async () => {
                    const picked = await window.keel.pickFolder(settings.brainPath);
                    if (picked) update({ brainPath: picked });
                  }}
                  style={{
                    padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-emphasis)',
                    background: 'var(--bg-btn-secondary)', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)',
                    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                >
                  Browse...
                </button>
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
                Where Keel stores your files, notes, and context.
              </div>
            </div>
          </div>

          {/* Team Brain */}
          <div style={sectionStyle}>
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 14 }}>
              Team Brain
            </div>
            {isElectron ? (
              <>
                <div style={{
                  padding: '10px 14px', borderRadius: 8, marginBottom: 16,
                  background: 'rgba(207,122,92,0.08)', border: '1px solid rgba(207,122,92,0.2)',
                  fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6,
                }}>
                  Share context with teammates by pointing to a shared folder (Dropbox, Google Drive, or a git repo).
                  Each team member sets the same path. Your personal brain stays private — only team files are shared.
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Your Name</label>
                  <input
                    type="text"
                    value={settings.userName}
                    onChange={(e) => update({ userName: e.target.value })}
                    placeholder="e.g. Medha"
                    style={inputStyle}
                  />
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
                    Used to identify your updates in the team brain.
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Team Brain Path</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      value={settings.teamBrainPath}
                      onChange={(e) => update({ teamBrainPath: e.target.value })}
                      placeholder="Not configured"
                      style={{ ...inputStyle, flex: 1 }}
                      readOnly
                    />
                    <button
                      onClick={async () => {
                        const picked = await window.keel.pickFolder(settings.teamBrainPath || settings.brainPath);
                        if (picked) update({ teamBrainPath: picked });
                      }}
                      style={{
                        padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-emphasis)',
                        background: 'var(--bg-btn-secondary)', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)',
                        cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                      }}
                    >
                      Browse...
                    </button>
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
                    Leave empty to disable team features.
                    {settings.teamBrainPath && (
                      <button
                        onClick={() => update({ teamBrainPath: '' })}
                        style={{
                          background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
                          fontSize: 12, cursor: 'pointer', padding: 0, marginLeft: 8,
                          textDecoration: 'underline',
                        }}
                      >
                        Disconnect
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={{
                  padding: '10px 14px', borderRadius: 8, marginBottom: 16,
                  background: 'rgba(207,122,92,0.08)', border: '1px solid rgba(207,122,92,0.2)',
                  fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6,
                }}>
                  Team brain is shared across all users on this server. Edit team files in the Knowledge Browser
                  under "Team Brain" — everyone sees the same content. Your personal brain stays private.
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Your Name</label>
                  <input
                    type="text"
                    value={settings.userName}
                    onChange={(e) => update({ userName: e.target.value })}
                    placeholder="e.g. Medha"
                    style={inputStyle}
                  />
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
                    Used to identify your edits in team files.
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Sync to Cloud (desktop only) */}
          {isElectron && (
            <CloudMigrationSection inputStyle={inputStyle} labelStyle={labelStyle} sectionStyle={sectionStyle} />
          )}

          {/* Save */}
          <button
            onClick={save}
            disabled={saving}
            style={{
              padding: '12px 28px', borderRadius: 'var(--radius-lg)', border: 'none',
              background: saved ? '#2a5a3a' : 'var(--accent)',
              color: 'white', fontSize: 'var(--text-base)', fontWeight: 600,
              cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.6 : 1,
              transition: 'var(--transition-slow)',
              fontFamily: 'inherit',
            }}
          >
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Cloud Migration Section (Desktop only) ---

function CloudMigrationSection({ inputStyle, labelStyle, sectionStyle }: {
  inputStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
  sectionStyle: React.CSSProperties;
}) {
  const [serverUrl, setServerUrl] = useState(() =>
    localStorage.getItem('keel_cloud_server') || ''
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [migrating, setMigrating] = useState(false);
  const [progress, setProgress] = useState<{ step: string; current: number; total: number } | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [authStep, setAuthStep] = useState<'credentials' | 'ready' | 'migrating'>('credentials');
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    const migrate = (window as any).keelMigrate;
    if (migrate) {
      migrate.onMigrationProgress((p: any) => setProgress(p));
      return () => migrate.removeMigrationListeners();
    }
  }, []);

  const handleAuth = async () => {
    if (!serverUrl || !email || !password) {
      setResult({ ok: false, message: 'Please fill in all fields' });
      return;
    }

    setResult(null);
    try {
      // Register or login
      let res = await fetch(`${serverUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        // Try registering
        res = await fetch(`${serverUrl}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Auth failed' }));
        setResult({ ok: false, message: (err as any).error || 'Authentication failed' });
        return;
      }

      const data = await res.json() as { accessToken: string; refreshToken: string };
      setAccessToken(data.accessToken);
      localStorage.setItem('keel_cloud_server', serverUrl);
      setAuthStep('ready');
      setResult({ ok: true, message: 'Authenticated! Ready to migrate.' });
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Connection failed' });
    }
  };

  const handleMigrate = async () => {
    if (!accessToken || !serverUrl) return;

    setMigrating(true);
    setResult(null);
    setAuthStep('migrating');

    try {
      const migrate = (window as any).keelMigrate;
      const res = await migrate.migrateToCloud(serverUrl, accessToken);

      if (res.ok) {
        const imp = res.imported;
        setResult({
          ok: true,
          message: `Migration complete! Synced: ${imp.brainFiles} brain files, ${imp.chatSessions} chats, ${imp.reminders} reminders.`,
        });
      } else {
        setResult({ ok: false, message: res.error || 'Migration failed' });
      }
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Migration failed' });
    }

    setMigrating(false);
    setAuthStep('ready');
  };

  return (
    <div style={sectionStyle}>
      <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 6 }}>
        Sync to Cloud
      </div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 14 }}>
        Migrate your desktop data (brain files, chat history, reminders, settings) to the Keel cloud
        server so you can access them from your phone.
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Server URL</label>
        <input
          type="text"
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          placeholder="https://keel-api.fly.dev"
          style={inputStyle}
          disabled={authStep === 'migrating'}
        />
      </div>

      {authStep === 'credentials' && (
        <>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Cloud account password"
              style={inputStyle}
            />
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>
              A new account will be created if one doesn't exist.
            </div>
          </div>
          <button
            onClick={handleAuth}
            style={{
              padding: '10px 20px', borderRadius: 8, border: 'none',
              background: '#CF7A5C', color: 'white', fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Connect to Cloud
          </button>
        </>
      )}

      {authStep === 'ready' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleMigrate}
            disabled={migrating}
            style={{
              padding: '10px 20px', borderRadius: 8, border: 'none',
              background: '#CF7A5C', color: 'white', fontSize: 13, fontWeight: 600,
              cursor: migrating ? 'default' : 'pointer',
              opacity: migrating ? 0.6 : 1,
            }}
          >
            Start Migration
          </button>
          <button
            onClick={() => { setAuthStep('credentials'); setAccessToken(null); setResult(null); }}
            style={{
              padding: '10px 20px', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent', color: 'rgba(255,255,255,0.5)',
              fontSize: 13, cursor: 'pointer',
            }}
          >
            Change Account
          </button>
        </div>
      )}

      {authStep === 'migrating' && progress && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginTop: 10,
          background: 'rgba(207,122,92,0.08)', border: '1px solid rgba(207,122,92,0.2)',
        }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
            {progress.step}
          </div>
          {progress.total > 0 && (
            <div style={{
              height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 2, background: '#CF7A5C',
                width: `${Math.min(100, (progress.current / progress.total) * 100)}%`,
                transition: 'width 0.3s',
              }} />
            </div>
          )}
        </div>
      )}

      {result && (
        <div style={{
          fontSize: 12, marginTop: 10,
          color: result.ok ? '#4ade80' : '#f87171',
        }}>
          {result.message}
        </div>
      )}
    </div>
  );
}
