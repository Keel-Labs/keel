import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Settings as SettingsType,
  OllamaModelInfo,
  WikiFileImport,
  WikiSourceInput,
  WikiSourceType,
  XStatus,
} from '../../shared/types';
import { applyTheme } from '../theme';
import { BUILT_IN_PERSONALITIES } from '../../core/personalities';

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

function formatOpenAIModelLabel(modelId: string): string {
  const known = OPENAI_MODELS.find((model) => model.value === modelId);
  if (known) return known.label;

  return modelId
    .split('-')
    .map((part) => {
      if (/^\d/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

const PROVIDERS = [
  { value: 'claude', label: 'Claude', description: 'Anthropic reasoning and writing.' },
  { value: 'openai', label: 'OpenAI', description: 'General-purpose GPT models.' },
  { value: 'openrouter', label: 'OpenRouter', description: 'Any OpenAI-compatible endpoint.' },
  { value: 'ollama', label: 'Ollama', description: 'Local models running on your machine.' },
] as const;

export type SettingsSectionId =
  | 'general-personal'
  | 'general-personality'
  | 'general-workspace'
  | 'general-notifications'
  | 'ai-provider'
  | 'ai-models'
  | 'ai-local'
  | 'knowledge-storage'
  | 'knowledge-sources'
  | 'knowledge-team'
  | 'integrations-x'
  | 'integrations-google'
  | 'advanced-developer';

const SETTINGS_SECTION_IDS: SettingsSectionId[] = [
  'general-personal',
  'general-personality',
  'general-workspace',
  'general-notifications',
  'ai-provider',
  'ai-models',
  'ai-local',
  'knowledge-storage',
  'knowledge-sources',
  'knowledge-team',
  'integrations-x',
  'integrations-google',
  'advanced-developer',
];

const SECTION_META: Record<SettingsSectionId, { title: string; description: string }> = {
  'general-personal': {
    title: 'Personal Settings',
    description: 'Preferences that shape how Keel works with you.',
  },
  'general-personality': {
    title: 'Personality',
    description: 'Choose how Keel sounds when it talks to you.',
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
  'knowledge-sources': {
    title: 'Sources',
    description: 'Source ingestion now happens inside the Wiki workspace.',
  },
  'knowledge-team': {
    title: 'Team Brain',
    description: 'Configure shared team context and collaboration settings.',
  },
  'integrations-x': {
    title: 'X',
    description: 'Draft and ingest X posts while the live account connection is still being built.',
  },
  'integrations-google': {
    title: 'Google',
    description: 'Manage Google account connection and sync behavior.',
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
      { id: 'general-personality', label: 'Personality' },
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
      { id: 'knowledge-sources', label: 'Sources' },
      { id: 'knowledge-team', label: 'Team Brain' },
    ],
  },
  {
    label: 'Integrations',
    items: [
      { id: 'integrations-x', label: 'X' },
      { id: 'integrations-google', label: 'Google' },
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

function isSettingsSectionId(value: string | null): value is SettingsSectionId {
  return !!value && SETTINGS_SECTION_IDS.includes(value as SettingsSectionId);
}

function getSettingsSearchParam(name: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

function resolveSettingsSection(section?: SettingsSectionId): SettingsSectionId {
  if (section) return section;
  const searchSection = getSettingsSearchParam('section');
  return isSettingsSectionId(searchSection) ? searchSection : 'general-personal';
}

function resolveSourcesBasePath(basePath?: string): string {
  return basePath ?? getSettingsSearchParam('basePath') ?? '';
}

function resolveCreateBaseModal(createBase?: boolean): boolean {
  return createBase ?? getSettingsSearchParam('createBase') === '1';
}

export interface SettingsNavigationState {
  section?: SettingsSectionId;
  basePath?: string;
  createBase?: boolean;
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
  navigation?: SettingsNavigationState;
}

export default function Settings({ onBack, navigation }: Props) {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [selectedSection, setSelectedSection] = useState<SettingsSectionId>(() => resolveSettingsSection(navigation?.section));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [googleSyncing, setGoogleSyncing] = useState(false);
  const [googleMessage, setGoogleMessage] = useState('');
  const [xStatus, setXStatus] = useState<XStatus | null>(null);
  const [xMessage, setXMessage] = useState('');
  const [xBusy, setXBusy] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<OllamaModelInfo[]>([]);
  const [openaiModels, setOpenaiModels] = useState<string[]>([]);
  const [openaiModelsLoading, setOpenaiModelsLoading] = useState(false);
  const [openaiModelError, setOpenaiModelError] = useState<string | null>(null);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const [ollamaManualEntry, setOllamaManualEntry] = useState(false);
  const [isCompactLayout, setIsCompactLayout] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 980
  );
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSettingsRef = useRef<SettingsType | null>(null);
  const hasPendingSaveRef = useRef(false);

  const fetchOpenAIModels = useCallback(async () => {
    setOpenaiModelsLoading(true);
    setOpenaiModelError(null);
    try {
      const result = await window.keel.openaiListModels();
      setOpenaiModels(result.models);
      setOpenaiModelError(result.error);
    } catch {
      setOpenaiModels([]);
      setOpenaiModelError('Failed to fetch OpenAI models');
    } finally {
      setOpenaiModelsLoading(false);
    }
  }, []);

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

  const refreshXStatus = useCallback(async () => {
    try {
      const status = await window.keel.xStatus();
      setXStatus(status);
    } catch {
      setXStatus(null);
    }
  }, []);

  useEffect(() => {
    window.keel.getSettings().then((s) => {
      setSettings(s);
      latestSettingsRef.current = s;
      if (s.provider === 'ollama') fetchOllamaModels();
      if (s.openaiApiKey) fetchOpenAIModels();
    }).catch(() => {});
    window.keel.googleStatus().then((s) => {
      setGoogleConnected(s.connected);
      setGoogleConfigured(s.configured ?? false);
    }).catch(() => {});
    refreshXStatus().catch(() => {});
  }, [fetchOllamaModels, fetchOpenAIModels, refreshXStatus]);

  useEffect(() => {
    if (!settings?.openaiApiKey) {
      setOpenaiModels([]);
      setOpenaiModelsLoading(false);
      setOpenaiModelError(null);
      return;
    }

    const timer = setTimeout(() => {
      fetchOpenAIModels();
    }, 500);

    return () => clearTimeout(timer);
  }, [fetchOpenAIModels, settings?.openaiApiKey]);

  useEffect(() => {
    const onResize = () => setIsCompactLayout(window.innerWidth < 980);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (hasPendingSaveRef.current && latestSettingsRef.current) {
      void window.keel.saveSettings(latestSettingsRef.current);
    }
  }, []);

  useEffect(() => {
    setSelectedSection(resolveSettingsSection(navigation?.section));
  }, [navigation?.section]);

  if (!settings) return null;

  const persistSettings = async (nextSettings: SettingsType) => {
    setSaving(true);
    try {
      applyTheme(nextSettings.theme);
      await window.keel.saveSettings(nextSettings);
      hasPendingSaveRef.current = false;
      setSaved(true);
    } catch {
      // Save feedback remains local to the page for now.
    }
    setSaving(false);
  };

  const update = (partial: Partial<SettingsType>) => {
    const newSettings = { ...settings, ...partial };
    setSettings(newSettings);
    latestSettingsRef.current = newSettings;
    if ('theme' in partial) applyTheme(newSettings.theme);
    setSaved(false);
    hasPendingSaveRef.current = true;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await persistSettings(newSettings);
    }, 500);
  };

  const save = async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    hasPendingSaveRef.current = true;
    await persistSettings(settings);
  };

  const handleBack = async () => {
    if (hasPendingSaveRef.current) {
      await save();
    }
    onBack();
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
    { label: 'Theme', value: settings.theme === 'system' ? 'System' : settings.theme === 'light' ? 'Light' : 'Dark' },
    { label: 'Provider', value: providerLabel(settings.provider) },
    { label: 'Timezone', value: settings.timezone || 'Auto' },
    { label: 'Google', value: googleConnected ? 'Connected' : googleConfigured ? 'Ready to connect' : 'Unavailable' },
    { label: 'X', value: xStatus?.connected ? 'Connected' : settings.xClientId ? 'Ready to connect' : 'Not configured' },
    { label: 'Team Brain', value: settings.teamBrainPath ? 'Enabled' : 'Off' },
  ];

  const openaiModelOptionIds = Array.from(new Set([
    ...(settings.openaiApiKey ? openaiModels : OPENAI_MODELS.map((model) => model.value)),
    settings.openaiModel,
  ].filter(Boolean)));
  const openaiModelOptions = openaiModelOptionIds
    .map((modelId) => ({ value: modelId, label: formatOpenAIModelLabel(modelId) }));

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

  const renderProviderCredentials = () => {
    if (settings.provider === 'claude') {
      return renderApiKeyInput('Anthropic API Key', settings.anthropicApiKey, 'anthropicApiKey', 'claude');
    }
    if (settings.provider === 'openai') {
      return renderApiKeyInput('OpenAI API Key', settings.openaiApiKey, 'openaiApiKey', 'openai');
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
          ? Boolean(settings.anthropicApiKey)
          : settings.provider === 'openai'
            ? Boolean(settings.openaiApiKey)
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
      return (
        <SectionCard
          title="Model Selection"
          description="Choose the default OpenAI model for your conversations. Keel now uses the live model list available to the configured API key."
        >
          <FieldRow label="OpenAI Model">
            <select
              value={settings.openaiModel}
              onChange={(e) => update({ openaiModel: e.target.value })}
              style={selectStyle}
            >
              {openaiModelOptions.map((model) => (
                <option key={model.value} value={model.value}>{model.label}</option>
              ))}
            </select>
            {settings.openaiApiKey && openaiModelsLoading && (
              <InlineNote>Loading the live OpenAI model list for this API key…</InlineNote>
            )}
            {openaiModelError && (
              <InlineNote>
                Could not load the live OpenAI model list: {openaiModelError}
              </InlineNote>
            )}
            {settings.openaiApiKey && !openaiModelsLoading && !openaiModelError && (
              <InlineNote>Loaded {openaiModels.length} OpenAI models from the configured API key.</InlineNote>
            )}
          </FieldRow>
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
                description="Follow your OS appearance by default, or override it with a manual light or dark theme."
              >
                <div style={{ display: 'inline-flex', gap: 6, padding: 4, borderRadius: 14, background: 'var(--surface-muted)', border: '1px solid var(--panel-border)' }}>
                  {(['system', 'dark', 'light'] as const).map((themeOption) => {
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
                        {themeOption === 'system'
                          ? 'Use system'
                          : themeOption === 'dark'
                            ? 'Dark mode'
                            : 'Light mode'}
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

      case 'general-personality':
        return (
          <SectionCard title="Keel's Voice" description="This adds flavor to greetings, sign-offs, and asides — it doesn't change how Keel writes documents or briefs.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {BUILT_IN_PERSONALITIES.map((p) => (
                <label
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: '14px 16px',
                    borderRadius: 'var(--radius-xl)',
                    background: (settings.personality || 'default') === p.id ? 'var(--accent-bg)' : 'var(--surface-panel)',
                    border: `1px solid ${(settings.personality || 'default') === p.id ? 'var(--accent-border)' : 'var(--panel-border)'}`,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="personality"
                    checked={(settings.personality || 'default') === p.id}
                    onChange={() => update({ personality: p.id })}
                    style={{ accentColor: 'var(--accent)', marginTop: 2 }}
                  />
                  <div>
                    <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                      {p.description}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </SectionCard>
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

      case 'knowledge-sources':
        return (
          <>
            <StatusPanel
              title="Wiki Sources"
              badge={{ label: 'Moved', tone: 'accent' }}
              description="Add sources from the Wiki workspace so the ingest flow, base list, and synthesis page stay in one place."
            />

            <SectionCard
              title="Where To Go Now"
              description="Source ingestion is no longer a settings workflow."
            >
              <InlineNote>
                Open <code style={inlineCodeStyle}>Wiki</code> to:
              </InlineNote>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  1. See every wiki base Keel has already indexed and learned.
                </div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  2. Create a new base if the topic does not exist yet.
                </div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  3. Add URLs, pasted text, or files directly into the target base.
                </div>
              </div>
            </SectionCard>
          </>
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

      case 'integrations-x':
        return (
          <>
            <StatusPanel
              title="Connection Status"
              badge={{
                label: xStatus?.connected ? 'Connected' : settings.xClientId ? 'Ready to connect' : 'Not configured',
                tone: xStatus?.connected ? 'success' : settings.xClientId ? 'warning' : 'neutral',
              }}
              description={
                xStatus?.connected
                  ? `Connected to ${xStatus.account?.username ? `@${xStatus.account.username}` : 'X'}. You can sync bookmarks and publish drafts from Keel.`
                  : 'Add your X Client ID, then connect your account using OAuth 2.0 PKCE.'
              }
              actions={(
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {!xStatus?.connected ? (
                    <button
                      onClick={async () => {
                        setXBusy(true);
                        setXMessage('');
                        try {
                          await save();
                          const account = await window.keel.xConnect();
                          setXMessage(`Connected to @${account.username}.`);
                          await refreshXStatus();
                        } catch (err) {
                          setXMessage(err instanceof Error ? err.message : 'X connection failed');
                          await refreshXStatus();
                        } finally {
                          setXBusy(false);
                        }
                      }}
                      disabled={xBusy || !settings.xClientId.trim()}
                      style={primaryButtonStyle(xBusy || !settings.xClientId.trim())}
                    >
                      {xBusy ? 'Connecting...' : 'Connect X Account'}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={async () => {
                          setXBusy(true);
                          setXMessage('');
                          try {
                            const result = await window.keel.xSyncBookmarks();
                            const syncSummary = result.syncedCount === 0
                              ? `No new bookmarks. Skipped ${result.skippedCount} already-ingested posts in ${result.targetBaseTitle}.`
                              : `Synced ${result.syncedCount} new bookmarks into ${result.targetBaseTitle} and skipped ${result.skippedCount} already-ingested posts.`;
                            setXMessage(result.stoppedEarly ? `${syncSummary} Sync stopped early after reaching known bookmarks.` : syncSummary);
                            await refreshXStatus();
                          } catch (err) {
                            setXMessage(err instanceof Error ? err.message : 'Bookmark sync failed');
                            await refreshXStatus();
                          } finally {
                            setXBusy(false);
                          }
                        }}
                        disabled={xBusy}
                        style={primaryButtonStyle(xBusy)}
                      >
                        {xBusy ? 'Syncing...' : 'Sync Bookmarks'}
                      </button>
                      <button
                        onClick={async () => {
                          setXBusy(true);
                          setXMessage('');
                          try {
                            await window.keel.xDisconnect();
                            setXMessage('Disconnected from X.');
                            await refreshXStatus();
                          } catch (err) {
                            setXMessage(err instanceof Error ? err.message : 'Disconnect failed');
                          } finally {
                            setXBusy(false);
                          }
                        }}
                        style={secondaryButtonStyle(xBusy)}
                        disabled={xBusy}
                      >
                        Disconnect
                      </button>
                    </>
                  )}
                </div>
              )}
            />

            {xMessage && (
              <InlineMessage
                tone={xMessage.toLowerCase().includes('fail') || xMessage.toLowerCase().includes('error') ? 'danger' : 'success'}
              >
                {xMessage}
              </InlineMessage>
            )}

            <SectionCard
              title="App Configuration"
              description="Keel uses X OAuth 2.0 PKCE as a public client. You only need the App Client ID for this slice."
            >
              <FieldRow
                label="X Client ID"
                description="Find this in your X developer app under Keys and Tokens. Save it here before connecting."
              >
                <input
                  type="text"
                  value={settings.xClientId}
                  onChange={(e) => update({ xClientId: e.target.value })}
                  placeholder="Paste your X Client ID"
                  style={inputStyle}
                />
              </FieldRow>
              <InlineNote>
                This slice requests <code style={inlineCodeStyle}>tweet.read</code>, <code style={inlineCodeStyle}>users.read</code>, <code style={inlineCodeStyle}>bookmark.read</code>, <code style={inlineCodeStyle}>tweet.write</code>, and <code style={inlineCodeStyle}>offline.access</code>.
              </InlineNote>
              <InlineNote>
                Configure this exact X callback URL in your developer app: <code style={inlineCodeStyle}>{xStatus?.redirectUri || 'http://127.0.0.1:43021/callback'}</code>
              </InlineNote>
            </SectionCard>

            <SectionCard
              title="Bookmark Sync"
              description="Manual sync currently imports your recent bookmarks into a dedicated wiki base."
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  Sync target: {xStatus?.targetBaseTitle || 'X Bookmarks'}
                </div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  Last sync: {xStatus?.lastSyncAt ? new Date(xStatus.lastSyncAt).toLocaleString() : 'Not synced yet'}
                </div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  Last sync result: {xStatus?.lastSyncAt
                    ? `${xStatus.lastSyncNewCount || 0} new, ${xStatus.lastSyncSkippedCount || 0} skipped, ${xStatus.lastSyncFetchedCount || 0} fetched`
                    : 'No sync results yet'}
                </div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  Status: {xStatus?.status || 'idle'}
                </div>
              </div>
              <InlineNote>
                Bookmark sync currently lands in one dedicated base. Topic-based routing and inbox review will come in the next slice.
              </InlineNote>
            </SectionCard>

            <SectionCard
              title="Publishing"
              description="Composer drafts now publish directly through the X API after explicit confirmation."
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  Granted scopes: {(xStatus?.scopes || []).join(', ')}
                </div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  Last publish: {xStatus?.lastPublishAt ? new Date(xStatus.lastPublishAt).toLocaleString() : 'Not published yet'}
                </div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  Latest post: {xStatus?.lastPublishedUrl ? <a href={xStatus.lastPublishedUrl} target="_blank" rel="noopener noreferrer">{xStatus.lastPublishedUrl}</a> : 'No published post yet'}
                </div>
              </div>
              {xStatus?.lastPublishError && (
                <InlineMessage tone="danger">
                  {xStatus.lastPublishError}
                </InlineMessage>
              )}
            </SectionCard>
          </>
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
            onClick={() => { handleBack().catch(() => onBack()); }}
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

interface SettingsWikiBaseSummary {
  path: string;
  title: string;
  description: string;
}

interface SettingsWikiSourceSummary {
  path: string;
  title: string;
  summary: string;
  updatedAt: number;
}

function WikiSourcesSection({
  initialBasePath,
  initialCreateBaseModal,
  isCompactLayout,
}: {
  initialBasePath: string;
  initialCreateBaseModal: boolean;
  isCompactLayout: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bases, setBases] = useState<SettingsWikiBaseSummary[]>([]);
  const [currentBasePath, setCurrentBasePath] = useState(initialBasePath);
  const [sourcePages, setSourcePages] = useState<SettingsWikiSourceSummary[]>([]);
  const [newBaseTitle, setNewBaseTitle] = useState('');
  const [newBaseDescription, setNewBaseDescription] = useState('');
  const [newBaseError, setNewBaseError] = useState('');
  const [newBaseNotice, setNewBaseNotice] = useState('');
  const [isCreatingBase, setIsCreatingBase] = useState(false);
  const [showCreateBaseModal, setShowCreateBaseModal] = useState(initialCreateBaseModal);
  const [ingestMode, setIngestMode] = useState<WikiSourceType>('url');
  const [ingestTitle, setIngestTitle] = useState('');
  const [ingestUrl, setIngestUrl] = useState('');
  const [ingestText, setIngestText] = useState('');
  const [ingestFile, setIngestFile] = useState<WikiFileImport | null>(null);
  const [ingestError, setIngestError] = useState('');
  const [ingestNotice, setIngestNotice] = useState('');
  const [isIngesting, setIsIngesting] = useState(false);

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

  const loadBaseSummaries = useCallback(async () => {
    await window.keel.ensureBrain();
    const baseEntries = await window.keel.listFiles('knowledge-bases');
    const baseDirs = baseEntries.filter((entry) => entry.isDirectory);

    const summaries = await Promise.all(baseDirs.map(async (entry) => {
      const overviewPath = `${entry.path}/overview.md`;
      let title = formatSettingsWikiTitle(entry.name);
      let description = 'LLM-maintained wiki workspace.';

      try {
        const content = await window.keel.readFile(overviewPath);
        title = extractSettingsWikiTitle(content, title);
        description = extractSettingsWikiSummary(content) || description;
      } catch {
        // Keep fallback labels when overview is unavailable.
      }

      return {
        path: entry.path,
        title,
        description,
      };
    }));

    setBases(summaries);
    setCurrentBasePath((previousPath) => {
      if (previousPath && summaries.some((base) => base.path === previousPath)) return previousPath;
      if (initialBasePath && summaries.some((base) => base.path === initialBasePath)) return initialBasePath;
      return summaries[0]?.path || '';
    });
  }, [initialBasePath]);

  const loadSourcePages = useCallback(async (basePath: string) => {
    if (!basePath) {
      setSourcePages([]);
      return;
    }

    try {
      const files = await listSettingsMarkdownFiles(`${basePath}/wiki/sources`);
      const pages = await Promise.all(files.map(async (file) => {
        const content = await window.keel.readFile(file.path);
        return {
          path: file.path,
          title: extractSettingsWikiTitle(content, formatSettingsWikiTitle(file.path.split('/').pop() || 'Source')),
          summary: extractSettingsWikiSummary(content),
          updatedAt: file.updatedAt,
        } satisfies SettingsWikiSourceSummary;
      }));

      setSourcePages(pages.sort((left, right) => right.updatedAt - left.updatedAt));
    } catch {
      setSourcePages([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError('');
        await loadBaseSummaries();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load wiki sources.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadBaseSummaries]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await loadSourcePages(currentBasePath);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load source pages.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentBasePath, loadSourcePages]);

  useEffect(() => {
    setShowCreateBaseModal(initialCreateBaseModal);
  }, [initialCreateBaseModal]);

  const currentBase = bases.find((base) => base.path === currentBasePath) || null;

  const handleCreateBase = useCallback(async () => {
    setIsCreatingBase(true);
    setNewBaseError('');
    setNewBaseNotice('');

    try {
      const result = await window.keel.createWikiBase(newBaseTitle, newBaseDescription.trim() || undefined);
      await loadBaseSummaries();
      setCurrentBasePath(result.basePath);
      setNewBaseTitle('');
      setNewBaseDescription('');
      setNewBaseNotice(result.message);
      setShowCreateBaseModal(false);
    } catch (err) {
      setNewBaseError(err instanceof Error ? err.message : 'Failed to create wiki base.');
    } finally {
      setIsCreatingBase(false);
    }
  }, [loadBaseSummaries, newBaseDescription, newBaseTitle]);

  const resetForm = useCallback(() => {
    setIngestMode('url');
    setIngestTitle('');
    setIngestUrl('');
    setIngestText('');
    setIngestFile(null);
    setIngestError('');
  }, []);

  const pickIngestFile = useCallback(async () => {
    setIngestError('');
    const files = await window.keel.pickWikiFiles();
    setIngestFile(files[0] || null);
  }, []);

  const handleIngestSubmit = useCallback(async () => {
    if (!currentBasePath) {
      setIngestError('Choose a wiki base before adding a source.');
      return;
    }

    const payload: WikiSourceInput = {
      sourceType: ingestMode,
      title: ingestTitle.trim() || undefined,
    };

    if (ingestMode === 'url') {
      payload.url = ingestUrl.trim();
    } else if (ingestMode === 'text') {
      payload.text = ingestText.trim();
    } else if (ingestFile) {
      payload.filePath = ingestFile.path;
      payload.fileName = ingestFile.name;
    }

    setIsIngesting(true);
    setIngestError('');
    setIngestNotice('');

    try {
      const result = await window.keel.ingestWikiSource(currentBasePath, payload);
      await loadSourcePages(currentBasePath);
      resetForm();
      setIngestNotice(result.warning || result.message);
    } catch (err) {
      setIngestError(err instanceof Error ? err.message : 'Failed to ingest source.');
    } finally {
      setIsIngesting(false);
    }
  }, [
    currentBasePath,
    ingestFile,
    ingestMode,
    ingestText,
    ingestTitle,
    ingestUrl,
    loadSourcePages,
    resetForm,
  ]);

  const ingestCanSubmit =
    !!currentBasePath &&
    (
      (ingestMode === 'url' && ingestUrl.trim()) ||
      (ingestMode === 'text' && ingestText.trim()) ||
      (ingestMode === 'file' && ingestFile)
    );

  if (loading && bases.length === 0) {
    return <PlaceholderPanel title="Loading sources" description="Inspecting wiki bases and source pages." />;
  }

  return (
    <>
      <StatusPanel
        title="Sources Workspace"
        badge={{ label: currentBase ? 'Ready' : 'No base selected', tone: currentBase ? 'success' : 'warning' }}
        description={
          currentBase
            ? `Add source material to ${currentBase.title} and keep its source pages in one place.`
            : 'Choose a wiki base to begin ingesting sources.'
        }
      />

      <SectionCard
        title="Wiki Base"
        description="Pick the target wiki base. New source packages will be written into its raw and wiki/source folders."
      >
        <FieldRow label="Target Base">
          <select
            value={currentBasePath}
            onChange={(event) => {
              if (event.target.value === '__create__') {
                setShowCreateBaseModal(true);
                setNewBaseError('');
                return;
              }
              setCurrentBasePath(event.target.value);
              setIngestNotice('');
              setIngestError('');
            }}
            style={selectStyle}
          >
            {bases.map((base) => (
              <option key={base.path} value={base.path}>{base.title}</option>
            ))}
            <option value="__create__">Create New Base...</option>
          </select>
        </FieldRow>

        {currentBase && (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 16,
              background: 'var(--surface-elevated)',
              border: '1px solid var(--panel-border)',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{currentBase.title}</div>
            <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted)' }}>
              {currentBase.description}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
              <StatusBadge label={`${sourcePages.length} Sources`} tone="accent" />
              <StatusBadge label="URL / Text / File" tone="neutral" />
            </div>
          </div>
        )}

        {error && <InlineMessage tone="danger">{error}</InlineMessage>}
        {newBaseNotice && <InlineMessage tone="success">{newBaseNotice}</InlineMessage>}
      </SectionCard>

      <SectionCard
        title="Add Source"
        description="Ingest an article, pasted notes, or a document file. Supported files: Markdown, text, PDF, DOCX, and PPTX."
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['url', 'text', 'file'] as WikiSourceType[]).map((mode) => {
            const active = ingestMode === mode;
            const label = mode === 'url'
              ? 'URL Article'
              : mode === 'text'
                ? 'Pasted Text'
                : 'Document File';

            return (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setIngestMode(mode);
                  setIngestError('');
                }}
                style={{
                  padding: '9px 12px',
                  borderRadius: 999,
                  border: `1px solid ${active ? 'var(--accent-border)' : 'var(--panel-border)'}`,
                  background: active ? 'var(--accent-bg)' : 'var(--surface-muted)',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <FieldRow label="Title Override" description="Optional. Keel will derive a title from the source when left blank.">
          <input
            type="text"
            value={ingestTitle}
            onChange={(event) => setIngestTitle(event.target.value)}
            placeholder="Optional title override"
            style={inputStyle}
          />
        </FieldRow>

        {ingestMode === 'url' && (
          <FieldRow label="Article URL">
            <input
              type="text"
              value={ingestUrl}
              onChange={(event) => setIngestUrl(event.target.value)}
              placeholder="https://example.com/article"
              style={inputStyle}
            />
          </FieldRow>
        )}

        {ingestMode === 'text' && (
          <FieldRow label="Source Text">
            <textarea
              value={ingestText}
              onChange={(event) => setIngestText(event.target.value)}
              placeholder="Paste notes, article text, or raw source material."
              style={{ ...inputStyle, minHeight: 220, resize: 'vertical' }}
            />
          </FieldRow>
        )}

        {ingestMode === 'file' && (
          <FieldRow label="Document File" description="Markdown, TXT, PDF, DOCX, and PPTX are supported in this build.">
            <div style={{ display: 'flex', gap: 12, flexDirection: isCompactLayout ? 'column' : 'row', alignItems: isCompactLayout ? 'stretch' : 'center' }}>
              <button type="button" onClick={pickIngestFile} style={secondaryButtonStyle(false)}>
                Choose File
              </button>
              <div style={{ fontSize: 13, color: ingestFile ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {ingestFile?.name || 'No file selected'}
              </div>
            </div>
          </FieldRow>
        )}

        {ingestError && <InlineMessage tone="danger">{ingestError}</InlineMessage>}
        {ingestNotice && <InlineMessage tone="success">{ingestNotice}</InlineMessage>}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <InlineNote>
            Source packages are normalized into <code style={inlineCodeStyle}>raw/</code> and visible pages are created in <code style={inlineCodeStyle}>wiki/sources/</code>.
          </InlineNote>
          <button
            type="button"
            onClick={handleIngestSubmit}
            disabled={!ingestCanSubmit || isIngesting}
            style={primaryButtonStyle(!ingestCanSubmit || isIngesting)}
          >
            {isIngesting ? 'Ingesting...' : 'Add Source'}
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title="Source Pages"
        description="The wiki-visible source pages for the selected base. These are the pages the compiler and reader surfaces use today."
      >
        {sourcePages.length === 0 ? (
          <InlineNote>No source pages have been created for this base yet.</InlineNote>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sourcePages.map((page) => (
              <div
                key={page.path}
                style={{
                  padding: '14px 16px',
                  borderRadius: 16,
                  background: 'var(--surface-elevated)',
                  border: '1px solid var(--panel-border)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{page.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
                    Updated {formatSettingsRelativeTime(page.updatedAt)}
                  </div>
                </div>
                {page.summary && (
                  <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted)' }}>
                    {page.summary}
                  </div>
                )}
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-subtle)' }}>{page.path}</div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {showCreateBaseModal && (
        <div
          className="wiki-modal__backdrop"
          style={{ position: 'fixed' }}
          onClick={() => {
            if (isCreatingBase) return;
            setShowCreateBaseModal(false);
            setNewBaseError('');
          }}
        >
          <div className="wiki-modal" onClick={(event) => event.stopPropagation()}>
            <div className="wiki-modal__header">
              <div>
                <div className="wiki-modal__eyebrow">Wiki Base</div>
                <div className="wiki-modal__title">Create New Base</div>
              </div>
              <button
                type="button"
                className="wiki-modal__close"
                onClick={() => {
                  if (isCreatingBase) return;
                  setShowCreateBaseModal(false);
                  setNewBaseError('');
                }}
              >
                ×
              </button>
            </div>

            <div className="wiki-modal__field">
              <label className="wiki-modal__label">Base Name</label>
              <input
                type="text"
                value={newBaseTitle}
                onChange={(event) => {
                  setNewBaseTitle(event.target.value);
                  setNewBaseError('');
                }}
                placeholder="e.g. Competitive Landscape"
                className="wiki-modal__input"
              />
            </div>

            <div className="wiki-modal__field">
              <label className="wiki-modal__label">Description</label>
              <textarea
                value={newBaseDescription}
                onChange={(event) => setNewBaseDescription(event.target.value)}
                placeholder="Optional description for the wiki home page."
                className="wiki-modal__textarea"
                style={{ minHeight: 120 }}
              />
            </div>

            <div className="wiki-modal__field">
              <InlineNote>
                Keel will create a new folder under <code style={inlineCodeStyle}>knowledge-bases/</code> and initialize a valid wiki skeleton.
              </InlineNote>
            </div>

            {newBaseError && <div className="wiki-modal__error">{newBaseError}</div>}

            <div className="wiki-modal__footer">
              <button
                type="button"
                className="wiki-modal__secondary"
                onClick={() => {
                  if (isCreatingBase) return;
                  setShowCreateBaseModal(false);
                  setNewBaseError('');
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="wiki-modal__primary"
                onClick={() => {
                  handleCreateBase().catch(() => undefined);
                }}
                disabled={!newBaseTitle.trim() || isCreatingBase}
              >
                {isCreatingBase ? 'Creating...' : 'Create Base'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function formatSettingsWikiTitle(input: string): string {
  return input
    .replace(/[-_]+/g, ' ')
    .replace(/\.md$/i, '')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function extractSettingsWikiTitle(content: string, fallback: string): string {
  const heading = content.match(/^#\s+(.+)$/m);
  return heading?.[1]?.trim() || fallback;
}

function extractSettingsWikiSummary(content: string): string {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (!line.startsWith('#') && !line.startsWith('- ') && !line.startsWith('##')) {
      return line;
    }
  }

  return '';
}

function formatSettingsRelativeTime(timestamp: number): string {
  if (!timestamp) return 'Unknown';
  const deltaMs = Date.now() - timestamp;
  const minutes = Math.round(deltaMs / 60000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

async function listSettingsMarkdownFiles(dirPath: string): Promise<Array<{ path: string; updatedAt: number }>> {
  const entries = await window.keel.listFiles(dirPath);
  const files: Array<{ path: string; updatedAt: number }> = [];

  for (const entry of entries) {
    if (entry.isDirectory) {
      const nested = await listSettingsMarkdownFiles(entry.path);
      files.push(...nested);
    } else if (entry.path.endsWith('.md')) {
      files.push({ path: entry.path, updatedAt: entry.updatedAt });
    }
  }

  return files;
}
