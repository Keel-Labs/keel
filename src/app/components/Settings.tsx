import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Settings as SettingsType,
  OllamaModelInfo,
  ProviderCliAuthProvider,
  ProviderCliAuthStatus,
  ProviderModelOption,
} from '../../shared/types';
import { applyTheme } from '../theme';

const isElectron = typeof window !== 'undefined' && !!(window as any).keelMigrate;

const CLAUDE_MODELS = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
];

const OPENAI_MODELS: ProviderModelOption[] = [
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { id: 'gpt-4.1', label: 'GPT-4.1' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
];

const PROVIDERS = [
  { value: 'claude', label: 'Claude', description: 'Anthropic reasoning and writing.' },
  { value: 'openai', label: 'OpenAI', description: 'General-purpose GPT models.' },
  { value: 'openrouter', label: 'OpenRouter', description: 'Any OpenAI-compatible endpoint.' },
  { value: 'ollama', label: 'Ollama', description: 'Local models running on your machine.' },
] as const;

type SettingsSectionId =
  | 'general-personal'
  | 'general-workspace'
  | 'general-notifications'
  | 'ai-provider'
  | 'ai-models'
  | 'ai-local'
  | 'knowledge-storage'
  | 'knowledge-team'
  | 'integrations-google'
  | 'cloud-sync'
  | 'advanced-developer';

const SECTION_META: Record<SettingsSectionId, { title: string; description: string }> = {
  'general-personal': {
    title: 'Personal Settings',
    description: 'Preferences that shape how Keel works with you.',
  },
  'general-workspace': {
    title: 'Workspace',
    description: 'Local scheduling and workspace-level behavior.',
  },
  'general-notifications': {
    title: 'Notifications',
    description: 'Notification preferences will live here as the system grows.',
  },
  'ai-provider': {
    title: 'Provider',
    description: 'Choose the active AI provider and manage credentials.',
  },
  'ai-models': {
    title: 'Models',
    description: 'Configure model selection and provider-specific runtime settings.',
  },
  'ai-local': {
    title: 'Local AI',
    description: 'Manage Ollama and local model availability.',
  },
  'knowledge-storage': {
    title: 'Data Storage',
    description: 'Control where Keel stores local knowledge and context.',
  },
  'knowledge-team': {
    title: 'Team Brain',
    description: 'Configure shared team context and collaboration settings.',
  },
  'integrations-google': {
    title: 'Google',
    description: 'Manage Google account connection and sync behavior.',
  },
  'cloud-sync': {
    title: 'Sync & Migration',
    description: 'Move desktop data to the cloud with a guided workflow.',
  },
  'advanced-developer': {
    title: 'Developer',
    description: 'Advanced runtime controls and future diagnostics.',
  },
};

const NAV_GROUPS: Array<{
  label: string;
  items: Array<{ id: SettingsSectionId; label: string }>;
}> = [
  {
    label: 'General',
    items: [
      { id: 'general-personal', label: 'Personal Settings' },
      { id: 'general-workspace', label: 'Workspace' },
      { id: 'general-notifications', label: 'Notifications' },
    ],
  },
  {
    label: 'AI',
    items: [
      { id: 'ai-provider', label: 'Provider' },
      { id: 'ai-models', label: 'Models' },
      { id: 'ai-local', label: 'Local AI' },
    ],
  },
  {
    label: 'Knowledge',
    items: [
      { id: 'knowledge-storage', label: 'Data Storage' },
      { id: 'knowledge-team', label: 'Team Brain' },
    ],
  },
  {
    label: 'Integrations',
    items: [
      { id: 'integrations-google', label: 'Google' },
    ],
  },
  {
    label: 'Cloud',
    items: [
      { id: 'cloud-sync', label: 'Sync & Migration' },
    ],
  },
  {
    label: 'Advanced',
    items: [
      { id: 'advanced-developer', label: 'Developer' },
    ],
  },
];

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Anchorage', 'Pacific/Honolulu', 'America/Phoenix',
  'America/Toronto', 'America/Vancouver',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Amsterdam',
  'Europe/Zurich', 'Europe/Rome', 'Europe/Madrid', 'Europe/Dublin',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Dubai',
  'Asia/Kolkata', 'Asia/Seoul', 'Asia/Hong_Kong',
  'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland',
  'America/Sao_Paulo', 'America/Mexico_City', 'Africa/Lagos', 'Africa/Cairo',
];

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function providerLabel(provider: SettingsType['provider']): string {
  return PROVIDERS.find((item) => item.value === provider)?.label || provider;
}

function statusTone(
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'accent'
): React.CSSProperties {
  switch (tone) {
    case 'success':
      return { background: 'rgba(52, 211, 153, 0.12)', color: '#6ee7b7', border: '1px solid rgba(52, 211, 153, 0.22)' };
    case 'warning':
      return { background: 'rgba(245, 158, 11, 0.12)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.22)' };
    case 'danger':
      return { background: 'rgba(248, 113, 113, 0.12)', color: '#fca5a5', border: '1px solid rgba(248, 113, 113, 0.22)' };
    case 'accent':
      return { background: 'rgba(207,122,92,0.12)', color: '#e4a289', border: '1px solid rgba(207,122,92,0.22)' };
    default:
      return { background: 'var(--surface-muted)', color: 'var(--text-muted)', border: '1px solid var(--panel-border)' };
  }
}

interface Props {
  onBack: () => void;
}

