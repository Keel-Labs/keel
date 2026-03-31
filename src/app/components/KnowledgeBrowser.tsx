import React, { useState, useEffect, useMemo } from 'react';
import { marked } from 'marked';
import type { FileEntry } from '../../shared/types';

interface Props {
  onBack: () => void;
}

function FolderItem({ entry, depth, onSelect, selectedPath }: {
  entry: FileEntry; depth: number; onSelect: (path: string) => void; selectedPath: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileEntry[]>([]);

  const toggle = () => {
    if (!expanded && children.length === 0) {
      window.keel.listFiles(entry.path).then(setChildren).catch(() => {});
    }
    setExpanded(!expanded);
  };

  if (!entry.isDirectory) {
    const isActive = entry.path === selectedPath;
    return (
      <button
        onClick={() => onSelect(entry.path)}
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
        />
      ))}
    </div>
  );
}

export default function KnowledgeBrowser({ onBack }: Props) {
  const [rootEntries, setRootEntries] = useState<FileEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [content, setContent] = useState('');
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.keel.listFiles('').then(setRootEntries).catch(() => {});
  }, []);

  const loadFile = async (filePath: string) => {
    try {
      const text = await window.keel.readFile(filePath);
      setSelectedPath(filePath);
      setContent(text);
      setEditing(false);
    } catch {
      setContent('Failed to load file.');
    }
  };

  const startEdit = () => {
    setEditContent(content);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const saveFile = async () => {
    setSaving(true);
    try {
      await window.keel.writeFile(selectedPath, editContent);
      setContent(editContent);
      setEditing(false);
    } catch {
      // silently fail
    }
    setSaving(false);
  };

  const renderedMarkdown = useMemo(() => {
    if (!content || editing) return '';
    return marked.parse(content) as string;
  }, [content, editing]);

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
              selectedPath={selectedPath}
            />
          ))}
          {rootEntries.length === 0 && (
            <div style={{ padding: 16, color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center' }}>
              No files found
            </div>
          )}
        </div>

        {/* File viewer/editor */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!selectedPath ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📂</div>
                <div style={{ fontSize: 14 }}>Select a file to view</div>
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
                  {selectedPath}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {!editing ? (
                    <button
                      onClick={startEdit}
                      style={{
                        padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)',
                        background: 'transparent', color: 'rgba(255,255,255,0.7)',
                        fontSize: 12, cursor: 'pointer',
                      }}
                    >
                      Edit
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={cancelEdit}
                        style={{
                          padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)',
                          background: 'transparent', color: 'rgba(255,255,255,0.5)',
                          fontSize: 12, cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveFile}
                        disabled={saving}
                        style={{
                          padding: '5px 12px', borderRadius: 6, border: 'none',
                          background: '#CF7A5C', color: 'white',
                          fontSize: 12, cursor: saving ? 'default' : 'pointer',
                          opacity: saving ? 0.6 : 1,
                        }}
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Content */}
              {editing ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  style={{
                    flex: 1, padding: '16px 20px', background: '#1a1a1a',
                    color: 'rgba(255,255,255,0.9)', border: 'none', outline: 'none',
                    fontSize: 13, lineHeight: 1.6, resize: 'none',
                    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
                  }}
                />
              ) : (
                <div
                  className="markdown-body"
                  style={{
                    flex: 1, overflowY: 'auto', padding: '16px 24px',
                    fontSize: 14, lineHeight: 1.6, color: 'rgba(255,255,255,0.85)',
                  }}
                  dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
