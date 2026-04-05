import React from 'react';

interface Action {
  label: string;
  onClick?: () => void;
}

interface Props {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: Action[];
  secondary?: React.ReactNode;
}

export default function PlaceholderPane({
  eyebrow,
  title,
  description,
  actions = [],
  secondary,
}: Props) {
  return (
    <div className="workspace-pane">
      <div className="workspace-pane__inner">
        {eyebrow && <div className="workspace-pane__eyebrow">{eyebrow}</div>}
        <h1 className="workspace-pane__title">{title}</h1>
        <p className="workspace-pane__description">{description}</p>

        {actions.length > 0 && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 24 }}>
            {actions.map((action) => (
              <button
                key={action.label}
                onClick={action.onClick}
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid var(--panel-border)',
                  background: action.onClick ? 'var(--accent-bg)' : 'var(--surface-panel)',
                  color: action.onClick ? 'var(--accent-link)' : 'var(--text-secondary)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  cursor: action.onClick ? 'pointer' : 'default',
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}

        {secondary && <div style={{ marginTop: 28 }}>{secondary}</div>}
      </div>
    </div>
  );
}
