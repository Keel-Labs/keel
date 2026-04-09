import React from 'react';

type DesktopMode = 'chat' | 'wiki' | 'home';

interface Props {
  activeMode: DesktopMode;
  canGoBack: boolean;
  canGoForward: boolean;
  isSidebarCollapsed: boolean;
  isContextOpen: boolean;
  sidebarWidth: number;
  onGoBack: () => void;
  onGoForward: () => void;
  onSetMode: (mode: DesktopMode) => void;
  onToggleSidebar: () => void;
  onToggleContext: () => void;
}

function ChromeButton({
  children,
  disabled,
  onClick,
  title,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      aria-label={title}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="desktop-topbar__control"
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        border: '1px solid var(--panel-border)',
        background: disabled ? 'transparent' : 'var(--surface-muted)',
        color: disabled ? 'var(--text-disabled)' : 'var(--text-tertiary)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'var(--transition-base)',
      }}
    >
      {children}
    </button>
  );
}

function SidebarIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      {collapsed ? (
        <path d="M10 4v16" />
      ) : (
        <>
          <path d="M9 4v16" />
          <path d="M6 9l-2 3 2 3" />
        </>
      )}
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function PanelIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
      {!open && <path d="m11 9 3 3-3 3" />}
    </svg>
  );
}

const MODES: Array<{ id: DesktopMode; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'chat', label: 'Chat' },
  { id: 'wiki', label: 'Wiki' },
];

export default function DesktopTopBar({
  activeMode,
  canGoBack,
  canGoForward,
  isSidebarCollapsed,
  isContextOpen,
  sidebarWidth,
  onGoBack,
  onGoForward,
  onSetMode,
  onToggleSidebar,
  onToggleContext,
}: Props) {
  return (
    <div className="desktop-topbar" style={{ '--sidebar-offset': `${sidebarWidth}px` } as React.CSSProperties}>
      <div className="desktop-topbar__leading">
        <ChromeButton
          title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={onToggleSidebar}
        >
          <SidebarIcon collapsed={isSidebarCollapsed} />
        </ChromeButton>
        <ChromeButton title="Back" onClick={onGoBack} disabled={!canGoBack}>
          <ArrowLeftIcon />
        </ChromeButton>
        <ChromeButton title="Forward" onClick={onGoForward} disabled={!canGoForward}>
          <ArrowRightIcon />
        </ChromeButton>
      </div>

      <div className="mode-switcher" role="tablist" aria-label="Workspace mode">
        {MODES.map((mode) => {
          const active = activeMode === mode.id;
          return (
            <button
              key={mode.id}
              role="tab"
              aria-selected={active}
              onClick={() => onSetMode(mode.id)}
              className={active ? 'mode-switcher__button is-active' : 'mode-switcher__button'}
            >
              {mode.label}
            </button>
          );
        })}
      </div>

      <div className="desktop-topbar__trailing">
        {activeMode === 'wiki' && (
          <ChromeButton
            title={isContextOpen ? 'Hide page context' : 'Show page context'}
            onClick={onToggleContext}
          >
            <PanelIcon open={isContextOpen} />
          </ChromeButton>
        )}
      </div>
    </div>
  );
}
