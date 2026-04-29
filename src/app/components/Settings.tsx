import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Settings as SettingsType,
  OllamaModelInfo,
  WikiFileImport,
  WikiSourceInput,
  WikiSourceType,
  XStatus,
  ScheduledJob,
} from '../../shared/types';
import { applyTheme } from '../theme';
import { BUILT_IN_PERSONALITIES } from '../../core/personalities';
import { BetaBadge } from './BetaBadge';

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
  | 'general-scheduled-jobs'
  | 'ai-setup'
  | 'integrations'
  | 'help-feedback';

const SETTINGS_SECTION_IDS: SettingsSectionId[] = [
  'general-personal',
  'general-personality',
  'general-scheduled-jobs',
  'ai-setup',
  'integrations',
  'help-feedback',
];

const SECTION_META: Record<SettingsSectionId, { title: string; description: string }> = {
  'general-personal': {
    title: 'Personal Settings',
    description: 'Preferences that shape how Keel works with you.',
  },
  'general-personality': {
    title: 'Personality',
    description: 'Adds flavor to greetings and sign-offs. Doesn\'t affect how Keel writes documents or briefs.',
  },
  'general-scheduled-jobs': {
    title: 'Scheduled Jobs',
    description: '',
  },
  'ai-setup': {
    title: 'Model',
    description: '',
  },
  'integrations': {
    title: 'Integrations',
    description: 'Connect external services to sync data and extend what Keel can do.',
  },
  'help-feedback': {
    title: 'Help & Feedback',
    description: 'Keel is in beta. We read every request and bug report.',
  },
};

const NAV_ITEMS: Array<{ id: SettingsSectionId; label: string }> = [
  { id: 'general-personal', label: 'Personal Settings' },
  { id: 'general-personality', label: 'Personality' },
  { id: 'general-scheduled-jobs', label: 'Scheduled Jobs' },
  { id: 'ai-setup', label: 'Model' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'help-feedback', label: 'Help & Feedback' },
];

