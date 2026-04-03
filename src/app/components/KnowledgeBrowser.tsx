import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { FileEntry } from '../../shared/types';

interface Props {
  onBack: () => void;
}

function FolderItem({ entry, depth, onSelect, selectedPath, isTeam }: {
  entry: FileEntry; depth: number; onSelect: (path: string, team?: boolean) => void; selectedPath: string; isTeam?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileEntry[]>([]);

  const toggle = () => {
    if (!expanded && children.length === 0) {
      const listFn = isTeam ? window.keel.listTeamFiles : window.keel.listFiles;
      listFn(entry.path).then(setChildren).catch(() => {});
    }
    setExpanded(!expanded);
  };

  if (!entry.isDirectory) {
    const isActive = entry.path === selectedPath;
    return (
      <button
        onClick={() => onSelect(entry.path, isTeam)}
        style={{
          width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center',
          gap: 6, padding: '5px 8px', paddingLeft: 8 + depth * 16,
          borderRadius: 6, border: 'none',
          background: isActive ? 'rgba(207,122,92,0.15)' : 'transparent',
          color: isActive ? '#CF7A5C' : 'rgba(255,255,255,0.6)',
          fontSize: 13, cursor: 'pointer', transition: 'all 0.12s',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.background = 'transparent';
        }}
      >
        <span style={{ fontSize: 11, opacity: 0.5 }}>📄</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.name}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={toggle}
        style={{
          width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center',
          gap: 6, padding: '5px 8px', paddingLeft: 8 + depth * 16,
          borderRadius: 6, border: 'none', background: 'transparent',
          color: 'rgba(255,255,255,0.7)', fontSize: 13, cursor: 'pointer',
          fontWeight: 500, transition: 'all 0.12s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <span style={{ fontSize: 10, opacity: 0.4, transition: 'transform 0.15s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
        <span style={{ fontSize: 11 }}>📁</span>
        <span>{entry.name}</span>
      </button>
      {expanded && children.map((child) => (
        <FolderItem
          key={child.path}
          entry={child}
          depth={depth + 1}
          onSelect={onSelect}
          selectedPath={selectedPath}
          isTeam={isTeam}
        />
      ))}
    </div>
  );
}

// Only show these knowledge folders and files — not app source code
const KNOWLEDGE_ITEMS = new Set([
  'keel.md', 'tasks.md', 'projects', 'daily-log',
]);

const TEAM_KNOWLEDGE_ITEMS = new Set([
  'team.md', 'projects', 'updates',
]);

export default function KnowledgeBrowser({ onBack }: Props) {
  const [rootEntries, setRootEntries] = useState<FileEntry[]>([]);
  const [teamEntries, setTeamEntries] = useState<FileEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [isTeamFile, setIsTeamFile] = useState(false);
  const [content, setContent] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    window.keel.listFiles('').then((entries) => {
      setRootEntries(entries.filter((e) => KNOWLEDGE_ITEMS.has(e.name)));
    }).catch(() => {});
    // Load team files if team brain is configured
    window.keel.listTeamFiles('').then((entries) => {
      setTeamEntries(entries.filter((e) => TEAM_KNOWLEDGE_ITEMS.has(e.name)));
    }).catch(() => {});
  }, []);

  const loadFile = async (filePath: string, team = false) => {
    // Save current file before switching
    if (selectedPath && content) {
      const saveFn = isTeamFile ? window.keel.writeTeamFile : window.keel.writeFile;
      await saveFn(selectedPath, content).catch(() => {});
    }
    try {
      const readFn = team ? window.keel.readTeamFile : window.keel.readFile;
      const text = await readFn(filePath);
      setSelectedPath(filePath);
      setIsTeamFile(team);
      setContent(text);
      setSaveStatus('idle');
    } catch {
      setContent('Failed to load file.');
    }
  };

  const autoSave = useCallback((newContent: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus('idle');
    saveTimerRef.current = setTimeout(async () => {
      if (!selectedPath) return;
      setSaveStatus('saving');
      try {
        const saveFn = isTeamFile ? window.keel.writeTeamFile : window.keel.writeFile;
        await saveFn(selectedPath, newContent);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 1500);
      } catch {
        setSaveStatus('idle');
      }
    }, 800);
  }, [selectedPath, isTeamFile]);

  const handleChange = (newContent: string) => {
    setContent(newContent);
    autoSave(newContent);
  };

  // Toggle a checkbox in the markdown content
  const toggleCheckbox = (lineIndex: number) => {
    const lines = content.split('\n');
    const line = lines[lineIndex];
    if (/- \[ \]/.test(line)) {
      lines[lineIndex] = line.replace('- [ ]', '- [x]');
    } else if (/- \[x\]/i.test(line)) {
      lines[lineIndex] = line.replace(/- \[x\]/i, '- [ ]');
    }
    const newContent = lines.join('\n');
    setContent(newContent);
    autoSave(newContent);
  };

  // Render content as editable lines with interactive checkboxes for task files
  const isTaskFile = selectedPath.endsWith('tasks.md');

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
        <span style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>Knowledge Browser</span>
      </div>

      {/* Two-panel layout */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* File tree */}
        <div style={{
          width: 220, borderRight: '1px solid rgba(255,255,255,0.06)',
          overflowY: 'auto', padding: '8px 4px', flexShrink: 0,
        }}>
          {rootEntries.map((entry) => (
            <FolderItem
              key={entry.path}
              entry={entry}
              depth={0}
              onSelect={loadFile}
              selectedPath={!isTeamFile ? selectedPath : ''}
            />
          ))}
          {rootEntries.length === 0 && (
            <div style={{ padding: 16, color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center' }}>
              No files found
            </div>
          )}
          {teamEntries.length > 0 && (
            <>
              <div style={{
                padding: '12px 8px 4px', fontSize: 10, fontWeight: 700,
                color: 'rgba(207,122,92,0.7)', textTransform: 'uppercase',
                letterSpacing: '0.08em', borderTop: '1px solid rgba(255,255,255,0.06)',
                marginTop: 8,
              }}>
                Team Brain
              </div>
              {teamEntries.map((entry) => (
                <FolderItem
                  key={`team-${entry.path}`}
                  entry={entry}
                  depth={0}
                  onSelect={loadFile}
                  selectedPath={isTeamFile ? selectedPath : ''}
                  isTeam
                />
              ))}
            </>
          )}
        </div>

        {/* File editor */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!selectedPath ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📂</div>
                <div style={{ fontSize: 14 }}>Select a file to edit</div>
              </div>
            </div>
          ) : (
            <>
              {/* File header */}
              <div style={{
                padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexShrink: 0,
              }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>
                  {isTeamFile && <span style={{ color: '#CF7A5C', marginRight: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em' }}>TEAM</span>}
                  {selectedPath}
                </span>
                <span style={{
                  fontSize: 11, color: saveStatus === 'saved' ? '#4ade80' : 'rgba(255,255,255,0.25)',
                  transition: 'color 0.3s',
                }}>
                  {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : ''}
                </span>
              </div>

              {/* Checkbox view for task files */}
              {isTaskFile ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  {/* Interactive checkbox list */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
                    {content.split('\n').map((line, i) => {
                      const unchecked = /^(\s*)- \[ \] (.*)/.exec(line);
                      const checked = /^(\s*)- \[x\] (.*)/i.exec(line);
                      const heading = /^(#{1,3})\s+(.*)/.exec(line);

                      if (heading) {
                        const level = heading[1].length;
                        return (
                          <div key={i} style={{
                            fontSize: level === 1 ? 18 : level === 2 ? 15 : 13,
                            fontWeight: 600,
                            color: 'rgba(255,255,255,0.85)',
                            marginTop: level === 1 ? 8 : 16,
                            marginBottom: 8,
                          }}>
                            {heading[2]}
                          </div>
                        );
                      }

                      if (unchecked || checked) {
                        const isChecked = !!checked;
                        const text = isChecked ? checked![2] : unchecked![2];
                        return (
                          <label key={i} style={{
                            display: 'flex', alignItems: 'flex-start', gap: 10,
                            padding: '6px 4px', cursor: 'pointer',
                            borderRadius: 6, transition: 'background 0.1s',
                          }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleCheckbox(i)}
                              style={{
                                accentColor: '#CF7A5C', width: 16, height: 16,
                                marginTop: 2, cursor: 'pointer', flexShrink: 0,
                              }}
                            />
                            <span style={{
                              fontSize: 14, lineHeight: 1.5,
                              color: isChecked ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.85)',
                              textDecoration: isChecked ? 'line-through' : 'none',
                            }}>
                              {text}
                            </span>
                          </label>
                        );
                      }

                      if (!line.trim()) return <div key={i} style={{ height: 8 }} />;

                      return (
                        <div key={i} style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', padding: '2px 4px', lineHeight: 1.5 }}>
                          {line}
                        </div>
                      );
                    })}
                  </div>
                  {/* Raw editor below */}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                    <textarea
                      value={content}
                      onChange={(e) => handleChange(e.target.value)}
                      style={{
                        width: '100%', height: 150, padding: '12px 20px', background: '#161616',
                        color: 'rgba(255,255,255,0.7)', border: 'none', outline: 'none',
                        fontSize: 12, lineHeight: 1.6, resize: 'vertical',
                        fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
                        boxSizing: 'border-box',
                      }}
                      placeholder="Edit markdown here..."
                    />
                  </div>
                </div>
              ) : (
                /* Plain text editor for non-task files */
                <textarea
                  value={content}
                  onChange={(e) => handleChange(e.target.value)}
                  style={{
                    flex: 1, padding: '16px 20px', background: '#1a1a1a',
                    color: 'rgba(255,255,255,0.9)', border: 'none', outline: 'none',
                    fontSize: 13, lineHeight: 1.6, resize: 'none',
                    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
                  }}
                  placeholder="Start typing..."
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
