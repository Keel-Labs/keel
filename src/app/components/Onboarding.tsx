import React, { useEffect, useState } from 'react';
import type { ScanFolderResult, Settings } from '../../shared/types';
import keelLogoUrl from '../assets/keel-logo-transparent.png';
import { BetaBadge } from './BetaBadge';
import { isGoogleCompatible } from '../../core/googlePolicy';

const PROVIDERS = [
  { value: 'ollama' as const, label: 'Local Mistral (via Ollama)', description: 'Mistral 7B — free, private, offline. Install the Ollama app once; the model (~4 GB) downloads automatically after that.', tag: 'Free · No key · Default', keyField: null, signupUrl: 'https://ollama.com/download', isPro: false },
  { value: 'claude' as const, label: 'Claude', description: 'Anthropic — best reasoning & writing', tag: 'Keel Pro', keyField: 'anthropicApiKey' as const, signupUrl: 'https://console.anthropic.com/', isPro: true },
  { value: 'openai' as const, label: 'OpenAI', description: 'GPT models — strong all-rounder', tag: 'Keel Pro', keyField: 'openaiApiKey' as const, signupUrl: 'https://platform.openai.com/api-keys', isPro: true },
  { value: 'openrouter' as const, label: 'OpenRouter', description: 'One key, hundreds of models', tag: 'Keel Pro', keyField: 'openrouterApiKey' as const, signupUrl: 'https://openrouter.ai/keys', isPro: true },
];

interface Props {
  initialSettings: Settings;
  onComplete: (settings: Settings) => void;
}

type Step = 'welcome' | 'about' | 'brain-path' | 'provider' | 'ollama-setup' | 'pro-gate' | 'api-key' | 'profile' | 'your-work' | 'done';

// 'about' is a side-step reachable only from 'welcome' via Learn more — not part of the linear flow.
const STEPS: Step[] = ['welcome', 'brain-path', 'provider', 'ollama-setup', 'pro-gate', 'api-key', 'profile', 'your-work', 'done'];

interface ProjectDraft {
  name: string;
  description: string;
  docRefs: string; // textarea content; one ref per line
}