// Feedback destination
const FEEDBACK_BOARD_URL = 'https://keel.fider.io';

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
  const [appVersion, setAppVersion] = useState<string>('');
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
    window.keel.getAppVersion?.().then(setAppVersion).catch(() => {});
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

  const renderHelpFeedback = () => {
    const versionLabel = appVersion ? `v${appVersion}` : '…';

    const openBoard = () => {
      window.keel.openPath?.(FEEDBACK_BOARD_URL);
    };

    const linkButtonStyle: React.CSSProperties = {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      width: '100%', padding: '14px 16px', borderRadius: 12,
      background: 'var(--surface-muted)', border: '1px solid var(--panel-border)',
      color: 'var(--text-primary)', fontSize: 14, cursor: 'pointer',
      fontFamily: 'inherit', textAlign: 'left' as const, textDecoration: 'none',
    };

    const README_URL = 'https://github.com/Keel-Labs/keel#readme';
    const openReadme = () => { window.keel.openPath?.(README_URL); };

    const sectionHeading: React.CSSProperties = {
      fontSize: 13, fontWeight: 700, color: 'var(--text-primary)',
      margin: '14px 0 6px',
    };
    const bodyText: React.CSSProperties = {
      fontSize: 13, lineHeight: 1.55, color: 'var(--text-muted)',
    };
    const featureItem: React.CSSProperties = {
      ...bodyText, marginBottom: 8,
    };

    return (
      <>
        <SectionCard
          title="What is Keel?"
          description="Your personal AI chief of staff — a local-first desktop assistant that owns its own memory."
        >
          <div style={bodyText}>
            <p style={{ margin: 0 }}>
              Keel captures what matters from your conversations, organizes it into projects and wikis,
              and stays available through a fast chat interface powered by the AI model of your choice.
              Everything lives on your machine in plain markdown — your context travels with you,
              provider to provider, year to year.
            </p>

            <div style={sectionHeading}>Key features</div>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li style={featureItem}><strong style={{ color: 'var(--text-primary)' }}>Local-first workspace.</strong> A folder of markdown files you fully own and can edit anywhere.</li>
              <li style={featureItem}><strong style={{ color: 'var(--text-primary)' }}>Context-aware chat.</strong> Every reply draws on your projects, captures, tasks, and search hits.</li>
              <li style={featureItem}><strong style={{ color: 'var(--text-primary)' }}>Multiple AI providers.</strong> Claude, OpenAI, OpenRouter, or local Ollama — swap any time.</li>
              <li style={featureItem}><strong style={{ color: 'var(--text-primary)' }}>Voice input.</strong> Dictate into chat with local Whisper or OpenAI's API.</li>
              <li style={featureItem}><strong style={{ color: 'var(--text-primary)' }}>Per-project knowledge bases.</strong> Use <code>/create-kb</code> and <code>/refresh-kb</code> to turn any project into a queryable wiki.</li>
              <li style={featureItem}><strong style={{ color: 'var(--text-primary)' }}>Auto-capture.</strong> Decisions and facts from chat flow back into your workspace automatically.</li>
              <li style={featureItem}><strong style={{ color: 'var(--text-primary)' }}>Daily briefs &amp; EOD summaries.</strong> Morning brief, end-of-day wrap-up, pulled from your own data.</li>
              <li style={featureItem}><strong style={{ color: 'var(--text-primary)' }}>Tasks &amp; reminders.</strong> Markdown-backed tasks with a dedicated inbox view.</li>
              <li style={featureItem}><strong style={{ color: 'var(--text-primary)' }}>Google &amp; X integrations.</strong> Calendar, Docs, X bookmarks, and posting from chat.</li>
            </ul>

            <div style={sectionHeading}>How it works</div>
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              <li style={featureItem}>Point Keel at a folder for your workspace (defaults to <code>~/Keel</code>).</li>
              <li style={featureItem}>Chat — Keel streams responses while pulling context from your markdown files.</li>
              <li style={featureItem}>Substantial moments from chat capture back into your projects.</li>
              <li style={featureItem}>Build wikis from source material; Keel compiles and runs health checks.</li>
              <li style={featureItem}>Every note stays on your machine, in plain markdown, forever portable.</li>
            </ol>

            <div style={sectionHeading}>FAQ</div>
            <div style={{ ...featureItem }}>
              <strong style={{ color: 'var(--text-primary)' }}>Where is my data stored?</strong>
              <div>In the brain folder you chose during setup (default <code>~/Keel</code>). Plain markdown files plus a small SQLite db at <code>.config/keel.db</code>.</div>
            </div>
            <div style={featureItem}>
              <strong style={{ color: 'var(--text-primary)' }}>Can I switch AI providers?</strong>
              <div>Yes — Settings → Model. Your context stays the same regardless of which provider answers.</div>
            </div>
            <div style={featureItem}>
              <strong style={{ color: 'var(--text-primary)' }}>How do I move my workspace?</strong>
              <div>Settings → Personal Settings → Brain Path → Browse. Keel will reload pointing at the new folder.</div>
            </div>
            <div style={featureItem}>
              <strong style={{ color: 'var(--text-primary)' }}>Does Keel work offline?</strong>
              <div>Mostly — local Whisper and Ollama work offline. Cloud providers (Claude, OpenAI) and Google integrations need internet.</div>
            </div>
          </div>

          <button type="button" onClick={openReadme} style={{ ...linkButtonStyle, marginTop: 12 }}>
            <span>
              <strong style={{ color: 'var(--text-primary)' }}>Read the full README on GitHub</strong>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Architecture, contributing guide, and roadmap
              </div>
            </span>
            <span style={{ color: 'var(--text-tertiary)' }}>→</span>
          </button>
        </SectionCard>

        <SectionCard
          title="Share feedback or report a bug"
          description="Submit feature requests, vote on what others have asked for, or report bugs — all on our public Fider board."
        >
          <button type="button" onClick={openBoard} style={linkButtonStyle}>
            <span>
              <strong style={{ color: 'var(--text-primary)' }}>Open feedback board</strong>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {FEEDBACK_BOARD_URL.replace(/^https?:\/\//, '')} — opens in your browser
              </div>
            </span>
            <span style={{ color: 'var(--text-tertiary)' }}>→</span>
          </button>
        </SectionCard>

        <SectionCard
          title="About"
          description="Keel is in beta. Thanks for being early."
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
            <div><strong style={{ color: 'var(--text-primary)' }}>Version:</strong> {versionLabel}</div>
          </div>
        </SectionCard>
      </>
    );
  };

  const renderSection = () => {
    switch (selectedSection) {
      case 'general-personal':
        return (
          <SectionCard>
            <FieldRow label="Name">
              <input
                type="text"
                value={settings.userName}
                onChange={(e) => update({ userName: e.target.value })}
                placeholder="Your name"
                style={inputStyle}
              />
            </FieldRow>
            <FieldRow label="Theme">
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
                      {themeOption === 'system' ? 'Use system' : themeOption === 'dark' ? 'Dark mode' : 'Light mode'}
                    </button>
                  );
                })}
              </div>
            </FieldRow>
            <FieldRow label="Timezone">
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
            <FieldRow label="Brain Path">
              <div style={{ display: 'flex', gap: 10, flexDirection: isCompactLayout ? 'column' : 'row' }}>
                <input
                  type="text"
                  value={settings.brainPath}
                  style={{ ...inputStyle, flex: 1 }}
                  readOnly
                />
                <button
                  onClick={async () => {
                    const picked = await window.keel.pickFolder(settings.brainPath);
                    if (!picked || picked === settings.brainPath) return;
                    const confirmed = window.confirm(
                      `Switch your Keel brain to:\n\n${picked}\n\n` +
                      `Keel will reload and show only the data in this new folder. ` +
                      `Your existing data stays in ${settings.brainPath}.`
                    );
                    if (!confirmed) return;
                    // Persist directly so we can relaunch immediately, bypassing
                    // the debounced parent update.
                    await window.keel.saveSettings({ ...settings, brainPath: picked });
                    await window.keel.relaunch();
                  }}
                  style={secondaryButtonStyle(false)}
                >
                  Browse…
                </button>
              </div>
            </FieldRow>
          </SectionCard>
        );

      case 'general-personality':
        return (
          <SectionCard>
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

      case 'general-scheduled-jobs':
        return <ScheduledJobsSection />;

      case 'ai-setup':
        return (
          <SectionCard>
            <FieldRow label="Provider">
              <select
                value={settings.provider}
                onChange={(e) => {
                  const val = e.target.value as SettingsType['provider'];
                  update({ provider: val });
                  if (val === 'ollama') fetchOllamaModels();
                }}
                style={selectStyle}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </FieldRow>

            {settings.provider !== 'ollama' && (
              <FieldRow label="API Key">
                <div style={{ position: 'relative' }}>
                  <input
                    type={showApiKey['provider'] ? 'text' : 'password'}
                    value={
                      settings.provider === 'claude' ? settings.anthropicApiKey
                      : settings.provider === 'openai' ? settings.openaiApiKey
                      : settings.openrouterApiKey
                    }
                    onChange={(e) => {
                      const field = settings.provider === 'claude' ? 'anthropicApiKey'
                        : settings.provider === 'openai' ? 'openaiApiKey'
                        : 'openrouterApiKey';
                      update({ [field]: e.target.value } as Partial<SettingsType>);
                    }}
                    placeholder="sk-..."
                    style={{ ...inputStyle, paddingRight: 60 }}
                  />
                  <button
                    onClick={() => toggleKeyVisibility('provider')}
                    style={{
                      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', color: 'var(--text-tertiary)',
                      cursor: 'pointer', fontSize: 12, padding: '4px 6px',
                    }}
                  >
                    {showApiKey['provider'] ? 'Hide' : 'Show'}
                  </button>
                </div>
              </FieldRow>
            )}

            {settings.provider === 'claude' && (
              <FieldRow label="Model">
                <select
                  value={settings.claudeModel}
                  onChange={(e) => update({ claudeModel: e.target.value })}
                  style={selectStyle}
                >
                  {CLAUDE_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </FieldRow>
            )}

            {settings.provider === 'openai' && (
              <FieldRow label="Model">
                <select
                  value={settings.openaiModel}
                  onChange={(e) => update({ openaiModel: e.target.value })}
                  style={selectStyle}
                >
                  {openaiModelOptions.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </FieldRow>
            )}

            {settings.provider === 'openrouter' && (
              <>
                <FieldRow label="Model">
                  <input
                    type="text"
                    value={settings.openrouterModel}
                    onChange={(e) => update({ openrouterModel: e.target.value })}
                    placeholder="e.g. anthropic/claude-3.5-sonnet"
                    style={inputStyle}
                  />
                </FieldRow>
                <FieldRow label="Base URL">
                  <input
                    type="text"
                    value={settings.openrouterBaseUrl}
                    onChange={(e) => update({ openrouterBaseUrl: e.target.value })}
                    placeholder="https://openrouter.ai/api/v1"
                    style={inputStyle}
                  />
                </FieldRow>
              </>
            )}

            {settings.provider === 'ollama' && (
              <>
                <FieldRow label="Model">
                  {!ollamaManualEntry && !ollamaError && ollamaModels.length > 0 ? (
                    <select
                      value={ollamaModels.some((m) => m.name === settings.ollamaModel) ? settings.ollamaModel : ''}
                      onChange={(e) => {
                        if (e.target.value === '__manual__') { setOllamaManualEntry(true); return; }
                        update({ ollamaModel: e.target.value });
                      }}
                      style={selectStyle}
                    >
                      <option value="">Select a model...</option>
                      {ollamaModels.map((m) => (
                        <option key={m.name} value={m.name}>
                          {m.name}{m.parameterSize ? ` (${m.parameterSize})` : ''}
                        </option>
                      ))}
                      <option value="__manual__">Type a custom model...</option>
                    </select>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        value={settings.ollamaModel}
                        onChange={(e) => update({ ollamaModel: e.target.value })}
                        placeholder="e.g. llama3.2, mistral"
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      {ollamaModels.length > 0 && (
                        <button onClick={() => setOllamaManualEntry(false)} style={secondaryButtonStyle(false)}>
                          List
                        </button>
                      )}
                    </div>
                  )}
                </FieldRow>
                <FieldRow label="Status">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <StatusBadge
                      label={ollamaError ? 'Not running' : ollamaModels.length > 0 ? 'Available' : 'No models'}
                      tone={ollamaError ? 'warning' : ollamaModels.length > 0 ? 'success' : 'neutral'}
                    />
                    <button onClick={fetchOllamaModels} disabled={ollamaLoading} style={secondaryButtonStyle(ollamaLoading)}>
                      {ollamaLoading ? 'Checking...' : 'Refresh'}
                    </button>
                  </div>
                </FieldRow>
              </>
            )}
          </SectionCard>
        );

      case 'integrations':
        return (
          <>
            <SectionCard title="X" description="Sync bookmarks into your wiki base and publish posts from Keel.">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <StatusBadge
                    label={xStatus?.connected ? 'Connected' : xStatus?.configured ? 'Ready' : 'Unavailable'}
                    tone={xStatus?.connected ? 'success' : xStatus?.configured ? 'warning' : 'neutral'}
                  />
                  <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                    {xStatus?.connected
                      ? `@${xStatus.account?.username || 'X'}`
                      : 'Connect your X account to get started.'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {!xStatus?.connected ? (
                    <button
                      onClick={async () => {
                        setXBusy(true);
                        setXMessage('');
                        try {
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
                      disabled={xBusy || !xStatus?.configured}
                      style={primaryButtonStyle(xBusy || !xStatus?.configured)}
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
                              ? `No new bookmarks. Skipped ${result.skippedCount} already-ingested posts.`
                              : `Synced ${result.syncedCount} new bookmarks into ${result.targetBaseTitle}.`;
                            setXMessage(result.stoppedEarly ? `${syncSummary} Stopped early after reaching known bookmarks.` : syncSummary);
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
              </div>
              {xMessage && (
                <InlineMessage tone={xMessage.toLowerCase().includes('fail') || xMessage.toLowerCase().includes('error') ? 'danger' : 'success'}>
                  {xMessage}
                </InlineMessage>
              )}
              {xStatus?.lastPublishError && (
                <InlineMessage tone="danger">Last publish error: {xStatus.lastPublishError}</InlineMessage>
              )}
            </SectionCard>

            <SectionCard title="Google" description="Sync Calendar events and export content to Google Docs.">
              {!googleConfigured ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Google integration is not configured in this build yet.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <StatusBadge label={googleConnected ? 'Connected' : 'Disconnected'} tone={googleConnected ? 'success' : 'warning'} />
                      <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                        {googleConnected ? 'Your Google account is connected.' : 'Connect to sync Calendar events and export to Docs.'}
                      </span>
                    </div>
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
                  </div>
                  {googleMessage && (
                    <InlineMessage
                      tone={googleMessage.toLowerCase().includes('fail') || googleMessage.toLowerCase().includes('error') ? 'danger' : 'success'}
                    >
                      {googleMessage}
                    </InlineMessage>
                  )}
                </>
              )}
            </SectionCard>
          </>
        );

      case 'help-feedback':
        return renderHelpFeedback();

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
          <BetaBadge size="sm" />
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {NAV_ITEMS.map((item) => (
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
                {item.id === 'integrations' && (googleConnected || xStatus?.connected) && (
                  <StatusBadge label="On" tone="success" />
                )}
              </button>
            ))}
          </div>
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
  title?: string;
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
      {(title || description) && (
        <div style={{ marginBottom: 18 }}>
          {title && <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>}
          {description && (
            <div style={{ marginTop: title ? 6 : 0, fontSize: 14, lineHeight: 1.5, color: 'var(--text-muted)' }}>
              {description}
            </div>
          )}
        </div>
      )}
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

const DOW_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function scheduleDescription(job: ScheduledJob): string {
  const time = job.time || '??:??';
  if (job.scheduleType === 'daily') return `Every day at ${time}`;
  if (job.scheduleType === 'weekdays') return `Weekdays at ${time}`;
  if (job.scheduleType === 'weekly') {
    const day = job.dayOfWeek != null ? DOW_LABELS[job.dayOfWeek] : 'day';
    return `Every ${day} at ${time}`;
  }
  return time;
}

const BLANK_JOB: Omit<ScheduledJob, 'id' | 'createdAt' | 'lastRunDate'> = {
  name: '',
  prompt: '',
  scheduleType: 'daily',
  time: '09:00',
  dayOfWeek: 1,
  enabled: true,
};

function ScheduledJobsSection() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ScheduledJob | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 13px',
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

  const loadJobs = useCallback(async () => {
    try {
      const list = await window.keel.listScheduledJobs();
      setJobs(list);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const handleAddNew = () => {
    setEditing({ ...BLANK_JOB });
    setIsNew(true);
    setError('');
  };

  const handleEdit = (job: ScheduledJob) => {
    setEditing({ ...job });
    setIsNew(false);
    setError('');
  };

  const handleCancel = () => {
    setEditing(null);
    setError('');
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { setError('Job name is required.'); return; }
    if (!editing.prompt.trim()) { setError('Prompt is required.'); return; }
    if (!editing.time) { setError('Time is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await window.keel.upsertScheduledJob(editing);
      await loadJobs();
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save job.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await window.keel.deleteScheduledJob(id);
      await loadJobs();
    } catch {}
  };

  const handleToggle = async (job: ScheduledJob) => {
    try {
      await window.keel.upsertScheduledJob({ ...job, enabled: !job.enabled });
      await loadJobs();
    } catch {}
  };

  if (loading) {
    return <PlaceholderPanel title="Loading scheduled jobs" description="Fetching your configured jobs…" />;
  }

  if (editing) {
    return (
      <SectionCard>
        <FieldRow label="Name">
          <input
            type="text"
            value={editing.name}
            onChange={(e) => setEditing((prev) => prev ? { ...prev, name: e.target.value } : prev)}
            placeholder="e.g. Thursday Group Post"
            style={inputStyle}
            autoFocus
          />
        </FieldRow>

        <FieldRow label="Prompt">
          <textarea
            value={editing.prompt}
            onChange={(e) => setEditing((prev) => prev ? { ...prev, prompt: e.target.value } : prev)}
            placeholder="e.g. Write a short summary of what was top of mind for me this week, suitable for sharing with my team."
            style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }}
          />
        </FieldRow>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <FieldRow label="Frequency">
            <select
              value={editing.scheduleType}
              onChange={(e) => setEditing((prev) => prev
                ? { ...prev, scheduleType: e.target.value as ScheduledJob['scheduleType'] }
                : prev
              )}
              style={selectStyle}
            >
              <option value="daily">Every day</option>
              <option value="weekdays">Weekdays only</option>
              <option value="weekly">Weekly (specific day)</option>
            </select>
          </FieldRow>

          <FieldRow label="Time">
            <input
              type="time"
              value={editing.time}
              onChange={(e) => setEditing((prev) => prev ? { ...prev, time: e.target.value } : prev)}
              style={inputStyle}
            />
          </FieldRow>
        </div>

        {editing.scheduleType === 'weekly' && (
          <FieldRow label="Day of Week">
            <select
              value={editing.dayOfWeek ?? 1}
              onChange={(e) => setEditing((prev) => prev ? { ...prev, dayOfWeek: Number(e.target.value) } : prev)}
              style={selectStyle}
            >
              {DOW_LABELS.map((label, idx) => (
                <option key={idx} value={idx}>{label}</option>
              ))}
            </select>
          </FieldRow>
        )}

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(248,113,113,0.1)', color: '#fca5a5', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={handleCancel} style={secondaryButtonStyle(saving)}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={primaryButtonStyle(saving)}>
            {saving ? 'Saving…' : 'Save Job'}
          </button>
        </div>
      </SectionCard>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={handleAddNew} style={primaryButtonStyle(false)}>+ Add Job</button>
      </div>

      {jobs.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>No jobs yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {jobs.map((job) => (
            <div
              key={job.id}
              style={{
                padding: '14px 16px',
                borderRadius: 14,
                background: 'var(--surface-panel)',
                border: '1px solid var(--panel-border)',
                opacity: job.enabled ? 1 : 0.5,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{job.name}</div>
                <div style={{ marginTop: 2, fontSize: 12, color: 'var(--text-muted)' }}>
                  {scheduleDescription(job)} · {job.prompt.length > 60 ? job.prompt.slice(0, 60) + '…' : job.prompt}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                <button
                  onClick={() => handleToggle(job)}
                  title={job.enabled ? 'Disable' : 'Enable'}
                  style={{
                    width: 36, height: 20, borderRadius: 10, border: 'none',
                    background: job.enabled ? 'var(--accent)' : 'var(--surface-muted)',
                    cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                    padding: 0, flexShrink: 0,
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 2,
                    left: job.enabled ? 18 : 2,
                    width: 16, height: 16, borderRadius: '50%',
                    background: '#fff', transition: 'left 0.2s',
                  }} />
                </button>
                <button
                  onClick={() => handleEdit(job)}
                  style={{
                    padding: '5px 10px', borderRadius: 8,
                    border: '1px solid var(--panel-border)', background: 'var(--surface-muted)',
                    color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
                  }}
                >Edit</button>
                <button
                  onClick={() => job.id != null && handleDelete(job.id)}
                  style={{
                    padding: '5px 10px', borderRadius: 8,
                    border: '1px solid rgba(248,113,113,0.2)', background: 'rgba(248,113,113,0.07)',
                    color: '#fca5a5', fontSize: 12, cursor: 'pointer',
                  }}
                >Delete</button>
              </div>
            </div>
          ))}
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
