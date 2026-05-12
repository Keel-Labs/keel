import React from 'react';

interface Props {
  projectName: string;
  onConfirm: (moveTasks: boolean) => void;
  onCancel: () => void;
}

export default function DeleteProjectDialog({ projectName, onConfirm, onCancel }: Props) {
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
