import React from 'react';
import { AlertTriangle } from 'lucide-react';

const ConfirmModal = ({ open, title, message, onConfirm, onCancel, confirmLabel = 'Delete' }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-3 backdrop-blur-[1px] dark:bg-black/60 sm:p-4">
      <div className="my-auto max-h-[90vh] w-[95%] max-w-sm overflow-y-auto rounded-2xl border border-line bg-surface p-4 shadow-xl sm:p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-red-50 text-red-600 rounded-full dark:bg-red-950 dark:text-red-400">
            <AlertTriangle size={20} />
          </div>
          <h3 className="text-lg font-semibold text-ink">{title}</h3>
        </div>
        <p className="text-sm text-ink-soft mb-6">{message}</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button
            onClick={onCancel}
            className="w-full rounded-lg border border-line-strong px-4 py-2 text-sm text-ink-soft hover:bg-subtle hover:text-ink sm:w-auto"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 sm:w-auto"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
