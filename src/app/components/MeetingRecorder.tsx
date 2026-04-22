import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { MeetingEntry, MeetingTranscriptionResult, TaskGroup } from '../../shared/types';

type RecorderState = 'idle' | 'recording' | 'stopped' | 'processing' | 'done' | 'error';

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

export default function MeetingRecorder({ onOpenSettings }: Props) {
  const [recorderState, setRecorderState] = useState<RecorderState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [progressStep, setProgressStep] = useState('');
  const [result, setResult] = useState<MeetingTranscriptionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [hasOpenAIKey, setHasOpenAIKey] = useState(false);
  const [pastMeetings, setPastMeetings] = useState<MeetingEntry[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(true);

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
  // Refs that stay current inside closures created during recording
  const elapsedRef = useRef(0);
  const hasOpenAIKeyRef = useRef(hasOpenAIKey);

  useEffect(() => {
    window.keel.getSettings().then((s) => {
      const val = !!s.openaiApiKey;
      setHasOpenAIKey(val);
      hasOpenAIKeyRef.current = val;
    }).catch(() => {});
  }, []);

  const loadMeetings = useCallback(() => {
    setLoadingMeetings(true);
    window.keel.listMeetings().then(setPastMeetings).catch(() => setPastMeetings([])).finally(() => setLoadingMeetings(false));
  }, []);

  useEffect(() => { loadMeetings(); }, [loadMeetings]);

  useEffect(() => {
    const unsub = window.keel.onMeetingProgress((p) => setProgressStep(p.step));
    return () => unsub();
  }, []);

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

        if (hasOpenAIKeyRef.current) {
          handleWhisperTranscribe(blob);
        } else {
          setManualNotes('');
          setRecorderState('stopped');
        }
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

  const handleWhisperTranscribe = async (blob: Blob) => {
    setRecorderState('processing');
    setProgressStep('Transcribing audio…');
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const res = await window.keel.transcribeMeeting(arrayBuffer);
      if (res.ok) {
        setResult(res);
        loadTasks();
        setRecorderState('done');
        loadMeetings();
      } else {
        setErrorMessage(res.error || 'Transcription failed.');
        setRecorderState('error');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Transcription failed.');
      setRecorderState('error');
    }
  };

  const handleSynthesizeFromNotes = async () => {
    const text = manualNotes.trim();
    if (!text) return;
    setRecorderState('processing');
    setProgressStep('Synthesizing notes…');
    try {
      const res = await window.keel.synthesizeMeeting(text);
      if (res.ok) {
        setResult(res);
        loadTasks();
        setRecorderState('done');
        loadMeetings();
      } else {
        setErrorMessage(res.error || 'Synthesis failed.');
        setRecorderState('error');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unexpected error.');
      setRecorderState('error');
    }
  };

  const loadTasks = () => {
    window.keel.listTasks().then((groups) => {
      setTaskGroups(groups);
      setCheckedItems(new Set());
      setSelectedProject('tasks.md');
      setTasksAdded(false);
    }).catch(() => {});
  };

  const handleAddToTasks = async () => {
    if (!result?.actionItems) return;
    setAddingTasks(true);
    const items = result.actionItems.filter((_, i) => checkedItems.has(i));
    for (const item of items) {
      try {
        await window.keel.createTask(selectedProject, item);
      } catch { /* continue */ }
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
    setManualNotes('');
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '24px 32px 0', flexShrink: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Meetings</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          {hasOpenAIKey
            ? 'Record a meeting — Keel will transcribe and extract action items automatically.'
            : 'Record a meeting or paste a transcript to extract action items and save notes.'}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 12, padding: '32px 28px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, textAlign: 'center',
        }}>

          {/* ── IDLE ── */}
          {recorderState === 'idle' && (
            <>
              <div style={{ color: 'var(--text-muted)', opacity: 0.4 }}><MicIcon size={44} /></div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Ready to record</div>
                <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 380 }}>
                  {hasOpenAIKey
                    ? 'Record your meeting. Keel will auto-transcribe with Whisper when you stop.'
                    : 'Record your meeting, then add notes or a transcript to synthesize action items.'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                <button onClick={handleStartRecording} style={btn('accent')}>
                  <MicIcon size={15} /> Start Recording
                </button>
                {!hasOpenAIKey && (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    <button
                      onClick={() => onOpenSettings?.('ai-setup')}
                      style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, padding: 0, textDecoration: 'underline' }}
                    >
                      Add an OpenAI key
                    </button>
                    {' '}for auto-transcription
                  </div>
                )}
              </div>
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

          {/* ── STOPPED (no Whisper key) — add notes ── */}
          {recorderState === 'stopped' && (
            <div style={{ width: '100%', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'rgba(34,197,94,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22c55e', flexShrink: 0,
                }}>
                  <CheckIcon />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                    Recording saved — {formatDuration(recordedDurationRef.current)}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                    Paste your transcript or jot down key notes below to synthesize action items.
                  </div>
                </div>
              </div>
              <textarea
                autoFocus
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                placeholder="Paste meeting transcript or type key notes here…"
                style={{
                  width: '100%', minHeight: 160,
                  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                  borderRadius: 8, padding: '12px 14px', fontSize: 14, color: 'var(--text-primary)',
                  lineHeight: 1.7, resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button onClick={handleSynthesizeFromNotes} disabled={!manualNotes.trim()} style={btn('accent', !manualNotes.trim())}>
                  Synthesize Notes
                </button>
                <button onClick={handleReset} style={btn('ghost')}>Discard</button>
              </div>
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
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Processing meeting</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{progressStep || 'Working…'}</div>
              </div>
            </>
          )}

          {/* ── DONE ── */}
          {recorderState === 'done' && result && (
            <div style={{ width: '100%', textAlign: 'left' }}>
              {/* Title */}
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

              {/* Summary */}
              {result.summary && (
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.65 }}>
                  {result.summary}
                </div>
              )}

              {/* Action items with checkboxes */}
              {result.actionItems && result.actionItems.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                    Action Items
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {result.actionItems.map((item, i) => (
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

                  {/* Add to tasks bar */}
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
                    <div style={{ marginTop: 10, fontSize: 13, color: '#22c55e' }}>
                      ✓ Tasks added
                    </div>
                  )}
                </div>
              )}

              {/* Footer actions */}
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                {result.meetingPath && (
                  <button onClick={() => window.keel.openPath(result.meetingPath!)} style={btn('ghost')}>
                    <FileIcon /> Open in Obsidian
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
              <div style={{ color: '#ef4444', fontSize: 34 }}>✕</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 5 }}>Something went wrong</div>
                <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 360 }}>{errorMessage}</div>
              </div>
              <button onClick={handleReset} style={btn('accent')}>Try Again</button>
            </>
          )}
        </div>

        {/* Past meetings */}
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
