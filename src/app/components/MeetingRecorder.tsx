import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { MeetingEntry, MeetingTranscriptionResult, TaskGroup, WhisperStatus } from '../../shared/types';

type RecorderState = 'idle' | 'recording' | 'processing' | 'done' | 'error';
type SetupState = 'checking' | 'ready' | 'needs-model';

interface Props {
  onOpenSettings?: (section?: string) => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function MicIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="9" y1="22" x2="15" y2="22" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export default function MeetingRecorder({ onOpenSettings }: Props) {
  const [recorderState, setRecorderState] = useState<RecorderState>('idle');
  const [setupState, setSetupState] = useState<SetupState>('checking');
  const [whisperStatus, setWhisperStatus] = useState<WhisperStatus | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [progressStep, setProgressStep] = useState('');
  const [transcriptionPercent, setTranscriptionPercent] = useState<number | null>(null);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [result, setResult] = useState<MeetingTranscriptionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [pastMeetings, setPastMeetings] = useState<MeetingEntry[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(true);
  const [hasOpenAIKey, setHasOpenAIKey] = useState(false);

  // Add-to-tasks state
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const [selectedProject, setSelectedProject] = useState<string>('tasks.md');
  const [addingTasks, setAddingTasks] = useState(false);
  const [tasksAdded, setTasksAdded] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioBlobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordedDurationRef = useRef(0);
  const elapsedRef = useRef(0);
  const hasOpenAIKeyRef = useRef(false);
  const whisperReadyRef = useRef(false);

  // ── Setup check ──────────────────────────────────────────────────────────
  const checkSetup = useCallback(async () => {
    setSetupState('checking');
    try {
      const [status, settings] = await Promise.all([
        window.keel.checkWhisper(),
        window.keel.getSettings(),
      ]);
      setWhisperStatus(status);
      const hasKey = !!settings.openaiApiKey;
      setHasOpenAIKey(hasKey);
      hasOpenAIKeyRef.current = hasKey;

      if (status.binaryAvailable && status.modelDownloaded) {
        whisperReadyRef.current = true;
        setSetupState('ready');
      } else if (status.binaryAvailable && !status.modelDownloaded) {
        whisperReadyRef.current = false;
        setSetupState('needs-model');
      } else {
        // Binary always bundled; if missing fall back to OpenAI key or show needs-model
        whisperReadyRef.current = false;
        setSetupState(hasKey ? 'ready' : 'needs-model');
      }
    } catch {
      setSetupState('needs-setup');
    }
  }, []);

  useEffect(() => { checkSetup(); }, [checkSetup]);

  const loadMeetings = useCallback(() => {
    setLoadingMeetings(true);
    window.keel.listMeetings().then(setPastMeetings).catch(() => setPastMeetings([])).finally(() => setLoadingMeetings(false));
  }, []);

  useEffect(() => { loadMeetings(); }, [loadMeetings]);

  // Subscribe to progress events
  useEffect(() => {
    const u1 = window.keel.onMeetingProgress((p) => setProgressStep(p.step));
    const u2 = window.keel.onTranscriptionProgress((p) => setTranscriptionPercent(p.percent));
    const u3 = window.keel.onModelDownloadProgress((p) => setDownloadPercent(p.percent));
    return () => { u1(); u2(); u3(); };
  }, []);

  // ── Timer ─────────────────────────────────────────────────────────────────
  const startTimer = () => {
    elapsedRef.current = 0;
    setElapsed(0);
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed((n) => n + 1);
    }, 1000);
  };
  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  // ── Model download ────────────────────────────────────────────────────────
  const handleDownloadModel = async () => {
    setIsDownloading(true);
    setDownloadPercent(0);
    try {
      const res = await window.keel.downloadWhisperModel('base.en');
      if (res.ok) {
        await checkSetup();
      } else {
        setErrorMessage(res.error || 'Download failed');
        setRecorderState('error');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Download failed');
      setRecorderState('error');
    } finally {
      setIsDownloading(false);
      setDownloadPercent(null);
    }
  };

  // ── Recording ─────────────────────────────────────────────────────────────
  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      audioBlobRef.current = null;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        stopTimer();
        recordedDurationRef.current = elapsedRef.current;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        audioBlobRef.current = blob;
        handleTranscribe(blob);
      };

