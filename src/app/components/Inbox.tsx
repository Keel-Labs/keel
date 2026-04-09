import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { TaskGroup, IncomingTask } from '../../shared/types';

// Drag data types
type DragPayload =
  | { type: 'incoming'; id: number }
  | { type: 'task'; filePath: string; text: string; completed: boolean };

// Module-level ref to pass drag payload (dataTransfer custom MIME unreliable in Electron)
let activeDragPayload: DragPayload | null = null;

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform 0.15s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" opacity="0.35" style={{ flexShrink: 0 }}>
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}

interface IncomingTaskRowProps {
  task: IncomingTask;
  onAccept: (id: number) => void;
  onDismiss: (id: number) => void;
}

function IncomingTaskRow({ task, onAccept, onDismiss }: IncomingTaskRowProps) {
  const handleDragStart = (e: React.DragEvent) => {
    activeDragPayload = { type: 'incoming', id: task.id };
    e.dataTransfer.setData('text/plain', task.text);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => { activeDragPayload = null; };

  return (
    <div
      className="inbox-task-row inbox-task-row--incoming"
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <GripIcon />
      <span className="inbox-task-row__text">{task.text}</span>
      {task.project && (
        <span className="inbox-task-row__project-badge">{task.project}</span>
      )}
      <div className="inbox-task-row__actions">
        <button
          className="inbox-task-row__action-btn inbox-task-row__action-btn--accept"
          onClick={() => onAccept(task.id)}
          title="Accept task"
        >
          <CheckIcon />
        </button>
        <button
          className="inbox-task-row__action-btn inbox-task-row__action-btn--dismiss"
          onClick={() => onDismiss(task.id)}
          title="Dismiss task"
        >
          <XIcon />
        </button>
      </div>
    </div>
  );
}

interface TaskRowProps {
  filePath: string;
  text: string;
  completed: boolean;
  onToggle: (filePath: string, text: string, completed: boolean) => void;
}

function TaskRow({ filePath, text, completed, onToggle }: TaskRowProps) {
  const handleDragStart = (e: React.DragEvent) => {
    activeDragPayload = { type: 'task', filePath, text, completed };
    e.dataTransfer.setData('text/plain', text);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => { activeDragPayload = null; };

  return (
    <div
      className={`inbox-task-row${completed ? ' inbox-task-row--completed' : ''}`}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <GripIcon />
      <label className="inbox-task-row__checkbox-label">
        <input
          type="checkbox"
          checked={completed}
          onChange={() => onToggle(filePath, text, !completed)}
          className="inbox-task-row__checkbox"
        />
        <span className="inbox-task-row__text">{text}</span>
      </label>
    </div>
  );
}

interface ProjectGroupProps {
  projectName: string;
  slug: string | null;
  tasks: Array<{ filePath: string; text: string; completed: boolean }>;
  onToggle: (filePath: string, text: string, completed: boolean) => void;
  onDrop?: (targetSlug: string | null) => void;
  onRename?: (slug: string, newName: string) => void;
  onDelete?: (slug: string) => void;
  defaultExpanded?: boolean;
  showActions?: boolean;
}

function ProjectGroup({
  projectName, slug, tasks, onToggle, onDrop, onRename, onDelete,
  defaultExpanded = true, showActions = false,
}: ProjectGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(projectName);
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    setDragOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragLeave = () => {
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragOver(false);
    if (onDrop) onDrop(slug);
  };

  const startEditing = () => {
    if (!slug) return; // Can't rename General
    setEditName(projectName);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitRename = () => {
    setEditing(false);
    const trimmed = editName.trim();
    if (trimmed && trimmed !== projectName && slug) {
      onRename?.(slug, trimmed);
    }
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditName(projectName);
  };

  return (
    <div
      className={`inbox-project-group${dragOver ? ' inbox-project-group--drag-over' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="inbox-project-group__header-row">
        {editing ? (
          <input
            ref={inputRef}
            className="inbox-project-group__rename-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') cancelEditing();
            }}
            autoFocus
          />
        ) : (
          <button
            className="inbox-project-group__header"
            onClick={() => setExpanded(!expanded)}
            onDoubleClick={(e) => { e.stopPropagation(); startEditing(); }}
          >
            <ChevronIcon expanded={expanded} />
            <span className="inbox-project-group__name">{projectName}</span>
            <span className="inbox-project-group__count">{tasks.length}</span>
          </button>
        )}
        {showActions && slug && !editing && (
          <div className="inbox-project-group__actions">
            <button
              className="inbox-project-group__action-btn inbox-project-group__action-btn--danger"
              onClick={() => onDelete?.(slug)}
              title="Delete project"
            >
              <TrashIcon />
            </button>
          </div>
        )}
      </div>
      {expanded && (
        <div className="inbox-project-group__tasks">
          {tasks.map((task, i) => (
            <TaskRow
              key={`${task.filePath}-${task.text}-${i}`}
              filePath={task.filePath}
              text={task.text}
              completed={task.completed}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Dialogs ──

function DeleteProjectDialog({
  projectName,
  onConfirm,
  onCancel,
}: {
  projectName: string;
  onConfirm: (moveTasks: boolean) => void;
  onCancel: () => void;
}) {
  return (
    <div className="inbox-dialog-backdrop" onClick={onCancel}>
      <div className="inbox-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="inbox-dialog__title">Delete "{projectName}"?</h3>
        <p className="inbox-dialog__text">What should happen to open tasks in this project?</p>
        <div className="inbox-dialog__actions">
          <button className="inbox-dialog__btn" onClick={() => onConfirm(true)}>
            Move to General
          </button>
          <button className="inbox-dialog__btn inbox-dialog__btn--danger" onClick={() => onConfirm(false)}>
            Delete all
          </button>
          <button className="inbox-dialog__btn inbox-dialog__btn--cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function AddProjectDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onConfirm(trimmed);
  };

  return (
    <div className="inbox-dialog-backdrop" onClick={onCancel}>
      <div className="inbox-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="inbox-dialog__title">New Project</h3>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className="inbox-dialog__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            autoFocus
          />
          <div className="inbox-dialog__actions">
            <button className="inbox-dialog__btn" type="submit" disabled={!name.trim()}>Create</button>
            <button className="inbox-dialog__btn inbox-dialog__btn--cancel" type="button" onClick={onCancel}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

type DropZone = 'open' | 'completed' | null;
type DialogState =
  | null
  | { type: 'add-project' }
  | { type: 'delete-project'; slug: string; projectName: string };

export default function Inbox() {
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
  const [incomingTasks, setIncomingTasks] = useState<IncomingTask[]>([]);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeDropZone, setActiveDropZone] = useState<DropZone>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const dragCounterRef = useRef<{ open: number; completed: number }>({ open: 0, completed: 0 });

  const fetchAll = useCallback(async () => {
    try {
      const [groups, incoming] = await Promise.all([
        window.keel.listTasks(),
        window.keel.listIncomingTasks(),
      ]);
      setTaskGroups(groups);
      setIncomingTasks(incoming);
    } catch (err) {
      console.error('[Inbox] Failed to fetch tasks:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const cleanup = window.keel.onMemoryUpdated(() => {
      fetchAll();
    });
    return cleanup;
  }, [fetchAll]);

  const handleToggle = useCallback(async (filePath: string, text: string, completed: boolean) => {
    await window.keel.toggleTask(filePath, text, completed);
    fetchAll();
  }, [fetchAll]);

  const handleAccept = useCallback(async (id: number) => {
    await window.keel.acceptIncomingTask(id);
    fetchAll();
  }, [fetchAll]);

  const handleDismiss = useCallback(async (id: number) => {
    await window.keel.dismissIncomingTask(id);
    fetchAll();
  }, [fetchAll]);

  // ── Cross-project drop ──

  const handleProjectDrop = useCallback(async (targetSlug: string | null) => {
    const payload = activeDragPayload;
    activeDragPayload = null;
    if (!payload) return;

    const targetFile = targetSlug ? `projects/${targetSlug}/tasks.md` : 'tasks.md';

    if (payload.type === 'incoming') {
      await window.keel.acceptIncomingTask(payload.id);
      fetchAll();
    } else if (payload.type === 'task') {
      // Only move if going to a different file
      if (payload.filePath !== targetFile) {
        await window.keel.moveTask(payload.filePath, targetFile, payload.text, payload.completed);
        fetchAll();
      }
    }
  }, [fetchAll]);

  // ── Section-level drop handlers ──

  const makeDropHandlers = useCallback((zone: 'open' | 'completed') => {
    return {
      onDragEnter: (e: React.DragEvent) => {
        e.preventDefault();
        dragCounterRef.current[zone]++;
        setActiveDropZone(zone);
      },
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      },
      onDragLeave: () => {
        dragCounterRef.current[zone]--;
        if (dragCounterRef.current[zone] <= 0) {
          dragCounterRef.current[zone] = 0;
          setActiveDropZone((prev) => (prev === zone ? null : prev));
        }
      },
      onDrop: async (e: React.DragEvent) => {
        e.preventDefault();
        dragCounterRef.current[zone] = 0;
        setActiveDropZone(null);

        const payload = activeDragPayload;
        activeDragPayload = null;
        if (!payload) return;

        if (payload.type === 'incoming' && zone === 'open') {
          await window.keel.acceptIncomingTask(payload.id);
          fetchAll();
        } else if (payload.type === 'task') {
          if (zone === 'completed' && !payload.completed) {
            await window.keel.toggleTask(payload.filePath, payload.text, true);
            fetchAll();
          } else if (zone === 'open' && payload.completed) {
            await window.keel.toggleTask(payload.filePath, payload.text, false);
            fetchAll();
          }
        }
      },
    };
  }, [fetchAll]);

  const openDropHandlers = makeDropHandlers('open');
  const completedDropHandlers = makeDropHandlers('completed');

  // ── Project management ──

  const handleAddProject = useCallback(async (name: string) => {
    setDialog(null);
    await window.keel.createProject(name);
    fetchAll();
  }, [fetchAll]);

  const handleRenameProject = useCallback(async (slug: string, newName: string) => {
    await window.keel.renameProject(slug, newName);
    fetchAll();
  }, [fetchAll]);

  const handleDeleteProject = useCallback(async (slug: string, moveTasks: boolean) => {
    setDialog(null);
    await window.keel.deleteProject(slug, moveTasks);
    fetchAll();
  }, [fetchAll]);

  // Separate open and completed tasks
  const openGroups = taskGroups
    .map((g) => ({ ...g, tasks: g.tasks.filter((t) => !t.completed) }))
    .filter((g) => g.tasks.length > 0);

  const completedTasks = taskGroups.flatMap((g) =>
    g.tasks.filter((t) => t.completed),
  );

  const totalCompleted = completedTasks.length;
  const totalOpen = openGroups.reduce((sum, g) => sum + g.tasks.length, 0);

  if (loading) {
    return (
      <div className="inbox-pane">
        <div className="inbox-pane__loading">Loading tasks...</div>
      </div>
    );
  }

  const isEmpty = incomingTasks.length === 0 && totalOpen === 0 && totalCompleted === 0;

  return (
    <div className="inbox-pane">
      <div className="inbox-pane__header">
        <h1 className="inbox-pane__title">Tasks</h1>
        <div className="inbox-pane__header-right">
          {!isEmpty && (
            <span className="inbox-pane__summary">{totalOpen} open</span>
          )}
          <button
            className="inbox-pane__add-btn"
            onClick={() => setDialog({ type: 'add-project' })}
            title="New project"
          >
            <PlusIcon />
          </button>
        </div>
      </div>

      <div className="inbox-pane__scroll">
        {isEmpty && (
          <div className="inbox-pane__empty">
            <div className="inbox-pane__empty-icon">&#10003;</div>
            <p className="inbox-pane__empty-text">No tasks yet. Tasks extracted from conversations will appear here.</p>
          </div>
        )}

        {/* Incoming Section */}
        {incomingTasks.length > 0 && (
          <div className="inbox-section">
            <div className="inbox-section__header">
              <span className="inbox-section__label">Incoming</span>
              <span className="inbox-section__count">{incomingTasks.length}</span>
            </div>
            <div className="inbox-section__body">
              {incomingTasks.map((task) => (
                <IncomingTaskRow
                  key={task.id}
                  task={task}
                  onAccept={handleAccept}
                  onDismiss={handleDismiss}
                />
              ))}
            </div>
          </div>
        )}

        {/* Open Section — drop zone */}
        <div
          className={`inbox-section inbox-section--droppable${activeDropZone === 'open' ? ' inbox-section--drag-over' : ''}`}
          {...openDropHandlers}
        >
          <div className="inbox-section__header">
            <span className="inbox-section__label">Open</span>
          </div>
          <div className="inbox-section__body">
            {openGroups.length > 0 ? (
              openGroups.map((group) => (
                <ProjectGroup
                  key={group.slug ?? 'general'}
                  projectName={group.project}
                  slug={group.slug}
                  tasks={group.tasks}
                  onToggle={handleToggle}
                  onDrop={handleProjectDrop}
                  onRename={handleRenameProject}
                  onDelete={(s) => setDialog({ type: 'delete-project', slug: s, projectName: group.project })}
                  showActions
                />
              ))
            ) : (
              !isEmpty && (
                <div className="inbox-section__drop-hint">
                  Drag tasks here to mark as open
                </div>
              )
            )}
          </div>
        </div>

        {/* Completed Section — drop zone */}
        <div
          className={`inbox-section inbox-section--completed inbox-section--droppable${activeDropZone === 'completed' ? ' inbox-section--drag-over' : ''}`}
          {...completedDropHandlers}
        >
          <button
            className="inbox-section__header inbox-section__header--toggle"
            onClick={() => setCompletedExpanded(!completedExpanded)}
          >
            <ChevronIcon expanded={completedExpanded} />
            <span className="inbox-section__label">Completed</span>
            <span className="inbox-section__count">{totalCompleted}</span>
          </button>
          {(completedExpanded || activeDropZone === 'completed') && (
            <div className="inbox-section__body">
              {completedTasks.length > 0 ? (
                completedTasks.map((task, i) => (
                  <TaskRow
                    key={`${task.filePath}-${task.text}-${i}`}
                    filePath={task.filePath}
                    text={task.text}
                    completed={task.completed}
                    onToggle={handleToggle}
                  />
                ))
              ) : (
                <div className="inbox-section__drop-hint">
                  Drag tasks here to mark as done
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      {dialog?.type === 'add-project' && (
        <AddProjectDialog
          onConfirm={handleAddProject}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'delete-project' && (
        <DeleteProjectDialog
          projectName={dialog.projectName}
          onConfirm={(moveTasks) => handleDeleteProject(dialog.slug, moveTasks)}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}