export default function Settings({ onBack }: Props) {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [selectedSection, setSelectedSection] = useState<SettingsSectionId>('general-personal');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [googleSyncing, setGoogleSyncing] = useState(false);
  const [googleMessage, setGoogleMessage] = useState('');
  const [providerAuthStatus, setProviderAuthStatus] = useState<Record<ProviderCliAuthProvider, ProviderCliAuthStatus | null>>({
    claude: null,
    openai: null,
  });
  const [providerAuthLoading, setProviderAuthLoading] = useState<Record<ProviderCliAuthProvider, boolean>>({
    claude: false,
    openai: false,
  });
  const [providerAuthMessage, setProviderAuthMessage] = useState<Record<ProviderCliAuthProvider, string>>({
    claude: '',
    openai: '',
  });
  const [openaiModels, setOpenaiModels] = useState<ProviderModelOption[]>(OPENAI_MODELS);
  const [openaiModelsLoading, setOpenaiModelsLoading] = useState(false);
  const [openaiModelsError, setOpenaiModelsError] = useState<string | null>(null);
  const [ollamaModels, setOllamaModels] = useState<OllamaModelInfo[]>([]);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const [ollamaManualEntry, setOllamaManualEntry] = useState(false);
  const [isCompactLayout, setIsCompactLayout] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 980
  );
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const fetchOpenAIModels = useCallback(async () => {
    setOpenaiModelsLoading(true);
    setOpenaiModelsError(null);
    try {
      const models = await window.keel.openaiListModels();
      setOpenaiModels(models.length > 0 ? models : OPENAI_MODELS);
      if (models.length === 0) {
        setOpenaiModelsError('No compatible chat models were returned.');
      }
    } catch (error) {
      setOpenaiModels(OPENAI_MODELS);
      setOpenaiModelsError(error instanceof Error ? error.message : 'Failed to fetch OpenAI models');
    }
    setOpenaiModelsLoading(false);
  }, []);

  const refreshProviderAuthStatus = useCallback(async (provider: ProviderCliAuthProvider) => {
    setProviderAuthLoading((prev) => ({ ...prev, [provider]: true }));
    try {
      const status = await window.keel.getProviderAuthStatus(provider);
      setProviderAuthStatus((prev) => ({ ...prev, [provider]: status }));
    } finally {
      setProviderAuthLoading((prev) => ({ ...prev, [provider]: false }));
    }
  }, []);

  const setProviderMessage = useCallback((provider: ProviderCliAuthProvider, message: string) => {
    setProviderAuthMessage((prev) => ({ ...prev, [provider]: message }));
  }, []);

  useEffect(() => {
    window.keel.getSettings().then((s) => {
      setSettings(s);
      if (s.provider === 'ollama') fetchOllamaModels();
      if (s.openaiAuthMode === 'api-key' && s.openaiApiKey) fetchOpenAIModels();
    }).catch(() => {});
    window.keel.googleStatus().then((s) => {
      setGoogleConnected(s.connected);
      setGoogleConfigured(s.configured ?? false);
    }).catch(() => {});
    if (isElectron) {
      refreshProviderAuthStatus('claude').catch(() => {});
      refreshProviderAuthStatus('openai').catch(() => {});
    }
  }, [fetchOllamaModels, fetchOpenAIModels, refreshProviderAuthStatus]);

  useEffect(() => {
    const onResize = () => setIsCompactLayout(window.innerWidth < 980);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!settings) return;
    if (settings.openaiAuthMode === 'api-key' && settings.openaiApiKey) {
      fetchOpenAIModels().catch(() => {});
      return;
    }
    setOpenaiModels(OPENAI_MODELS);
    setOpenaiModelsError(null);
  }, [fetchOpenAIModels, settings?.openaiApiKey, settings?.openaiAuthMode]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  if (!settings) return null;

  const update = (partial: Partial<SettingsType>) => {
    const newSettings = { ...settings, ...partial };
    setSettings(newSettings);
    if (partial.theme) applyTheme(newSettings.theme);
    setSaved(false);

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await window.keel.saveSettings(newSettings);
        setSaved(true);
      } catch {
        // Save feedback remains local to the page for now.
      }
      setSaving(false);
    }, 500);
  };

  const save = async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaving(true);
    try {
      applyTheme(settings.theme);
      await window.keel.saveSettings(settings);
      setSaved(true);
    } catch {
      // Save feedback remains local to the page for now.
    }
    setSaving(false);
  };

  const toggleKeyVisibility = (key: string) => {
    setShowApiKey((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 'var(--radius-lg)',
    background: 'var(--control-bg)',
    border: '1px solid var(--control-border)',
    color: 'var(--text-primary)',
    fontSize: 'var(--text-base)',
    outline: 'none',
    fontFamily: 'inherit',
    transition: 'var(--transition-base)',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 14px center',
    paddingRight: 36,
    cursor: 'pointer',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-muted)',
    marginBottom: 8,
    display: 'block',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  };

  const summaryChips = [
    { label: 'Theme', value: settings.theme === 'light' ? 'Light' : 'Dark' },
    { label: 'Provider', value: providerLabel(settings.provider) },
    { label: 'Timezone', value: settings.timezone || 'Auto' },
    { label: 'Google', value: googleConnected ? 'Connected' : googleConfigured ? 'Ready to connect' : 'Unavailable' },
    { label: 'Team Brain', value: settings.teamBrainPath ? 'Enabled' : 'Off' },
  ];

  const renderApiKeyInput = (
    label: string,
    value: string,
    field: keyof SettingsType,
    keyId: string
  ) => (
    <FieldRow label={label}>
      <div style={{ position: 'relative' }}>
        <input
          type={showApiKey[keyId] ? 'text' : 'password'}
          value={value}
          onChange={(e) => update({ [field]: e.target.value } as Partial<SettingsType>)}
          placeholder="sk-..."
          style={{ ...inputStyle, paddingRight: 60 }}
        />
        <button
          onClick={() => toggleKeyVisibility(keyId)}
          style={{
            position: 'absolute',
            right: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            color: 'var(--text-tertiary)',
            cursor: 'pointer',
            fontSize: 12,
            padding: '4px 6px',
          }}
        >
          {showApiKey[keyId] ? 'Hide' : 'Show'}
        </button>
      </div>
    </FieldRow>
  );

  const getProviderAuthMode = (provider: ProviderCliAuthProvider) => (
    provider === 'claude' ? settings.anthropicAuthMode : settings.openaiAuthMode
  );

  const setProviderAuthMode = (provider: ProviderCliAuthProvider, mode: 'api-key' | 'cli') => {
    update(provider === 'claude' ? { anthropicAuthMode: mode } : { openaiAuthMode: mode });
  };

  const renderCliProviderAuth = (provider: ProviderCliAuthProvider) => {
    const status = providerAuthStatus[provider];
    const loading = providerAuthLoading[provider];
    const message = providerAuthMessage[provider];
    const selected = getProviderAuthMode(provider) === 'cli';
    const productLabel = provider === 'claude' ? 'Claude Code' : 'Codex';
    const commandHint = provider === 'claude'
      ? 'claude auth login'
      : settings.openaiCliUseDeviceAuth
        ? 'codex login --device-auth'
        : 'codex login';
    const badge = !status
      ? { label: 'Checking…', tone: 'neutral' as const }
      : !status.installed
        ? { label: 'Not installed', tone: 'warning' as const }
        : status.connected
          ? { label: 'Connected', tone: 'success' as const }
          : status.authKind === 'api-key'
            ? { label: 'API key only', tone: 'warning' as const }
            : { label: 'Disconnected', tone: 'warning' as const };

    return (
      <>
        <StatusPanel
          title={`${productLabel} login`}
          badge={badge}
          description={
            status
              ? status.summary
              : `Checking ${productLabel} status...`
          }
          actions={(
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={async () => {
                  setProviderMessage(provider, '');
                  try {
                    const result = await window.keel.connectProviderAuth(
                      provider,
                      provider === 'openai'
                        ? { useDeviceAuth: settings.openaiCliUseDeviceAuth }
                        : undefined
                    );
                    setProviderMessage(provider, result.message);
                  } catch (err) {
                    setProviderMessage(provider, err instanceof Error ? err.message : 'Could not launch login');
                  }
                }}
                disabled={loading || status?.installed === false}
                style={primaryButtonStyle(loading || status?.installed === false)}
              >
                {status?.connected ? 'Reconnect' : 'Connect'}
              </button>
              <button
                onClick={async () => {
                  setProviderMessage(provider, '');
                  try {
                    await refreshProviderAuthStatus(provider);
                  } catch (err) {
                    setProviderMessage(provider, err instanceof Error ? err.message : 'Status refresh failed');
                  }
                }}
                disabled={loading}
                style={secondaryButtonStyle(loading)}
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
              <button
                onClick={async () => {
                  setProviderMessage(provider, '');
                  try {
                    await window.keel.disconnectProviderAuth(provider);
                    await refreshProviderAuthStatus(provider);
                    setProviderMessage(provider, `${productLabel} login disconnected.`);
                  } catch (err) {
                    setProviderMessage(provider, err instanceof Error ? err.message : 'Disconnect failed');
                  }
                }}
                disabled={loading || !status?.connected}
                style={secondaryButtonStyle(loading || !status?.connected)}
              >
                Disconnect
              </button>
            </div>
          )}
        />
        {provider === 'openai' && (
          <FieldRow
            label="Login Mode"
            description="Device auth is preferred and enabled by default. Turn it off only if your organization does not allow device auth and requires the standard Codex login flow."
          >
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.openaiCliUseDeviceAuth}
                onChange={(e) => update({ openaiCliUseDeviceAuth: e.target.checked })}
                style={{ marginTop: 3, accentColor: 'var(--accent)' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>
                  Use `--device-auth`
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Checked: launch <code style={inlineCodeStyle}>codex login --device-auth</code>. Unchecked: launch <code style={inlineCodeStyle}>codex login</code>.
                </span>
              </div>
            </label>
          </FieldRow>
        )}
        {!status?.installed && (
          <InlineNote>
            Install {productLabel} first, then run <code style={inlineCodeStyle}>{commandHint}</code>.
          </InlineNote>
        )}
        {selected && message && (
          <InlineMessage
            tone={message.toLowerCase().includes('failed') || message.toLowerCase().includes('could not') ? 'danger' : 'success'}
          >
            {message}
          </InlineMessage>
        )}
      </>
    );
  };

  const renderProviderCredentials = () => {
    if (settings.provider === 'claude') {
      return (
        <>
          {isElectron && (
            <FieldRow
              label="Credential Source"
              description="Use your Claude Code login or a direct Anthropic API key."
            >
              <div style={{ display: 'inline-flex', gap: 6, padding: 4, borderRadius: 14, background: 'var(--surface-muted)', border: '1px solid var(--panel-border)' }}>
                {([
                  { value: 'cli' as const, label: 'Claude Code Login' },
                  { value: 'api-key' as const, label: 'API Key' },
                ]).map((option) => {
                  const active = settings.anthropicAuthMode === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => setProviderAuthMode('claude', option.value)}
                      style={{
                        border: 'none',
                        borderRadius: 10,
                        padding: '9px 14px',
                        background: active ? 'var(--surface-selected)' : 'transparent',
                        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </FieldRow>
          )}
          {isElectron && settings.anthropicAuthMode === 'cli'
            ? renderCliProviderAuth('claude')
            : renderApiKeyInput('Anthropic API Key', settings.anthropicApiKey, 'anthropicApiKey', 'claude')}
        </>
      );
    }
    if (settings.provider === 'openai') {
      return (
        <>
          {isElectron && (
            <FieldRow
              label="Credential Source"
              description="Use your Codex login or a direct OpenAI API key."
            >
              <div style={{ display: 'inline-flex', gap: 6, padding: 4, borderRadius: 14, background: 'var(--surface-muted)', border: '1px solid var(--panel-border)' }}>
                {([
                  { value: 'cli' as const, label: 'Codex Login' },
                  { value: 'api-key' as const, label: 'API Key' },
                ]).map((option) => {
                  const active = settings.openaiAuthMode === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => setProviderAuthMode('openai', option.value)}
                      style={{
                        border: 'none',
                        borderRadius: 10,
                        padding: '9px 14px',
                        background: active ? 'var(--surface-selected)' : 'transparent',
                        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </FieldRow>
          )}
          {isElectron && settings.openaiAuthMode === 'cli'
            ? renderCliProviderAuth('openai')
            : renderApiKeyInput('OpenAI API Key', settings.openaiApiKey, 'openaiApiKey', 'openai')}
        </>
      );
    }
    if (settings.provider === 'openrouter') {
      return renderApiKeyInput('OpenRouter API Key', settings.openrouterApiKey, 'openrouterApiKey', 'openrouter');
    }

    return (
      <StatusPanel
        title="Local runtime"
        badge={{ label: 'Local only', tone: 'accent' }}
        description="Ollama runs models on your machine. No API key is required."
      />
    );
  };

  const renderProviderStatus = () => {
    const isConfigured =
      settings.provider === 'ollama'
        ? Boolean(settings.ollamaModel)
        : settings.provider === 'claude'
          ? settings.anthropicAuthMode === 'cli'
            ? Boolean(providerAuthStatus.claude?.connected)
            : Boolean(settings.anthropicApiKey)
          : settings.provider === 'openai'
            ? settings.openaiAuthMode === 'cli'
              ? Boolean(providerAuthStatus.openai?.connected)
              : Boolean(settings.openaiApiKey)
            : Boolean(settings.openrouterApiKey);

    return (
      <StatusPanel
        title="Provider status"
        badge={{
          label: isConfigured ? 'Configured' : 'Needs setup',
          tone: isConfigured ? 'success' : 'warning',
        }}
        description={
          isConfigured
            ? `${providerLabel(settings.provider)} is ready to use.`
            : `Finish configuring ${providerLabel(settings.provider)} before using it.`
        }
      />
    );
  };

  const renderModelFields = () => {
    if (settings.provider === 'claude') {
      if (settings.anthropicAuthMode === 'cli') {
        return (
          <SectionCard
            title="Claude Code Runtime"
            description="Optionally override the model alias Claude Code should use. Leave this blank to use your CLI default."
          >
            <FieldRow label="Model Override" description="Examples: sonnet, opus">
              <input
                type="text"
                value={settings.anthropicCliModel}
                onChange={(e) => update({ anthropicCliModel: e.target.value })}
                placeholder="Leave blank to use Claude Code default"
                style={inputStyle}
              />
            </FieldRow>
          </SectionCard>
        );
      }

      return (
        <SectionCard
          title="Model Selection"
          description="Choose the default Claude model for your conversations."
        >
          <FieldRow label="Claude Model">
            <select
              value={settings.claudeModel}
              onChange={(e) => update({ claudeModel: e.target.value })}
              style={selectStyle}
            >
              {CLAUDE_MODELS.map((model) => (
                <option key={model.value} value={model.value}>{model.label}</option>
              ))}
            </select>
          </FieldRow>
        </SectionCard>
      );
    }

    if (settings.provider === 'openai') {
      if (settings.openaiAuthMode === 'cli') {
        return (
          <SectionCard
            title="Codex Runtime"
            description="Optionally override the model Codex should use. Leave this blank to use your Codex default."
          >
            <FieldRow label="Model Override" description="Example: gpt-5">
              <input
                type="text"
                value={settings.openaiCliModel}
                onChange={(e) => update({ openaiCliModel: e.target.value })}
                placeholder="Leave blank to use Codex default"
                style={inputStyle}
              />
            </FieldRow>
          </SectionCard>
        );
      }

      return (
        <SectionCard
          title="Model Selection"
          description="Choose the default OpenAI model for your conversations."
        >
          <FieldRow label="OpenAI Model">
            <select
              value={settings.openaiModel}
              onChange={(e) => update({ openaiModel: e.target.value })}
              style={selectStyle}
            >
              {openaiModels.map((model) => (
                <option key={model.id} value={model.id}>{model.label}</option>
              ))}
            </select>
          </FieldRow>
          <InlineNote>
            {openaiModelsLoading
              ? 'Refreshing models from OpenAI...'
              : openaiModelsError
                ? `Using fallback list: ${openaiModelsError}`
                : `Loaded ${openaiModels.length} OpenAI models from the API.`}
          </InlineNote>
        </SectionCard>
      );
    }

    if (settings.provider === 'openrouter') {
      return (
        <SectionCard
          title="Runtime Settings"
          description="Set the default model and endpoint for your OpenRouter-compatible provider."
        >
          <FieldRow label="Model">
            <input
              type="text"
              value={settings.openrouterModel}
              onChange={(e) => update({ openrouterModel: e.target.value })}
              placeholder="e.g. anthropic/claude-3.5-sonnet"
              style={inputStyle}
            />
          </FieldRow>
          <FieldRow
            label="Base URL"
            description="Advanced: override the OpenAI-compatible API endpoint."
          >
            <input
              type="text"
              value={settings.openrouterBaseUrl}
              onChange={(e) => update({ openrouterBaseUrl: e.target.value })}
              placeholder="https://openrouter.ai/api/v1"
              style={inputStyle}
            />
          </FieldRow>
        </SectionCard>
      );
    }

    return (
      <SectionCard
        title="Local Model Defaults"
        description="The active Ollama model is managed in the Local AI section."
      >
        <InlineNote>
          Switch to <strong>Local AI</strong> to inspect Ollama status and choose installed models.
        </InlineNote>
      </SectionCard>
    );
  };

  const renderLocalAi = () => {
    const hasInstalledModel = settings.ollamaModel && ollamaModels.some((model) => model.name === settings.ollamaModel);
    const ollamaTone = ollamaError ? 'warning' : ollamaModels.length > 0 ? 'success' : 'neutral';
    const ollamaLabel = ollamaError ? 'Not running' : ollamaModels.length > 0 ? 'Available' : 'No models';

    return (
      <>
        <StatusPanel
          title="Ollama status"
          badge={{ label: ollamaLabel, tone: ollamaTone }}
          description={
            ollamaError
              ? (ollamaError.includes('ECONNREFUSED')
                ? 'Ollama is not running locally. Start it and refresh model status.'
                : `Could not connect to Ollama: ${ollamaError}`)
              : ollamaModels.length > 0
                ? `Found ${ollamaModels.length} local model${ollamaModels.length === 1 ? '' : 's'}.`
                : 'No local models were found yet.'
          }
          actions={(
            <button
              onClick={() => { fetchOllamaModels(); }}
              disabled={ollamaLoading}
              style={secondaryButtonStyle(ollamaLoading)}
            >
              {ollamaLoading ? 'Checking...' : 'Refresh'}
            </button>
          )}
        />

        <SectionCard
          title="Installed Models"
          description="Use the model list when available, or type a custom model name."
        >
          {!ollamaManualEntry && !ollamaError && ollamaModels.length > 0 ? (
            <FieldRow label="Model">
              <select
                value={hasInstalledModel ? settings.ollamaModel : ''}
                onChange={(e) => {
                  if (e.target.value === '__manual__') {
                    setOllamaManualEntry(true);
                    return;
                  }
                  update({ ollamaModel: e.target.value });
                }}
                style={selectStyle}
              >
                <option value="">Select a model...</option>
                {ollamaModels.map((model) => (
                  <option key={model.name} value={model.name}>
                    {model.name} ({model.parameterSize ? `${model.parameterSize}, ` : ''}{formatBytes(model.size)})
                  </option>
                ))}
                <option value="__manual__">Type a custom model...</option>
              </select>
              {!hasInstalledModel && settings.ollamaModel && (
                <InlineNote>Current model: {settings.ollamaModel}</InlineNote>
              )}
            </FieldRow>
          ) : (
            <FieldRow label="Model">
              <input
                type="text"
                value={settings.ollamaModel}
                onChange={(e) => update({ ollamaModel: e.target.value })}
                placeholder="e.g. llama3.2, mistral, gemma2"
                style={inputStyle}
              />
              {ollamaModels.length > 0 && (
                <button
                  onClick={() => setOllamaManualEntry(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#CF7A5C',
                    fontSize: 12,
                    cursor: 'pointer',
                    padding: 0,
                    marginTop: 8,
                  }}
                >
                  Back to installed models
                </button>
              )}
            </FieldRow>
          )}

          <InlineNote>
            Install a model with <code style={inlineCodeStyle}>ollama pull llama3.2</code>.
          </InlineNote>
        </SectionCard>
      </>
    );
  };

  const renderSection = () => {
    switch (selectedSection) {
      case 'general-personal':
        return (
          <>
            <SectionCard title="Profile" description="Basic identity settings for your Keel workspace.">
              <FieldRow
                label="Your Name"
                description="Used to identify your edits and updates across shared context."
              >
                <input
                  type="text"
                  value={settings.userName}
                  onChange={(e) => update({ userName: e.target.value })}
                  placeholder="e.g. Medha"
                  style={inputStyle}
                />
              </FieldRow>
            </SectionCard>

            <SectionCard title="Preferences" description="Personal defaults that shape how Keel behaves for you.">
              <FieldRow
                label="Theme"
                description="Switch the desktop app between the dark and light workspace themes."
              >
                <div style={{ display: 'inline-flex', gap: 6, padding: 4, borderRadius: 14, background: 'var(--surface-muted)', border: '1px solid var(--panel-border)' }}>
                  {(['dark', 'light'] as const).map((themeOption) => {
                    const active = settings.theme === themeOption;
                    return (
                      <button
                        key={themeOption}
                        onClick={() => update({ theme: themeOption })}
                        style={{
                          border: 'none',
                          borderRadius: 10,
                          padding: '9px 14px',
                          background: active ? 'var(--surface-selected)' : 'transparent',
                          color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {themeOption === 'dark' ? 'Dark mode' : 'Light mode'}
                      </button>
                    );
                  })}
                </div>
              </FieldRow>
              <FieldRow
                label="Timezone"
                description="Used for reminders, scheduled briefs, and the time shown to your AI."
              >
                <select
                  value={settings.timezone || ''}
                  onChange={(e) => update({ timezone: e.target.value })}
                  style={selectStyle}
                >
                  <option value="">Auto-detect ({Intl.DateTimeFormat().resolvedOptions().timeZone})</option>
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </FieldRow>
              <InlineNote>More personal preferences will be added here over time.</InlineNote>
            </SectionCard>
          </>
        );

      case 'general-workspace':
        return (
          <SectionCard title="Scheduled Briefs" description="Configure when Keel should prepare recurring summaries.">
            <div style={{ display: 'grid', gridTemplateColumns: isCompactLayout ? '1fr' : '1fr 1fr', gap: 16 }}>
              <FieldRow label="Daily Brief Time">
                <input
                  type="time"
                  value={settings.dailyBriefTime || ''}
                  onChange={(e) => update({ dailyBriefTime: e.target.value })}
                  style={inputStyle}
                />
              </FieldRow>
              <FieldRow label="End-of-Day Summary Time">
                <input
                  type="time"
                  value={settings.eodTime || ''}
                  onChange={(e) => update({ eodTime: e.target.value })}
                  style={inputStyle}
                />
              </FieldRow>
            </div>
            <InlineNote>Leave a time blank to disable that scheduled brief.</InlineNote>
            {(settings.dailyBriefTime || settings.eodTime) && (
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => update({ dailyBriefTime: '', eodTime: '' })}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-tertiary)',
                    fontSize: 12,
                    cursor: 'pointer',
                    padding: 0,
                    textDecoration: 'underline',
                  }}
                >
                  Clear schedule
                </button>
              </div>
            )}
          </SectionCard>
        );

      case 'general-notifications':
        return (
          <PlaceholderPanel
            title="Notifications are coming next"
            description="This section is reserved for response, reminder, and mobile notification preferences."
          />
        );

      case 'ai-provider':
        return (
          <>
            <SectionCard title="Active Provider" description="Select the AI backend Keel should use by default.">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {PROVIDERS.map((provider) => (
                  <label
                    key={provider.value}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: '14px 16px',
                      borderRadius: 'var(--radius-xl)',
                      background: settings.provider === provider.value ? 'var(--accent-bg)' : 'var(--surface-panel)',
                      border: `1px solid ${settings.provider === provider.value ? 'var(--accent-border)' : 'var(--panel-border)'}`,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="provider"
                      checked={settings.provider === provider.value}
                      onChange={() => {
                        update({ provider: provider.value });
                        if (provider.value === 'ollama') fetchOllamaModels();
                      }}
                      style={{ accentColor: 'var(--accent)', marginTop: 2 }}
                    />
                    <div>
                      <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {provider.label}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                        {provider.description}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </SectionCard>

            {renderProviderStatus()}

            <SectionCard title="Credentials" description="Only the active provider’s credentials are shown here.">
              {renderProviderCredentials()}
            </SectionCard>
          </>
        );

      case 'ai-models':
        return (
          <>
            {renderModelFields()}
            <StatusPanel
              title="Current AI configuration"
              badge={{
                label: providerLabel(settings.provider),
                tone: 'accent',
              }}
              description={`Keel is currently configured to use ${providerLabel(settings.provider)}.`}
            />
          </>
        );

      case 'ai-local':
        return renderLocalAi();

      case 'knowledge-storage':
        return (
          <SectionCard title="Brain Path" description="This is where Keel stores local files, notes, and context.">
            <FieldRow label="Brain Path">
              <div style={{ display: 'flex', gap: 10, flexDirection: isCompactLayout ? 'column' : 'row' }}>
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
                  style={secondaryButtonStyle(false)}
                >
                  Browse…
                </button>
              </div>
            </FieldRow>
          </SectionCard>
        );

      case 'knowledge-team':
        return (
          <>
            <StatusPanel
              title="Team Brain Status"
              badge={{
                label: settings.teamBrainPath ? 'Enabled' : (isElectron ? 'Disabled' : 'Server-managed'),
                tone: settings.teamBrainPath ? 'success' : 'neutral',
              }}
              description={
                isElectron
                  ? (settings.teamBrainPath
                    ? 'A shared folder is configured for team knowledge.'
                    : 'No shared folder is configured yet.')
                  : 'On the server, team files are shared across all users.'
              }
            />

            <SectionCard
              title="Team Configuration"
              description={isElectron ? 'Point every teammate to the same shared folder.' : 'Manage your team identity for shared edits.'}
            >
              {isElectron ? (
                <>
                  <FieldRow
                    label="Team Brain Path"
                    description="Use Dropbox, Google Drive, or another shared folder to share team context."
                  >
                    <div style={{ display: 'flex', gap: 10, flexDirection: isCompactLayout ? 'column' : 'row' }}>
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
                        style={secondaryButtonStyle(false)}
                      >
                        Browse…
                      </button>
                    </div>
                  </FieldRow>

                  <DangerZone
                    title="Disconnect Team Brain"
                    description="Turning this off removes the shared folder from this device only."
                    actionLabel="Disconnect"
                    onAction={() => update({ teamBrainPath: '' })}
                    disabled={!settings.teamBrainPath}
                  />
                </>
              ) : (
                <InlineNote>
                  Team Brain is shared across all users on this server. Edit team files in the Knowledge Browser.
                </InlineNote>
              )}
            </SectionCard>
          </>
        );

      case 'integrations-google':
        return (
          <>
            {!googleConfigured ? (
              <StatusPanel
                title="Google Integration"
                badge={{ label: 'Coming soon', tone: 'neutral' }}
                description="Google integration is not configured in this build yet."
              />
            ) : (
              <>
                <StatusPanel
                  title="Connection Status"
                  badge={{ label: googleConnected ? 'Connected' : 'Disconnected', tone: googleConnected ? 'success' : 'warning' }}
                  description={
                    googleConnected
                      ? 'Your Google account is connected and ready to sync calendar data.'
                      : 'Connect a Google account to sync Calendar events and export to Docs.'
                  }
                  actions={(
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {!googleConnected ? (
                        <button
                          onClick={async () => {
                            setGoogleMessage('');
                            try {
                              await window.keel.googleConnect();
                              setGoogleConnected(true);
                              setGoogleMessage('Connected successfully.');
                            } catch (err) {
                              setGoogleMessage(err instanceof Error ? err.message : 'Connection failed');
                            }
                          }}
                          style={primaryButtonStyle(false)}
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
                                setGoogleMessage(`Synced ${result.eventCount} events.`);
                              } catch (err) {
                                setGoogleMessage(err instanceof Error ? err.message : 'Sync failed');
                              }
                              setGoogleSyncing(false);
                            }}
                            disabled={googleSyncing}
                            style={primaryButtonStyle(googleSyncing)}
                          >
                            {googleSyncing ? 'Syncing...' : 'Sync Calendar'}
                          </button>
                          <button
                            onClick={async () => {
                              await window.keel.googleDisconnect();
                              setGoogleConnected(false);
                              setGoogleMessage('Disconnected.');
                            }}
                            style={secondaryButtonStyle(false)}
                          >
                            Disconnect
                          </button>
                        </>
                      )}
                    </div>
                  )}
                />
                {googleMessage && (
                  <InlineMessage
                    tone={googleMessage.toLowerCase().includes('fail') || googleMessage.toLowerCase().includes('error') ? 'danger' : 'success'}
                  >
                    {googleMessage}
                  </InlineMessage>
                )}
              </>
            )}
          </>
        );

      case 'cloud-sync':
        return (
          <CloudMigrationSection />
        );

      case 'advanced-developer':
        return (
          <>
            <SectionCard
              title="Runtime Overrides"
              description="Advanced connection controls and future diagnostics live here."
            >
              <FieldRow
                label="OpenRouter Base URL"
                description="Override the OpenAI-compatible endpoint if you are using a custom gateway."
              >
                <input
                  type="text"
                  value={settings.openrouterBaseUrl}
                  onChange={(e) => update({ openrouterBaseUrl: e.target.value })}
                  placeholder="https://openrouter.ai/api/v1"
                  style={inputStyle}
                />
              </FieldRow>
            </SectionCard>
            <PlaceholderPanel
              title="Developer tools will expand here"
              description="Diagnostics, environment checks, and future reset tools should land in this section."
            />
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid var(--border-default)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              fontSize: 'var(--text-xl)',
              padding: '2px 6px',
              borderRadius: 'var(--radius-md)',
              transition: 'var(--transition-fast)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; }}
          >
            ←
          </button>
          <span style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)' }}>Settings</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 12, color: saved ? '#86efac' : 'var(--text-muted)' }}>
            {saving ? 'Saving…' : saved ? 'All changes saved' : 'Autosave on'}
          </div>
          <button onClick={save} disabled={saving} style={primaryButtonStyle(saving)}>
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save now'}
          </button>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: isCompactLayout ? 'column' : 'row',
          minHeight: 0,
        }}
      >
        <div
          style={{
            width: isCompactLayout ? '100%' : 264,
            flexShrink: 0,
            minHeight: 0,
            borderRight: isCompactLayout ? 'none' : '1px solid var(--border-default)',
            borderBottom: isCompactLayout ? '1px solid var(--border-default)' : 'none',
            padding: isCompactLayout ? '16px 20px' : '22px 18px',
            overflowY: 'auto',
          }}
        >
          {NAV_GROUPS.map((group) => (
            <div key={group.label} style={{ marginBottom: 22 }}>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-subtle)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: 10,
                  paddingLeft: 10,
                }}
              >
                {group.label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedSection(item.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      textAlign: 'left',
                      padding: '11px 12px',
                      borderRadius: 'var(--radius-lg)',
                      border: 'none',
                      background: selectedSection === item.id ? 'var(--surface-selected)' : 'transparent',
                      color: selectedSection === item.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: 14,
                    }}
                  >
                    <span>{item.label}</span>
                    {item.id === 'integrations-google' && googleConnected && (
                      <StatusBadge label="On" tone="success" />
                    )}
                    {item.id === 'knowledge-team' && settings.teamBrainPath && (
                      <StatusBadge label="On" tone="success" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto', padding: isCompactLayout ? 20 : '26px 34px 40px' }}>
          <div style={{ maxWidth: 860, margin: '0 auto' }}>
            <div style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.1, color: 'var(--text-primary)' }}>
                    {SECTION_META[selectedSection].title}
                  </h1>
                  <p style={{ margin: '10px 0 0', fontSize: 15, color: 'var(--text-muted)', maxWidth: 560, lineHeight: 1.5 }}>
                    {SECTION_META[selectedSection].description}
                  </p>
                </div>
              </div>
            </div>

	            {selectedSection === 'general-personal' && (
	              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
	                {summaryChips.map((chip) => (
	                  <div
	                    key={chip.label}
	                    style={{
	                      display: 'flex',
	                      alignItems: 'center',
	                      gap: 8,
	                      padding: '8px 10px',
	                      borderRadius: 999,
	                      background: 'var(--surface-muted)',
	                      border: '1px solid var(--panel-border)',
	                      fontSize: 12,
	                    }}
	                  >
	                    <span style={{ color: 'var(--text-subtle)' }}>{chip.label}</span>
	                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{chip.value}</span>
	                  </div>
	                ))}
	              </div>
	            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {renderSection()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        padding: '22px 24px',
        borderRadius: 20,
        background: 'var(--surface-panel)',
        border: '1px solid var(--panel-border)',
      }}
    >
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
        {description && (
          <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.5, color: 'var(--text-muted)' }}>
            {description}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {children}
      </div>
    </section>
  );
}

function FieldRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          marginBottom: 8,
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-subtle)',
          fontWeight: 600,
        }}
      >
        {label}
      </label>
      {description && (
        <div style={{ marginBottom: 10, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {description}
        </div>
      )}
      {children}
    </div>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
}) {
  return (
    <span
      style={{
        ...statusTone(tone),
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </span>
  );
}

function StatusPanel({
  title,
  description,
  badge,
  actions,
}: {
  title: string;
  description: string;
  badge: { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'accent' };
  actions?: React.ReactNode;
}) {
  return (
    <section
      style={{
        padding: '20px 22px',
        borderRadius: 20,
        background: 'var(--surface-elevated)',
        border: '1px solid var(--panel-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
            <StatusBadge label={badge.label} tone={badge.tone} />
          </div>
          <div style={{ marginTop: 8, fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {description}
          </div>
        </div>
        {actions}
      </div>
    </section>
  );
}

function PlaceholderPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section
      style={{
        padding: '22px 24px',
        borderRadius: 20,
        background: 'var(--surface-panel)',
        border: '1px dashed var(--panel-border-strong)',
      }}
    >
      <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
      <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.5, color: 'var(--text-muted)' }}>{description}</div>
    </section>
  );
}

function InlineNote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
      {children}
    </div>
  );
}

function InlineMessage({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'success' | 'danger';
}) {
  return (
    <div
      style={{
        ...(tone === 'success' ? statusTone('success') : statusTone('danger')),
        padding: '12px 14px',
        borderRadius: 14,
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

function DangerZone({
  title,
  description,
  actionLabel,
  onAction,
  disabled,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        marginTop: 8,
        paddingTop: 18,
        borderTop: '1px solid rgba(248, 113, 113, 0.16)',
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 600, color: '#fca5a5' }}>{title}</div>
      <div style={{ marginTop: 6, marginBottom: 12, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {description}
      </div>
      <button
        onClick={onAction}
        disabled={disabled}
        style={{
          padding: '10px 14px',
          borderRadius: 10,
          border: '1px solid rgba(248, 113, 113, 0.2)',
          background: 'rgba(248, 113, 113, 0.08)',
          color: disabled ? 'rgba(252, 165, 165, 0.45)' : '#fca5a5',
          fontSize: 13,
          fontWeight: 600,
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.7 : 1,
        }}
      >
        {actionLabel}
      </button>
    </div>
  );
}

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '10px 14px',
    borderRadius: 10,
    border: 'none',
    background: 'var(--accent)',
    color: 'var(--button-primary-text)',
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    whiteSpace: 'nowrap',
  };
}

function secondaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid var(--panel-border-strong)',
    background: 'var(--surface-muted)',
    color: 'var(--text-secondary)',
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    whiteSpace: 'nowrap',
  };
}

const inlineCodeStyle: React.CSSProperties = {
  background: 'var(--surface-selected)',
  padding: '2px 6px',
  borderRadius: 6,
  fontSize: 12,
};

function CloudMigrationSection() {
  const [serverUrl, setServerUrl] = useState(
    () => localStorage.getItem('keel_cloud_server') || ''
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
      migrate.onMigrationProgress((update: { step: string; current: number; total: number }) => setProgress(update));
      return () => migrate.removeMigrationListeners();
    }
    return undefined;
  }, []);

  const handleAuth = async () => {
    if (!serverUrl || !email || !password) {
      setResult({ ok: false, message: 'Please fill in all fields.' });
      return;
    }

    setResult(null);
    try {
      let res = await fetch(`${serverUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        res = await fetch(`${serverUrl}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Auth failed' }));
        setResult({ ok: false, message: (err as { error?: string }).error || 'Authentication failed.' });
        return;
      }

      const data = await res.json() as { accessToken: string; refreshToken: string };
      setAccessToken(data.accessToken);
      localStorage.setItem('keel_cloud_server', serverUrl);
      setAuthStep('ready');
      setResult({ ok: true, message: 'Authenticated. Ready to migrate.' });
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Connection failed.' });
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
        const imported = res.imported;
        setResult({
          ok: true,
          message: `Migration complete. Synced ${imported.brainFiles} brain files, ${imported.chatSessions} chats, and ${imported.reminders} reminders.`,
        });
      } else {
        setResult({ ok: false, message: res.error || 'Migration failed.' });
      }
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Migration failed.' });
    }

    setMigrating(false);
    setAuthStep('ready');
  };

  if (!isElectron) {
    return (
      <PlaceholderPanel
        title="Desktop only"
        description="Cloud migration is only available from the desktop app because it copies local data into the cloud workspace."
      />
    );
  }

  return (
    <section
      style={{
        padding: '22px 24px',
        borderRadius: 20,
        background: 'var(--surface-panel)',
        border: '1px solid var(--panel-border)',
      }}
    >
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>Cloud Migration Workflow</div>
        <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.5, color: 'var(--text-muted)' }}>
          Migrate desktop data so the same context is available from mobile and cloud clients.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        <StatusBadge label="Step 1" tone="accent" />
        <StatusBadge label={authStep === 'credentials' ? 'Authenticate' : authStep === 'ready' ? 'Ready' : 'Migrating'} tone={authStep === 'migrating' ? 'warning' : 'neutral'} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FieldRow label="Server URL" description="Target Keel cloud server.">
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="https://keel-api.fly.dev"
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--control-bg)',
              border: '1px solid var(--control-border)',
              color: 'var(--text-primary)',
              fontSize: 'var(--text-base)',
              outline: 'none',
              fontFamily: 'inherit',
            }}
            disabled={authStep === 'migrating'}
          />
        </FieldRow>

        {authStep === 'credentials' && (
          <>
            <FieldRow label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--control-bg)',
                  border: '1px solid var(--control-border)',
                  color: 'var(--text-primary)',
                  fontSize: 'var(--text-base)',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
            </FieldRow>
            <FieldRow label="Password" description="A new cloud account will be created if one does not exist.">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Cloud account password"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--control-bg)',
                  border: '1px solid var(--control-border)',
                  color: 'var(--text-primary)',
                  fontSize: 'var(--text-base)',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
            </FieldRow>
            <button onClick={handleAuth} style={primaryButtonStyle(false)}>
              Connect to Cloud
            </button>
          </>
        )}

        {authStep === 'ready' && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={handleMigrate} disabled={migrating} style={primaryButtonStyle(migrating)}>
              {migrating ? 'Migrating...' : 'Start Migration'}
            </button>
            <button
              onClick={() => {
                setAuthStep('credentials');
                setAccessToken(null);
                setResult(null);
              }}
              style={secondaryButtonStyle(false)}
            >
              Change Account
            </button>
          </div>
        )}

        {authStep === 'migrating' && progress && (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 14,
              background: 'rgba(207,122,92,0.08)',
              border: '1px solid rgba(207,122,92,0.18)',
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 8 }}>{progress.step}</div>
            {progress.total > 0 && (
              <div style={{ height: 6, borderRadius: 4, background: 'var(--surface-selected)', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    background: 'var(--accent)',
                    width: `${Math.min(100, (progress.current / progress.total) * 100)}%`,
                    transition: 'width 0.3s',
                  }}
                />
              </div>
            )}
          </div>
        )}

        {result && (
          <InlineMessage tone={result.ok ? 'success' : 'danger'}>
            {result.message}
          </InlineMessage>
        )}
      </div>
    </section>
  );
}