export default function Onboarding({ initialSettings, onComplete }: Props) {
  const [step, setStep] = useState<Step>('welcome');
  // Onboarding always starts with Ollama/Mistral as the free default.
  // Users who want a Pro provider select it on the provider step.
  const [settings, setSettings] = useState<Settings>({
    ...initialSettings,
    provider: 'ollama',
    ollamaModel: 'mistral',
  });
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testKeyStatus, setTestKeyStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [testKeyError, setTestKeyError] = useState<string>('');

  // Pro gate step state
  const [proLicenseInput, setProLicenseInput] = useState('');
  const [proActivating, setProActivating] = useState(false);
  const [proActivateError, setProActivateError] = useState('');

  // Ollama setup step state
  const [ollamaRunning, setOllamaRunning] = useState(false);
  const [ollamaSetupPulling, setOllamaSetupPulling] = useState(false);
  const [ollamaSetupProgress, setOllamaSetupProgress] = useState<number | undefined>(undefined);
  const [ollamaSetupStatus, setOllamaSetupStatus] = useState<string>('');

  // brain-path step state
  const defaultBrainPath = initialSettings.brainPath; // settings.ts already populates this with ~/Keel
  const [pathMode, setPathMode] = useState<'default' | 'existing' | null>(null);
  const [scan, setScan] = useState<ScanFolderResult | null>(null);
  const [scanning, setScanning] = useState(false);

  const pickExistingFolder = async () => {
    const picked = await window.keel.pickFolder(settings.brainPath);
    if (!picked) return;
    setSettings({ ...settings, brainPath: picked });
    setPathMode('existing');
    setScanning(true);
    try {
      const result = await window.keel.scanFolder(picked);
      setScan(result);
    } catch {
      setScan(null);
    } finally {
      setScanning(false);
    }
  };

  const chooseDefault = () => {
    setSettings({ ...settings, brainPath: defaultBrainPath });
    setPathMode('default');
    setScan(null);
  };

  const canContinueBrainPath =
    pathMode === 'default' ||
    (pathMode === 'existing' && !scanning && scan !== null);

  // your-work step state
  const [projects, setProjects] = useState<ProjectDraft[]>([
    { name: '', description: '', docRefs: '' },
  ]);
  const [people, setPeople] = useState('');
  const [contextNote, setContextNote] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [ingestSummary, setIngestSummary] = useState<{
    projectsCreated: number;
    docsFetched: number;
    docsFailed: Array<{ ref: string; error: string }>;
  } | null>(null);

  // Google connection state — used to prompt the user to connect when they paste a Doc URL
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [connectingGoogle, setConnectingGoogle] = useState(false);

  // Refresh Google status whenever we land on the your-work step
  useEffect(() => {
    if (step !== 'your-work') return;
    let cancelled = false;
    window.keel.googleStatus().then((status) => {
      if (!cancelled) setGoogleConnected(!!status?.connected);
    }).catch(() => {
      if (!cancelled) setGoogleConnected(false);
    });
    return () => { cancelled = true; };
  }, [step]);

  const hasGoogleDocRef = projects.some((p) =>
    /docs\.google\.com\/document\/d\//.test(p.docRefs),
  );

  const connectGoogle = async () => {
    setConnectingGoogle(true);
    try {
      await window.keel.googleConnect();
      // googleConnect resolves on success, throws on failure — re-fetch status to confirm
      const status = await window.keel.googleStatus();
      setGoogleConnected(!!status?.connected);
    } catch {
      // OAuth failed or was cancelled — leave state as-is, user will see button again
    } finally {
      setConnectingGoogle(false);
    }
  };

  const updateProject = (idx: number, patch: Partial<ProjectDraft>) => {
    setProjects((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };
  const addProject = () => {
    if (projects.length < 4) setProjects([...projects, { name: '', description: '', docRefs: '' }]);
  };
  const removeProject = (idx: number) => {
    setProjects((prev) => prev.filter((_, i) => i !== idx));
  };

  const browseProjectDocs = async (idx: number) => {
    try {
      const paths = await window.keel.pickFiles();
      if (!paths || paths.length === 0) return;
      const current = projects[idx].docRefs.trim();
      const joined = paths.join('\n');
      updateProject(idx, {
        docRefs: current ? `${current}\n${joined}` : joined,
      });
    } catch {
      // Picker cancelled or failed — silent
    }
  };

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

  const runIngest = async () => {
    setIngesting(true);
    try {
      // Save settings + ensure brain dirs first so paths resolve correctly
      await window.keel.saveSettings(settings);
      await window.keel.ensureBrain();

      const projectInputs = projects
        .filter((p) => p.name.trim())
        .map((p) => ({
          name: p.name.trim(),
          description: p.description.trim(),
          docRefs: p.docRefs
            .split('\n')
            .map((r) => r.trim())
            .filter(Boolean),
        }));

      const summary = await window.keel.onboardingIngest({
        name,
        role,
        projects: projectInputs,
        people,
        context: contextNote,
      });
      setIngestSummary(summary);
    } catch {
      setIngestSummary({ projectsCreated: 0, docsFetched: 0, docsFailed: [] });
    } finally {
      setIngesting(false);
    }
  };

  const finish = async () => {
    const completedSettings = { ...settings, hasCompletedOnboarding: true };
    // Save user name to settings if provided
    if (name) {
      completedSettings.userName = name;
    }
    try {
      await window.keel.saveSettings(completedSettings);
      await window.keel.ensureBrain();
      // keel.md and project context files were already written by the ingest step.
      // If the user skipped ingest entirely, write a minimal profile so Keel has *something*.
      if (!ingestSummary && (name || role)) {
        const profileLines = ['# About Me', ''];
        if (name) profileLines.push(`- **Name:** ${name}`);
        if (role) profileLines.push(`- **Role:** ${role}`);
        profileLines.push('', '## Active Projects', '', '## Priorities', '');
        try {
          await window.keel.writeFile('keel.md', profileLines.join('\n'));
        } catch {
          // Brain path might not be ready — that's ok
        }
      }
    } catch {
      // Settings save failed — still proceed
    }
    onComplete(completedSettings);
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
    // Any edit invalidates a prior test result.
    setTestKeyStatus('idle');
    setTestKeyError('');
  };

  const testApiKey = async () => {
    const provider = settings.provider as 'claude' | 'openai' | 'openrouter' | 'ollama';
    const key = getApiKey();
    setTestKeyStatus('testing');
    setTestKeyError('');
    try {
      const result = await window.keel.testLlmKey(provider, key);
      if (result.ok) {
        setTestKeyStatus('ok');
        // Persist the working key so the test acts as both check and save.
        await window.keel.saveSettings(settings);
      } else {
        setTestKeyStatus('error');
        setTestKeyError(result.error || 'Key check failed.');
      }
    } catch (err) {
      setTestKeyStatus('error');
      setTestKeyError(err instanceof Error ? err.message : 'Key check failed.');
    }
  };

  const skipApiKeyWithWarning = () => {
    const ok = window.confirm(
      "Without an API key, Keel can't talk to a model and chat won't work. You can add one later in Settings. Skip anyway?",
    );
    if (ok) next();
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
          <div style={{ maxWidth: 480, width: '100%', margin: '0 auto', textAlign: 'center' }}>
            {/* Logo — transparent PNG, sits directly on dark canvas */}
            <img
              src={keelLogoUrl}
              alt="Keel"
              style={{
                display: 'block',
                width: 280,
                height: 'auto',
                margin: '0 auto 8px',
              }}
            />
            <div style={{ marginBottom: 20 }}>
              <BetaBadge size="sm" />
            </div>

            {/* Hero line — confident, brand voice */}
            <h1 style={{
              fontSize: 24,
              fontWeight: 600,
              color: 'var(--text-primary)',
              lineHeight: 1.3,
              margin: '0 0 8px',
              letterSpacing: '-0.01em',
            }}>
              Your local-first AI chief of staff.
            </h1>
            {/* Supporting line — concrete verbs, single coherent sentence */}
            <p style={{
              fontSize: 14,
              color: 'var(--text-subtle)',
              lineHeight: 1.6,
              margin: '0 auto 32px',
              maxWidth: 400,
            }}>
              A local-first cortex that remembers your projects, your people, and what matters this week — kept as plain markdown you own.
            </p>

            {/* Step preview — single-line text with coral dot separators */}
            <div style={{
              fontSize: 13,
              color: 'var(--text-tertiary)',
              marginBottom: 28,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}>
              <span>Pick a folder</span>
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>·</span>
              <span>Pick an AI model</span>
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>·</span>
              <span>Add your projects</span>
            </div>

            {/* CTA — wider, heavier */}
            <button
              onClick={next}
              style={{
                ...primaryBtn,
                width: 280,
                padding: '14px 32px',
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              Get Started
            </button>

            <div style={{ marginTop: 16 }}>
              <button
                onClick={() => setStep('about')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-tertiary)',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                  textDecorationColor: 'rgba(255,255,255,0.2)',
                }}
              >
                Learn more about Keel
              </button>
            </div>
          </div>
        )}

        {/* About — side page, reached via "Learn more" from welcome */}
        {step === 'about' && (
          <div style={{
            maxWidth: 640, width: '100%', margin: '0 auto', textAlign: 'left',
            maxHeight: '85vh', overflowY: 'auto', padding: '0 4px',
          }}>
            <button
              onClick={() => setStep('welcome')}
              style={{
                background: 'transparent', border: 'none', color: 'var(--text-muted)',
                fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                padding: '6px 0', marginBottom: 20, display: 'inline-flex',
                alignItems: 'center', gap: 6,
              }}
            >
              ← Back
            </button>

            <h1 style={{
              fontSize: 28, fontWeight: 600, color: 'var(--text-primary)',
              margin: '0 0 6px', letterSpacing: '-0.01em',
            }}>
              Keel
            </h1>
            <p style={{
              fontSize: 16, color: 'var(--accent)', margin: '0 0 28px',
              fontStyle: 'italic',
            }}>
              Your personal AI chief of staff.
            </p>

            <section style={{ marginBottom: 28 }}>
              <h2 style={{
                fontSize: 17, fontWeight: 600, color: 'var(--text-primary)',
                margin: '0 0 8px',
              }}>
                Your context is yours. The model is just a tenant.
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-subtle)', lineHeight: 1.7, margin: 0 }}>
                Keel keeps everything you tell it as plain markdown files in a folder you own.
                Your projects, people, decisions, and notes live on your disk — readable in any
                editor, syncable through any tool you already use, portable across any AI model.
                Switch from Claude to GPT to a local Ollama model anytime. The intelligence is
                rented; the memory is yours.
              </p>
            </section>

            <section style={{ marginBottom: 28 }}>
              <h2 style={{
                fontSize: 17, fontWeight: 600, color: 'var(--text-primary)',
                margin: '0 0 8px',
              }}>
                Why Keel
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-subtle)', lineHeight: 1.7, margin: 0 }}>
                Most AI tools forget you the moment the chat ends. Most note apps don't think.
                Keel is a workspace where the two finally meet — a local-first cortex that
                remembers what you said yesterday, knows what you're working on this quarter,
                and surfaces what matters when it matters.
              </p>
            </section>

            <section style={{ marginBottom: 28 }}>
              <h2 style={{
                fontSize: 17, fontWeight: 600, color: 'var(--text-primary)',
                margin: '0 0 12px',
              }}>
                Core features
              </h2>
              <ul style={{
                fontSize: 14, color: 'var(--text-subtle)', lineHeight: 1.7,
                margin: 0, paddingLeft: 20,
              }}>
                <li><strong style={{ color: 'var(--text-primary)' }}>Local-first cortex.</strong> Every project, person, and note lives as markdown on your disk — not in someone else's database.</li>
                <li><strong style={{ color: 'var(--text-primary)' }}>Context-aware chat.</strong> Keel pulls in the right files automatically so you don't have to paste the same context every conversation.</li>
                <li><strong style={{ color: 'var(--text-primary)' }}>Multiple AI providers.</strong> Claude, OpenAI, OpenRouter, or local models via Ollama. Switch any time without losing your context.</li>
                <li><strong style={{ color: 'var(--text-primary)' }}>Hybrid retrieval.</strong> Combines semantic search with keyword and structural cues so Keel finds the right note even when you don't remember the title.</li>
                <li><strong style={{ color: 'var(--text-primary)' }}>Auto-capture &amp; memory extraction.</strong> Keel notices new facts in your conversations and writes them into the right project file — so the brain grows as you talk.</li>
                <li><strong style={{ color: 'var(--text-primary)' }}>Wiki workspaces.</strong> Spin up a focused research base, ingest sources, and let Keel compile a structured wiki you can keep editing.</li>
                <li><strong style={{ color: 'var(--text-primary)' }}>Daily briefs &amp; EOD summaries.</strong> Start the day with what matters; end it with a clean record of what got done.</li>
                <li><strong style={{ color: 'var(--text-primary)' }}>Tasks, reminders, and Google integrations.</strong> Calendar, Docs, and reminders meet your notes in one place.</li>
              </ul>
            </section>

            <section style={{ marginBottom: 28 }}>
              <h2 style={{
                fontSize: 17, fontWeight: 600, color: 'var(--text-primary)',
                margin: '0 0 12px',
              }}>
                How it works
              </h2>
              <ol style={{
                fontSize: 14, color: 'var(--text-subtle)', lineHeight: 1.7,
                margin: 0, paddingLeft: 20,
              }}>
                <li>Pick a folder. Keel scaffolds Projects, Areas, Resources, and Archive — or uses what's already there.</li>
                <li>Tell Keel about your active projects, key people, and how you work. It writes that context to disk.</li>
                <li>Chat. Keel pulls the relevant files into every conversation so it answers like it actually knows you.</li>
                <li>Capture as you go. Anything you say, paste, or drop in becomes searchable, structured memory.</li>
                <li>Switch models, sync the folder across devices, or open the same notes in Obsidian — your work travels with you.</li>
              </ol>
            </section>

            <section style={{
              padding: '14px 16px', background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-default)',
              marginBottom: 24,
            }}>
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.6, margin: 0 }}>
                Keel ships as a desktop app. The desktop app runs without any cloud account. Your API key, your folder, your data. (If you want an iPhone companion for capturing on the go, that's a separate opt-in we'll mention later.)
              </p>
            </section>

            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <button
                onClick={() => setStep('welcome')}
                style={{
                  ...primaryBtn,
                  width: 280,
                  padding: '14px 32px',
                  fontSize: 16,
                  fontWeight: 600,
                }}
              >
                Back to setup
              </button>
            </div>
          </div>
        )}

        {/* Brain Path */}
        {step === 'brain-path' && (
          <>
            <h2 style={headingStyle}>Where should Keel live?</h2>
            <p style={subtextStyle}>
              Keel keeps everything as plain markdown files in a local folder. Pick a fresh folder or point Keel at one you already use.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16, textAlign: 'left' }}>
              {/* Card A: Start fresh */}
              <button
                onClick={chooseDefault}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '14px 16px', borderRadius: 'var(--radius-lg)',
                  background: pathMode === 'default' ? 'var(--accent-bg)' : 'var(--bg-surface)',
                  border: `1px solid ${pathMode === 'default' ? 'var(--accent-border)' : 'var(--border-default)'}`,
                  cursor: 'pointer', transition: 'var(--transition-base)',
                  color: 'var(--text-primary)', fontFamily: 'inherit',
                }}
              >
                <div style={{ fontSize: 'var(--text-base)', fontWeight: 500, marginBottom: 4 }}>
                  Start fresh
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-subtle)', lineHeight: 1.5 }}>
                  Use <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 4 }}>{defaultBrainPath}</code>. Keel will create Projects, Areas, Resources, and Archive folders for you.
                </div>
              </button>

              {/* Card B: Use existing */}
              <button
                onClick={pickExistingFolder}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '14px 16px', borderRadius: 'var(--radius-lg)',
                  background: pathMode === 'existing' ? 'var(--accent-bg)' : 'var(--bg-surface)',
                  border: `1px solid ${pathMode === 'existing' ? 'var(--accent-border)' : 'var(--border-default)'}`,
                  cursor: 'pointer', transition: 'var(--transition-base)',
                  color: 'var(--text-primary)', fontFamily: 'inherit',
                }}
              >
                <div style={{ fontSize: 'var(--text-base)', fontWeight: 500, marginBottom: 4 }}>
                  Use an existing folder
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-subtle)', lineHeight: 1.5 }}>
                  Point Keel at a folder you already use for notes or files. We'll add PARA folders alongside your content — nothing is moved.
                </div>
                {pathMode === 'existing' && settings.brainPath && (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8, fontFamily: 'monospace' }}>
                    {settings.brainPath}
                  </div>
                )}
              </button>
            </div>

            {/* Scan preview for existing folder */}
            {pathMode === 'existing' && (
              <div style={{
                textAlign: 'left', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
                padding: '12px 14px', marginBottom: 16, border: '1px solid var(--border-default)',
                fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.6,
              }}>
                {scanning && <div>Scanning folder…</div>}
                {!scanning && scan && scan.exists && (
                  <>
                    {scan.isEmpty ? (
                      <div>This folder is empty. Keel will set up PARA structure here.</div>
                    ) : (
                      <>
                        <div style={{ marginBottom: 6 }}>
                          Found <strong style={{ color: 'var(--text-primary)' }}>{scan.dirCount} folders</strong> and <strong style={{ color: 'var(--text-primary)' }}>{scan.fileCount} files</strong> at the top level.
                        </div>
                        {scan.hasKeelFiles && (
                          <div style={{ marginBottom: 6, color: 'var(--accent)' }}>
                            ✓ Looks like an existing Keel folder — we'll use it as-is.
                          </div>
                        )}
                        {!scan.hasKeelFiles && scan.hasParaDirs && (
                          <div style={{ marginBottom: 6, color: 'var(--accent)' }}>
                            ✓ PARA structure detected — we'll use your existing folders.
                          </div>
                        )}
                        {!scan.hasKeelFiles && !scan.hasParaDirs && (
                          <div>
                            Keel will add <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 4 }}>Projects/</code>, <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 4 }}>Areas/</code>, <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 4 }}>Resources/</code>, and <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 4 }}>Archive/</code> alongside your content. Existing files stay where they are.
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
                {!scanning && scan && !scan.exists && (
                  <div style={{ color: 'var(--text-warning, #d97706)' }}>
                    Couldn't read that folder{scan.error ? `: ${scan.error}` : '.'}
                  </div>
                )}
              </div>
            )}

            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 16 }}>
              You can change this later in Settings.
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
              <button onClick={back} style={secondaryBtn}>Back</button>
              <button
                onClick={next}
                disabled={!canContinueBrainPath}
                style={{ ...primaryBtn, opacity: canContinueBrainPath ? 1 : 0.5, cursor: canContinueBrainPath ? 'pointer' : 'not-allowed' }}
              >
                Continue
              </button>
            </div>
          </>
        )}

        {/* Provider Selection */}
        {step === 'provider' && (
          <>
            <h2 style={headingStyle}>Choose your AI model</h2>
            <p style={subtextStyle}>
              Local Mistral is free — no API key, no account. Mistral 7B downloads automatically after setup. Claude, OpenAI, and OpenRouter require Keel Pro + your own API key.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24, textAlign: 'left' }}>
              {PROVIDERS.map((p) => {
                const isSelected = settings.provider === p.value;
                const isOllama = p.value === 'ollama';
                return (
                  <label
                    key={p.value}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 12,
                      padding: '12px 14px', borderRadius: 'var(--radius-lg)',
                      background: isSelected ? 'var(--accent-bg)' : 'var(--bg-surface)',
                      border: `1px solid ${isSelected ? 'var(--accent-border)' : 'var(--border-default)'}`,
                      cursor: 'pointer', transition: 'var(--transition-base)',
                    }}
                  >
                    <input
                      type="radio"
                      name="provider"
                      checked={isSelected}
                      onChange={() => setSettings({ ...settings, provider: p.value })}
                      style={{ accentColor: 'var(--accent)', marginTop: 3 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 'var(--text-base)', fontWeight: 500, color: 'var(--text-primary)' }}>{p.label}</span>
                        {/* Free / Pro tier badge */}
                        <span style={{
                          fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
                          textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4,
                          background: isOllama
                            ? 'rgba(76,175,80,0.15)'
                            : 'rgba(207,122,92,0.15)',
                          color: isOllama ? '#7dd87f' : '#CF7A5C',
                          border: `1px solid ${isOllama ? 'rgba(76,175,80,0.3)' : 'rgba(207,122,92,0.3)'}`,
                        }}>
                          {p.tag}
                        </span>
                        {/* Google Limited Use badge intentionally omitted from onboarding — shown in Settings instead */}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-subtle)', lineHeight: 1.5 }}>
                        {isOllama ? (
                          <>
                            {p.description}{' '}
                            <a href={p.signupUrl} target="_blank" rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              style={{ color: 'var(--accent)' }}>
                              Get Ollama
                            </a>
                          </>
                        ) : (
                          <>
                            {p.description} — requires Keel Pro + your own API key.
                          </>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
              <button onClick={back} style={secondaryBtn}>Back</button>
              <button
                onClick={() => {
                  if (!needsApiKey) {
                    setStep('ollama-setup'); // Ollama — check it's installed before profile
                  } else {
                    setStep('pro-gate'); // Pro provider — must activate license first
                  }
                }}
                style={primaryBtn}
              >
                Next
              </button>
            </div>
          </>
        )}

        {/* Ollama Setup — blocks until Ollama is installed and running */}
        {step === 'ollama-setup' && (
          <OllamaSetupStep
            ollamaRunning={ollamaRunning}
            setOllamaRunning={setOllamaRunning}
            pulling={ollamaSetupPulling}
            setPulling={setOllamaSetupPulling}
            progress={ollamaSetupProgress}
            setProgress={setOllamaSetupProgress}
            status={ollamaSetupStatus}
            setStatus={setOllamaSetupStatus}
            onBack={() => setStep('provider')}
            onNext={() => setStep('profile')}
          />
        )}

        {/* Pro Gate — license activation required before entering API key */}
        {step === 'pro-gate' && (
          <>
            <h2 style={headingStyle}>Activate Keel Pro</h2>
            <p style={subtextStyle}>
              Using {selectedProvider?.label} requires a Keel Pro license. Enter your license key below, or{' '}
              <a href="https://keel-pro.lemonsqueezy.com/checkout/buy/1c224dc6-5e38-4d05-a068-e8a751a9eefb" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                get Keel Pro
              </a>.
            </p>

            <div style={{ textAlign: 'left', marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-subtle)', marginBottom: 6 }}>
                License key
              </label>
              <input
                type="text"
                value={proLicenseInput}
                onChange={(e) => { setProLicenseInput(e.target.value); setProActivateError(''); }}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
                  color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box' as const,
                  fontFamily: 'monospace',
                }}
              />
              {proActivateError && (
                <p style={{ fontSize: 12, color: 'var(--destructive)', marginTop: 8 }}>{proActivateError}</p>
              )}
            </div>

            <div style={{ marginBottom: 24, padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', fontSize: 12, color: 'var(--text-subtle)', lineHeight: 1.5, textAlign: 'left' }}>
              Don't have a license yet?{' '}
              <a
                href="https://keel-pro.lemonsqueezy.com/checkout/buy/1c224dc6-5e38-4d05-a068-e8a751a9eefb"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--accent)' }}
              >
                Get Keel Pro
              </a>
              , then come back and paste your key above. Or{' '}
              <button
                onClick={() => setStep('provider')}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 'inherit', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
              >
                go back and use Local Mistral for free
              </button>.
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
              <button onClick={() => setStep('provider')} style={secondaryBtn}>Back</button>
              <button
                disabled={!proLicenseInput.trim() || proActivating}
                style={{ ...primaryBtn, opacity: (!proLicenseInput.trim() || proActivating) ? 0.5 : 1, cursor: (!proLicenseInput.trim() || proActivating) ? 'not-allowed' : 'pointer' }}
                onClick={async () => {
                  setProActivating(true);
                  setProActivateError('');
                  try {
                    const result = await window.keel.proActivate(proLicenseInput.trim());
                    if (result.ok) {
                      setSettings({ ...settings, proLicenseKey: proLicenseInput.trim() });
                      setStep('api-key');
                    } else {
                      setProActivateError(result.error || 'License key not valid. Check it and try again.');
                    }
                  } catch {
                    setProActivateError('Could not verify the license key. Check your internet connection.');
                  } finally {
                    setProActivating(false);
                  }
                }}
              >
                {proActivating ? 'Activating…' : 'Activate'}
              </button>
            </div>
          </>
        )}

        {/* API Key */}
        {step === 'api-key' && (
          <>
            <h2 style={headingStyle}>Enter your API key</h2>
            <p style={subtextStyle}>
              {settings.provider === 'claude' && (
                <>Get your key from <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>console.anthropic.com</a>. You'll also need to add billing credits before the key works.</>
              )}
              {settings.provider === 'openai' && (
                <>Get your key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>platform.openai.com</a>. Note: a ChatGPT Plus subscription is separate from API access — you'll need to add billing credits at <a href="https://platform.openai.com/account/billing" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>platform.openai.com/account/billing</a>.</>
              )}
              {settings.provider === 'openrouter' && (
                <>Get your key from <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>openrouter.ai/keys</a>. Most models require credits at <a href="https://openrouter.ai/credits" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>openrouter.ai/credits</a>.</>
              )}
            </p>
            <div style={{ position: 'relative', marginBottom: 12 }}>
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

            {/* Test-connection feedback */}
            <div style={{ marginBottom: 20, minHeight: 24, textAlign: 'left', fontSize: 12, lineHeight: 1.5 }}>
              {testKeyStatus === 'testing' && (
                <span style={{ color: 'var(--text-muted)' }}>Checking key with provider…</span>
              )}
              {testKeyStatus === 'ok' && (
                <span style={{ color: '#7dd87f' }}>✓ Key works. You're ready to continue.</span>
              )}
              {testKeyStatus === 'error' && (
                <span style={{ color: '#ff8a8a' }}>{testKeyError}</span>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
              <button onClick={() => setStep('pro-gate')} style={secondaryBtn}>Back</button>
              <button
                onClick={testApiKey}
                disabled={getApiKey().length < 5 || testKeyStatus === 'testing'}
                style={{
                  ...secondaryBtn,
                  border: '1px solid var(--border-default)',
                  opacity: (getApiKey().length < 5 || testKeyStatus === 'testing') ? 0.5 : 1,
                }}
              >
                {testKeyStatus === 'testing' ? 'Testing…' : 'Test connection'}
              </button>
              <button
                onClick={next}
                disabled={testKeyStatus !== 'ok'}
                style={{
                  ...primaryBtn,
                  opacity: testKeyStatus === 'ok' ? 1 : 0.5,
                  cursor: testKeyStatus === 'ok' ? 'pointer' : 'not-allowed',
                }}
                title={testKeyStatus === 'ok' ? '' : 'Test the connection first.'}
              >
                Next
              </button>
            </div>
            <button
              onClick={skipApiKeyWithWarning}
              style={{ ...secondaryBtn, marginTop: 8, fontSize: 12 }}
            >
              Skip for now (chat won't work until you add a key)
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

        {/* Your Work */}
        {step === 'your-work' && !ingestSummary && (
          <>
            <h2 style={headingStyle}>What are you working on?</h2>
            <p style={subtextStyle}>
              A few minutes of context now means Keel can actually help you. Add 1–4 active projects. You can edit any of this later.
            </p>

            {/* Google Doc connect prompt — shown when user pastes a Google Doc URL but hasn't connected */}
            {hasGoogleDocRef && googleConnected === false && (
              <div style={{
                textAlign: 'left', padding: '12px 14px', marginBottom: 14,
                background: 'var(--accent-bg)', border: '1px solid var(--accent-border)',
                borderRadius: 'var(--radius-lg)',
                fontSize: 13, color: 'var(--text-subtle)', lineHeight: 1.5,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <div>
                  <strong style={{ color: 'var(--text-primary)' }}>Connect Google to import Docs.</strong>{' '}
                  Keel needs read access to the Google Docs you've linked.
                </div>
                <button
                  onClick={connectGoogle}
                  disabled={connectingGoogle}
                  style={{
                    padding: '8px 14px', borderRadius: 8, border: 'none',
                    background: 'var(--accent)', color: 'white', fontSize: 13, fontWeight: 600,
                    cursor: connectingGoogle ? 'wait' : 'pointer', fontFamily: 'inherit',
                    whiteSpace: 'nowrap', opacity: connectingGoogle ? 0.7 : 1,
                  }}
                >
                  {connectingGoogle ? 'Connecting…' : 'Connect Google'}
                </button>
              </div>
            )}
            {hasGoogleDocRef && googleConnected === true && (
              <div style={{
                textAlign: 'left', padding: '8px 12px', marginBottom: 14,
                background: 'rgba(76,175,80,0.08)', border: '1px solid rgba(76,175,80,0.25)',
                borderRadius: 'var(--radius-lg)',
                fontSize: 12, color: '#7dd87f', lineHeight: 1.5,
              }}>
                ✓ Google connected — Keel will import your linked Docs.
              </div>
            )}

            <div style={{ textAlign: 'left', marginBottom: 16, maxHeight: '50vh', overflowY: 'auto' }}>
              {projects.map((proj, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border-default)', padding: '12px 14px',
                    marginBottom: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <input
                      type="text"
                      value={proj.name}
                      onChange={(e) => updateProject(idx, { name: e.target.value })}
                      placeholder={`Project ${idx + 1} name (e.g. Q3 fundraising)`}
                      style={{ ...inputStyle, flex: 1, padding: '8px 10px', fontSize: 14 }}
                    />
                    {projects.length > 1 && (
                      <button
                        onClick={() => removeProject(idx)}
                        style={{
                          background: 'transparent', border: 'none',
                          color: 'var(--text-muted)', cursor: 'pointer',
                          fontSize: 18, padding: '4px 8px', lineHeight: 1,
                        }}
                        title="Remove"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={proj.description}
                    onChange={(e) => updateProject(idx, { description: e.target.value })}
                    placeholder="One-line description"
                    style={{ ...inputStyle, padding: '8px 10px', fontSize: 13, marginBottom: 8 }}
                  />
                  <textarea
                    value={proj.docRefs}
                    onChange={(e) => updateProject(idx, { docRefs: e.target.value })}
                    placeholder="Optional: paste Google Doc URLs or local file paths (one per line). Keel will read them and save the context."
                    rows={3}
                    style={{
                      ...inputStyle, padding: '8px 10px', fontSize: 12,
                      fontFamily: 'monospace', resize: 'vertical', marginBottom: 8,
                    }}
                  />
                  <button
                    onClick={() => browseProjectDocs(idx)}
                    style={{
                      padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-default)',
                      background: 'transparent', color: 'var(--text-muted)', fontSize: 12,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    Browse files…
                  </button>
                </div>
              ))}
              {projects.length < 4 && (
                <button
                  onClick={addProject}
                  style={{
                    width: '100%', padding: '10px', borderRadius: 'var(--radius-lg)',
                    border: '1px dashed var(--border-default)', background: 'transparent',
                    color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
                    fontFamily: 'inherit', marginBottom: 16,
                  }}
                >
                  + Add another project
                </button>
              )}

              <label style={{
                fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
                marginBottom: 6, display: 'block', textTransform: 'uppercase',
                letterSpacing: '0.04em', marginTop: 8,
              }}>Key People (optional)</label>
              <textarea
                value={people}
                onChange={(e) => setPeople(e.target.value)}
                placeholder="One per line, e.g.&#10;Sarah Chen — co-founder&#10;James — investor at Acme"
                rows={3}
                style={{ ...inputStyle, padding: '8px 10px', fontSize: 13, resize: 'vertical', marginBottom: 12 }}
              />

              <label style={{
                fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
                marginBottom: 6, display: 'block', textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}>Anything else Keel should know? (optional)</label>
              <textarea
                value={contextNote}
                onChange={(e) => setContextNote(e.target.value)}
                placeholder="Working style, current priorities, things Keel should always remember…"
                rows={3}
                style={{ ...inputStyle, padding: '8px 10px', fontSize: 13, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
              <button onClick={back} style={secondaryBtn} disabled={ingesting}>Back</button>
              <button
                onClick={runIngest}
                disabled={ingesting}
                style={{
                  ...primaryBtn,
                  opacity: ingesting ? 0.6 : 1,
                  cursor: ingesting ? 'wait' : 'pointer',
                }}
              >
                {ingesting ? 'Saving…' : 'Continue'}
              </button>
            </div>
            <button
              onClick={() => { setIngestSummary({ projectsCreated: 0, docsFetched: 0, docsFailed: [] }); next(); }}
              disabled={ingesting}
              style={{ ...secondaryBtn, marginTop: 8, fontSize: 12 }}
            >
              Skip
            </button>
          </>
        )}

        {/* Your Work — post-ingest summary (transient before Done) */}
        {step === 'your-work' && ingestSummary && (
          <>
            <h2 style={headingStyle}>Saved.</h2>
            <p style={subtextStyle}>
              {ingestSummary.projectsCreated > 0
                ? `Created ${ingestSummary.projectsCreated} project${ingestSummary.projectsCreated === 1 ? '' : 's'}${ingestSummary.docsFetched > 0 ? `, imported ${ingestSummary.docsFetched} document${ingestSummary.docsFetched === 1 ? '' : 's'}` : ''}.`
                : 'Skipped — you can add projects anytime from the app.'}
            </p>
            {ingestSummary.docsFailed.length > 0 && (
              <div style={{
                textAlign: 'left', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
                padding: '10px 12px', marginBottom: 16, border: '1px solid var(--border-default)',
                fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5,
              }}>
                <strong style={{ color: 'var(--text-muted)' }}>Couldn't import {ingestSummary.docsFailed.length} document{ingestSummary.docsFailed.length === 1 ? '' : 's'}:</strong>
                <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                  {ingestSummary.docsFailed.slice(0, 5).map((f, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>
                      <code style={{ fontSize: 11 }}>{f.ref.slice(0, 60)}</code> — {f.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button onClick={next} style={primaryBtn}>Continue</button>
          </>
        )}

        {/* Done */}
        {step === 'done' && (
          <>
            <img
              src={keelLogoUrl}
              alt="Keel"
              style={{
                display: 'block',
                width: 200,
                height: 'auto',
                margin: '0 auto 16px',
              }}
            />
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

// ---------------------------------------------------------------------------
// OllamaSetupStep — checks Ollama is installed + running before proceeding.
// Polls every 2s; shows download link if not running; shows pull progress if
// Mistral is downloading; "Continue" only enabled when Ollama is up.
// ---------------------------------------------------------------------------

interface OllamaSetupStepProps {
  ollamaRunning: boolean;
  setOllamaRunning: (v: boolean) => void;
  pulling: boolean;
  setPulling: (v: boolean) => void;
  progress: number | undefined;
  setProgress: (v: number | undefined) => void;
  status: string;
  setStatus: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}

function OllamaSetupStep({
  ollamaRunning, setOllamaRunning,
  pulling, setPulling,
  progress, setProgress,
  status, setStatus,
  onBack, onNext,
}: OllamaSetupStepProps) {
  const heading: React.CSSProperties = { fontSize: 26, fontWeight: 700, margin: '0 0 10px', color: 'var(--text-primary)' };
  const subtext: React.CSSProperties = { fontSize: 15, color: 'var(--text-secondary)', margin: '0 0 28px', lineHeight: 1.55 };
  const primary: React.CSSProperties = { padding: '12px 28px', borderRadius: 10, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer' };
  const secondary: React.CSSProperties = { padding: '12px 24px', borderRadius: 10, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', fontSize: 15, cursor: 'pointer' };

  // Poll Ollama every 2s to detect when it starts running.
  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (cancelled) return;
      try {
        const result = await window.keel.ollamaListModels?.();
        if (cancelled) return;
        if (!result?.error) {
          setOllamaRunning(true);
          // Check if mistral is already there or being pulled.
          const hasMistral = result?.models?.some((m: { name: string }) => m.name.startsWith('mistral'));
          if (!hasMistral) {
            // Check if a pull is already in progress.
            const pullStatus = await window.keel.ollamaModelStatus?.('mistral');
            if (pullStatus?.pulling) {
              setPulling(true);
              setProgress(pullStatus.progress);
              setStatus(pullStatus.status || 'Downloading...');
            } else if (!pullStatus?.ready) {
              // Kick off the pull automatically.
              setPulling(true);
              setProgress(0);
              setStatus('Starting download...');
              window.keel.ollamaPullModel?.('mistral').catch(() => {});
            }
          }
        } else {
          setOllamaRunning(false);
        }
      } catch {
        if (!cancelled) setOllamaRunning(false);
      }
    };

    void check();
    const interval = setInterval(check, 2000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [setOllamaRunning, setPulling, setProgress, setStatus]);

  // Subscribe to pull progress events.
  useEffect(() => {
    const unsub = window.keel.onOllamaPullProgress?.((payload) => {
      if (!payload.modelName.startsWith('mistral')) return;
      if (payload.status === 'ready') {
        setPulling(false);
        setProgress(100);
        setStatus('Ready');
      } else if (payload.status === 'error') {
        setPulling(false);
        setStatus('Download failed — try again');
      } else {
        setPulling(true);
        setStatus(payload.status);
        if (payload.progress != null) setProgress(payload.progress);
      }
    });
    return () => unsub?.();
  }, [setPulling, setProgress, setStatus]);

  const mistralReady = progress === 100 || status === 'Ready';
  const canContinue = ollamaRunning && (mistralReady || pulling === false);

  return (
    <>
      <h2 style={heading}>Set up Local AI</h2>
      <p style={subtext}>
        Keel uses <strong>Ollama</strong> to run Mistral 7B on your machine — free, private, and offline.
        Install the Ollama app once, then come back. Keel will download Mistral automatically.
      </p>

      {/* Step 1 — Install Ollama */}
      <div style={{
        padding: '16px 20px', borderRadius: 12,
        background: ollamaRunning ? 'rgba(76,175,80,0.08)' : 'var(--surface-panel)',
        border: `1px solid ${ollamaRunning ? 'rgba(76,175,80,0.25)' : 'var(--border-subtle)'}`,
        marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>
              {ollamaRunning ? '✓ Ollama is running' : 'Step 1: Install Ollama'}
            </div>
            {!ollamaRunning && (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Free app. Download, install, and leave it running — Keel will detect it automatically.
              </div>
            )}
          </div>
          {!ollamaRunning && (
            <button
              onClick={() => window.keel.openPath?.('https://ollama.com/download')}
              style={{ ...primary, padding: '8px 16px', fontSize: 13, whiteSpace: 'nowrap' as const }}
            >
              Download Ollama
            </button>
          )}
        </div>
      </div>

      {/* Step 2 — Mistral download (only shown once Ollama is running) */}
      {ollamaRunning && (
        <div style={{
          padding: '16px 20px', borderRadius: 12,
          background: mistralReady ? 'rgba(76,175,80,0.08)' : 'var(--surface-panel)',
          border: `1px solid ${mistralReady ? 'rgba(76,175,80,0.25)' : 'var(--border-subtle)'}`,
          marginBottom: 12,
        }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>
            {mistralReady ? '✓ Mistral 7B is ready' : pulling ? 'Downloading Mistral 7B...' : 'Step 2: Download Mistral 7B'}
          </div>
          {!mistralReady && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: pulling ? 10 : 0 }}>
              {pulling ? status : 'About 4 GB. Downloads once, runs forever.'}
            </div>
          )}
          {pulling && progress != null && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                <span>{status}</span>
                <span>{progress}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--border-subtle)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.3s ease' }} />
              </div>
            </div>
          )}
        </div>
      )}

      {!ollamaRunning && (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' as const, margin: '8px 0 0' }}>
          Waiting for Ollama to start... Keel will detect it automatically.
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 24 }}>
        <button onClick={onBack} style={secondary}>Back</button>
        <button
          onClick={onNext}
          disabled={!ollamaRunning}
          style={{ ...primary, opacity: ollamaRunning ? 1 : 0.4, cursor: ollamaRunning ? 'pointer' : 'not-allowed' }}
        >
          {mistralReady ? 'Continue' : pulling ? 'Continue (downloading in background)' : 'Continue'}
        </button>
      </div>
    </>
  );
}