      mediaRecorder.start(1000);
      setRecorderState('recording');
      startTimer();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not access microphone.');
      setRecorderState('error');
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
  };

  const handleTranscribe = async (blob: Blob) => {
    setRecorderState('processing');
    setTranscriptionPercent(null);
    setProgressStep('');
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const res = await window.keel.transcribeMeeting(arrayBuffer);

      if (res.ok) {
        setResult(res);
        loadTasks(res.myActionItems?.length ?? 0);
        setRecorderState('done');
        loadMeetings();
      } else if (res.error === 'no_transcription_available') {
        setErrorMessage('');
        setRecorderState('error');
      } else {
        setErrorMessage(res.error || 'Transcription failed.');
        setRecorderState('error');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Transcription failed.');
      setRecorderState('error');
    }
  };

  const loadTasks = (myItemCount = 0) => {
    window.keel.listTasks().then((groups) => {
      setTaskGroups(groups);
      // Pre-select all "my" action items — user deselects ones they don't want
      setCheckedItems(new Set(Array.from({ length: myItemCount }, (_, i) => i)));
      setSelectedProject('tasks.md');
      setTasksAdded(false);
    }).catch(() => {});
  };

  const handleAddToTasks = async () => {
    const items_source = result?.myActionItems ?? result?.actionItems;
    if (!items_source) return;
    setAddingTasks(true);
    const items = items_source.filter((_, i) => checkedItems.has(i));
    for (const item of items) {
      try { await window.keel.createTask(selectedProject, item); } catch { /* continue */ }
    }
    setAddingTasks(false);
    setTasksAdded(true);
    setCheckedItems(new Set());
  };

  const handleReset = () => {
    setRecorderState('idle');
    setResult(null);
    setErrorMessage('');
    setProgressStep('');
    setElapsed(0);
    setTranscriptionPercent(null);
    setCheckedItems(new Set());
    setTasksAdded(false);
    chunksRef.current = [];
    audioBlobRef.current = null;
  };

  const projectOptions: Array<{ label: string; value: string }> = [
    { label: 'General tasks', value: 'tasks.md' },
    ...taskGroups.filter((g) => g.slug).map((g) => ({
      label: g.project,
      value: `projects/${g.slug}/tasks.md`,
    })),
  ];

  // ── Render helpers ────────────────────────────────────────────────────────
  const canRecord = setupState === 'ready';
  const transcriptionEngine = whisperStatus?.binaryAvailable && whisperStatus?.modelDownloaded
    ? 'local (whisper.cpp)'
    : hasOpenAIKey ? 'OpenAI Whisper' : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '24px 32px 0', flexShrink: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Meetings</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          {transcriptionEngine
            ? `Transcription: ${transcriptionEngine}`
            : 'Record a meeting and transcribe it locally.'}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 12, padding: '32px 28px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, textAlign: 'center',
        }}>

          {/* ── CHECKING setup ── */}
          {setupState === 'checking' && recorderState === 'idle' && (
            <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Checking transcription setup…</div>
          )}

          {/* ── NEEDS MODEL DOWNLOAD ── */}
          {setupState === 'needs-model' && recorderState === 'idle' && (
            <div style={{ width: '100%', textAlign: 'left' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 20 }}>
                <div style={{ color: 'var(--text-muted)', opacity: 0.5, flexShrink: 0, marginTop: 4 }}><MicIcon size={32} /></div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>whisper.cpp is installed</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    Download the <strong>base.en</strong> model (~142 MB) once to enable local transcription.
                    Transcription will run fully offline with no API key required.
                  </div>
                </div>
              </div>
              {isDownloading ? (
                <div style={{ width: '100%' }}>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
                    Downloading model… {downloadPercent !== null ? `${downloadPercent}%` : ''}
                  </div>
                  <div style={{ height: 6, background: 'var(--bg-surface)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', background: 'var(--accent)', borderRadius: 3,
                      width: `${downloadPercent ?? 0}%`, transition: 'width 0.3s',
                    }} />
                  </div>
                </div>
              ) : (
                <button onClick={handleDownloadModel} style={btn('accent')}>
                  <DownloadIcon /> Download Model (142 MB)
                </button>
              )}
            </div>
          )}

          {/* ── IDLE (ready) ── */}
          {setupState === 'ready' && recorderState === 'idle' && (
            <>
              <div style={{ color: 'var(--text-muted)', opacity: 0.4 }}><MicIcon size={44} /></div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Ready to record</div>
                <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 380 }}>
                  {whisperStatus?.binaryAvailable && whisperStatus?.modelDownloaded
                    ? 'Transcription runs locally on your device — no internet required.'
                    : 'Recording will be transcribed via OpenAI Whisper.'}
                </div>
              </div>
              <button onClick={handleStartRecording} style={btn('accent')}>
                <MicIcon size={15} /> Start Recording
              </button>
            </>
          )}

          {/* ── RECORDING ── */}
          {recorderState === 'recording' && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%', background: '#ef4444',
                  animation: 'keel-pulse 1.4s ease-in-out infinite', flexShrink: 0,
                }} />
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {formatDuration(elapsed)}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Recording…</div>
              </div>
              <button onClick={handleStopRecording} style={btn('danger')}>
                <StopIcon /> Stop Recording
              </button>
            </div>
          )}

          {/* ── PROCESSING ── */}
          {recorderState === 'processing' && (
            <>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                border: '3px solid var(--border-subtle)', borderTopColor: 'var(--accent)',
                animation: 'keel-spin 0.8s linear infinite',
              }} />
              <div style={{ width: '100%', maxWidth: 360 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4, textAlign: 'center' }}>
                  Processing meeting
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 10 }}>
                  {progressStep || 'Working…'}
                </div>
                {transcriptionPercent !== null && (
                  <div>
                    <div style={{ height: 4, background: 'var(--bg-surface)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', background: 'var(--accent)', borderRadius: 2,
                        width: `${transcriptionPercent}%`, transition: 'width 0.2s',
                      }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textAlign: 'center' }}>
                      {transcriptionPercent}%
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── DONE ── */}
          {recorderState === 'done' && result && (
            <div style={{ width: '100%', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'rgba(34,197,94,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22c55e', flexShrink: 0,
                }}>
                  <CheckIcon />
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {result.title || 'Meeting recorded'}
                </div>
              </div>

              {result.summary && (
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.65 }}>
                  {result.summary}
                </div>
              )}

              {/* My action items — with add-to-tasks */}
              {result.myActionItems && result.myActionItems.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      My Action Items
                    </div>
                    <button
                      onClick={() => {
                        const allSelected = checkedItems.size === result.myActionItems!.length;
                        setCheckedItems(allSelected ? new Set() : new Set(result.myActionItems!.map((_, i) => i)));
                        setTasksAdded(false);
                      }}
                      style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      {checkedItems.size === result.myActionItems.length ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {result.myActionItems.map((item, i) => (
                      <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={checkedItems.has(i)}
                          onChange={(e) => {
                            const next = new Set(checkedItems);
                            e.target.checked ? next.add(i) : next.delete(i);
                            setCheckedItems(next);
                            setTasksAdded(false);
                          }}
                          style={{ marginTop: 3, accentColor: 'var(--accent)', flexShrink: 0 }}
                        />
                        <span style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.5 }}>{item}</span>
                      </label>
                    ))}
                  </div>

                  {checkedItems.size > 0 && !tasksAdded && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10, marginTop: 14,
                      padding: '10px 14px', background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)', borderRadius: 8,
                    }}>
                      <PlusIcon />
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>
                        Add {checkedItems.size} item{checkedItems.size > 1 ? 's' : ''} to
                      </span>
                      <select
                        value={selectedProject}
                        onChange={(e) => setSelectedProject(e.target.value)}
                        style={{
                          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                          borderRadius: 6, padding: '4px 8px', fontSize: 13,
                          color: 'var(--text-primary)', cursor: 'pointer',
                        }}
                      >
                        {projectOptions.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <button onClick={handleAddToTasks} disabled={addingTasks} style={btn('accent', addingTasks)}>
                        {addingTasks ? 'Adding…' : 'Add to Tasks'}
                      </button>
                    </div>
                  )}

                  {tasksAdded && (
                    <div style={{ marginTop: 10, fontSize: 13, color: '#22c55e' }}>✓ Tasks added</div>
                  )}
                </div>
              )}

              {/* Others' action items — read-only, no add-to-tasks */}
              {result.othersActionItems && result.othersActionItems.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                    Others' Action Items
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {result.othersActionItems.map((item, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{
                          width: 15, height: 15, borderRadius: 3, border: '1.5px solid var(--border-subtle)',
                          flexShrink: 0, marginTop: 3,
                        }} />
                        <span style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Fallback: show combined list if split wasn't available (older results) */}
              {(!result.myActionItems && !result.othersActionItems) && result.actionItems && result.actionItems.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                    Action Items
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {result.actionItems.map((item, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ width: 15, height: 15, borderRadius: 3, border: '1.5px solid var(--border-subtle)', flexShrink: 0, marginTop: 3 }} />
                        <span style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.5 }}>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                {result.meetingPath && (
                  <button onClick={() => window.keel.openPath(result.meetingPath!)} style={btn('ghost')}>
                    <FileIcon /> Open Note
                  </button>
                )}
                <button onClick={handleReset} style={btn('accent')}>
                  <MicIcon size={13} /> Record Another
                </button>
              </div>
            </div>
          )}

          {/* ── ERROR ── */}
          {recorderState === 'error' && (
            <>
              {errorMessage ? (
                <>
                  <div style={{ color: '#ef4444', fontSize: 34 }}>✕</div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 5 }}>Something went wrong</div>
                    <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 360 }}>{errorMessage}</div>
                  </div>
                </>
              ) : (
                /* no_transcription_available — retry auto-download */
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 5 }}>Transcription engine unavailable</div>
                  <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 360 }}>
                    Could not download the transcription engine. Check your internet connection and try again.
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { checkSetup(); handleReset(); }} style={btn('accent')}>Try Again</button>
                {!hasOpenAIKey && (
                  <button onClick={() => onOpenSettings?.('ai-setup')} style={btn('ghost')}>Add OpenAI Key</button>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Past meetings ── */}
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>Past Meetings</div>
          {loadingMeetings ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>
          ) : pastMeetings.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No meetings yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {pastMeetings.map((m) => (
                <button key={m.path} onClick={() => window.keel.openPath(m.path)} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                  borderRadius: 8, padding: '10px 14px', textAlign: 'left', cursor: 'pointer', width: '100%',
                }}>
                  <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}><FileIcon /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.title}
                    </div>
                    {m.date && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{m.date}</div>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes keel-pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.5);opacity:.45} }
        @keyframes keel-spin { to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}

function btn(variant: 'accent' | 'danger' | 'ghost', disabled = false): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    border: 'none', borderRadius: 8, padding: '8px 18px',
    fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
  };
  if (variant === 'accent') return { ...base, background: 'var(--accent)', color: '#fff' };
  if (variant === 'danger') return { ...base, background: '#ef4444', color: '#fff' };
  return { ...base, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontWeight: 500 };
}
