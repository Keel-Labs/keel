import React, { useState } from 'react';
import type { Settings } from '../../shared/types';
import { KeelIcon, KeelWordmark } from './KeelIcon';

const PROVIDERS = [
  { value: 'claude' as const, label: 'Claude', description: 'Anthropic — best reasoning & writing', keyField: 'anthropicApiKey' as const },
  { value: 'openai' as const, label: 'OpenAI', description: 'GPT models — strong all-rounder', keyField: 'openaiApiKey' as const },
  { value: 'openrouter' as const, label: 'OpenRouter', description: 'Any model via OpenRouter', keyField: 'openrouterApiKey' as const },
  { value: 'ollama' as const, label: 'Ollama', description: 'Local models — free, private, offline. Requires Ollama installed on your machine.', keyField: null },
];

interface Props {
  initialSettings: Settings;
  onComplete: (settings: Settings) => void;
}

type Step = 'welcome' | 'brain-path' | 'provider' | 'api-key' | 'profile' | 'done';

const STEPS: Step[] = ['welcome', 'brain-path', 'provider', 'api-key', 'profile', 'done'];

export default function Onboarding({ initialSettings, onComplete }: Props) {
  const [step, setStep] = useState<Step>('welcome');
  const [settings, setSettings] = useState<Settings>({ ...initialSettings });
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [showKey, setShowKey] = useState(false);

  const stepIndex = STEPS.indexOf(step);
  const progress = ((stepIndex) / (STEPS.length - 1)) * 100;

  const next = () => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  };

  const back = () => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  };

  const finish = async () => {
    try {
      // Save user name to settings if provided
      const updatedSettings = { ...settings };
      if (name) {
        updatedSettings.userName = name;
      }
      await window.keel.saveSettings(updatedSettings);
      await window.keel.ensureBrain();

      // Write initial profile if user provided info
      if (name || role) {
        const profileLines = ['# About Me', ''];
        if (name) profileLines.push(`- **Name:** ${name}`);
        if (role) profileLines.push(`- **Role:** ${role}`);
        profileLines.push('', '## Projects', '', '## Priorities', '');
        try {
          await window.keel.writeFile('keel.md', profileLines.join('\n'));
        } catch {
          // Brain path might not be ready — that's ok
        }
      }
    } catch {
      // Settings save failed — still proceed
    }
    onComplete(settings);
  };

  const selectedProvider = PROVIDERS.find((p) => p.value === settings.provider);
  const needsApiKey = selectedProvider?.keyField != null;

  const getApiKey = (): string => {
    if (!selectedProvider?.keyField) return '';
    return (settings as any)[selectedProvider.keyField] || '';
  };

  const setApiKey = (value: string) => {
    if (!selectedProvider?.keyField) return;
    setSettings({ ...settings, [selectedProvider.keyField]: value });
  };

  const containerStyle: React.CSSProperties = {
    height: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-base)', padding: 'var(--space-6xl)',
  };

  const cardStyle: React.CSSProperties = {
    maxWidth: 440, width: '100%', textAlign: 'center',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 'var(--radius-lg)',
    background: 'var(--bg-surface)', border: '1px solid var(--border-input)',
    color: 'var(--text-primary)', fontSize: 'var(--text-base)', outline: 'none',
    fontFamily: 'inherit', transition: 'var(--transition-base)',
  };

  const primaryBtn: React.CSSProperties = {
    padding: '12px 32px', borderRadius: 'var(--radius-lg)', border: 'none',
    background: 'var(--accent)', color: 'white', fontSize: 'var(--text-base)',
    fontWeight: 600, cursor: 'pointer', transition: 'var(--transition-base)',
    fontFamily: 'inherit',
  };

  const secondaryBtn: React.CSSProperties = {
    padding: '12px 24px', borderRadius: 'var(--radius-lg)', border: 'none',
    background: 'transparent', color: 'var(--text-muted)',
    fontSize: 'var(--text-base)', cursor: 'pointer', fontFamily: 'inherit',
  };

  const headingStyle: React.CSSProperties = {
    fontSize: 'var(--text-2xl)', fontWeight: 600, color: 'var(--text-primary)',
    marginBottom: 8,
  };

  const subtextStyle: React.CSSProperties = {
    fontSize: 'var(--text-base)', color: 'var(--text-subtle)', lineHeight: 1.6,
    marginBottom: 'var(--space-5xl)',
  };

  return (
    <div style={containerStyle}>
      {/* Progress bar */}
      {step !== 'welcome' && step !== 'done' && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'rgba(255,255,255,0.05)',
        }}>
          <div style={{
            height: '100%', width: `${progress}%`,
            background: 'var(--accent)', transition: 'width 0.3s ease',
          }} />
        </div>
      )}

      <div style={cardStyle}>
        {/* Welcome */}
        {step === 'welcome' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <KeelIcon size={64} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <KeelWordmark height={28} />
            </div>
            <p style={{ ...subtextStyle, marginTop: 12 }}>
              Your AI chief of staff. Keel learns your projects, priorities, and people — then helps you stay on top of everything.
            </p>
            <button onClick={next} style={primaryBtn}>Get Started</button>
          </>
        )}

        {/* Brain Path */}
        {step === 'brain-path' && (
          <>
            <h2 style={headingStyle}>Where should Keel store your data?</h2>
            <p style={subtextStyle}>
              Keel keeps your notes, projects, and context as plain markdown files in a local folder.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                type="text"
                value={settings.brainPath}
                onChange={(e) => setSettings({ ...settings, brainPath: e.target.value })}
                style={{ ...inputStyle, flex: 1 }}
                readOnly
              />
              <button
                onClick={async () => {
                  const picked = await window.keel.pickFolder(settings.brainPath);
                  if (picked) setSettings({ ...settings, brainPath: picked });
                }}
                style={{
                  padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)',
                  background: '#303030', color: 'rgba(255,255,255,0.7)', fontSize: 13,
                  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                Browse...
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 24 }}>
              Default is fine for most people. You can change this later in Settings.
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
              <button onClick={back} style={secondaryBtn}>Back</button>
              <button onClick={next} style={primaryBtn}>Next</button>
            </div>
          </>
        )}

        {/* Provider Selection */}
        {step === 'provider' && (
          <>
            <h2 style={headingStyle}>Choose your AI engine</h2>
            <p style={subtextStyle}>
              Keel works with multiple AI providers. Pick one to start — you can switch anytime.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24, textAlign: 'left' }}>
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
                    onChange={() => setSettings({ ...settings, provider: p.value })}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  <div>
                    <div style={{ fontSize: 'var(--text-base)', fontWeight: 500, color: 'var(--text-primary)' }}>{p.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 2 }}>
                      {p.description}
                      {p.value === 'ollama' && (
                        <>
                          {' '}
                          <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer"
                            style={{ color: 'var(--accent)' }}>
                            Download Ollama
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
              <button onClick={back} style={secondaryBtn}>Back</button>
              <button
                onClick={() => {
                  if (needsApiKey) next();
                  else setStep('profile'); // Skip API key step for Ollama
                }}
                style={primaryBtn}
              >
                Next
              </button>
            </div>
          </>
        )}

        {/* API Key */}
        {step === 'api-key' && (
          <>
            <h2 style={headingStyle}>Enter your API key</h2>
            <p style={subtextStyle}>
              {settings.provider === 'claude' && 'Get your key from console.anthropic.com'}
              {settings.provider === 'openai' && 'Get your key from platform.openai.com'}
              {settings.provider === 'openrouter' && 'Get your key from openrouter.ai'}
            </p>
            <div style={{ position: 'relative', marginBottom: 24 }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={getApiKey()}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                style={{ ...inputStyle, paddingRight: 52 }}
              />
              <button
                onClick={() => setShowKey(!showKey)}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
                  cursor: 'pointer', fontSize: 12, padding: '4px 6px',
                }}
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
              <button onClick={back} style={secondaryBtn}>Back</button>
              <button onClick={next} style={{
                ...primaryBtn,
                opacity: getApiKey().length < 5 ? 0.5 : 1,
              }}>
                Next
              </button>
            </div>
            <button
              onClick={next}
              style={{ ...secondaryBtn, marginTop: 8, fontSize: 12 }}
            >
              Skip for now
            </button>
          </>
        )}

        {/* Profile */}
        {step === 'profile' && (
          <>
            <h2 style={headingStyle}>Tell Keel about yourself</h2>
            <p style={subtextStyle}>
              This helps Keel personalize your experience. You can always update this later.
            </p>
            <div style={{ textAlign: 'left', marginBottom: 24 }}>
              <label style={{
                fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
                marginBottom: 6, display: 'block', textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}>Your Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex"
                style={{ ...inputStyle, marginBottom: 16 }}
              />
              <label style={{
                fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
                marginBottom: 6, display: 'block', textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}>Your Role</label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Product Manager, Founder, Engineer"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
              <button onClick={() => {
                if (needsApiKey) back();
                else setStep('provider');
              }} style={secondaryBtn}>Back</button>
              <button onClick={next} style={primaryBtn}>Next</button>
            </div>
            <button
              onClick={next}
              style={{ ...secondaryBtn, marginTop: 8, fontSize: 12 }}
            >
              Skip
            </button>
          </>
        )}

        {/* Done */}
        {step === 'done' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
              <KeelIcon size={56} />
            </div>
            <h2 style={headingStyle}>You're all set!</h2>
            <p style={subtextStyle}>
              Start by telling Keel about your projects and priorities. The more context you share, the more helpful Keel becomes.
            </p>
            <div style={{
              textAlign: 'left', background: 'var(--bg-surface)', borderRadius: 'var(--radius-xl)',
              padding: '16px 18px', marginBottom: 24,
              border: '1px solid var(--border-default)',
            }}>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                <strong style={{ color: 'rgba(255,255,255,0.85)' }}>Quick tips:</strong>
                <br />
                - Tell me about your projects and I'll remember them
                <br />
                - Use <code style={{
                  background: 'rgba(255,255,255,0.1)', padding: '1px 5px',
                  borderRadius: 4, fontSize: 12,
                }}>/daily-brief</code> for a morning overview
                <br />
                - Use <code style={{
                  background: 'rgba(255,255,255,0.1)', padding: '1px 5px',
                  borderRadius: 4, fontSize: 12,
                }}>/capture [text or URL]</code> to save anything
                <br />
                - Use <code style={{
                  background: 'rgba(255,255,255,0.1)', padding: '1px 5px',
                  borderRadius: 4, fontSize: 12,
                }}>/eod</code> for an end-of-day summary
              </div>
            </div>
            <button onClick={finish} style={primaryBtn}>Start Using Keel</button>
          </>
        )}
      </div>
    </div>
  );
}
