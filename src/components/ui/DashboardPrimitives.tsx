import React, { useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
  warning: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
  danger: 'border-red-400/20 bg-red-400/10 text-red-300',
  neutral: 'border-slate-400/20 bg-slate-400/10 text-slate-300',
};

export const StatusPill: React.FC<{
  label: string;
  tone: StatusTone;
}> = ({ label, tone }) => (
  <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${TONE_CLASSES[tone]}`}>
    <span className="app-status-dot" aria-hidden="true" />
    {label}
  </span>
);

export const MetricCard: React.FC<{
  label: string;
  value: string | number;
  detail: string;
  icon: LucideIcon;
  tone?: StatusTone;
}> = ({ label, value, detail, icon: Icon, tone = 'neutral' }) => {
  const iconTone = {
    success: 'text-emerald-300 bg-emerald-400/10',
    warning: 'text-amber-200 bg-amber-400/10',
    danger: 'text-red-300 bg-red-400/10',
    neutral: 'text-violet-200 bg-violet-400/10',
  }[tone];

  return (
    <article className="app-panel min-w-0 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-300">{label}</p>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${iconTone}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-5 font-mono-tabular text-3xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">{detail}</p>
    </article>
  );
};

export const PageHeading: React.FC<{
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}> = ({ eyebrow, title, description, actions }) => (
  <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      {eyebrow && (
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">
          {eyebrow}
        </p>
      )}
      <h1 className="font-display text-2xl font-semibold tracking-wide text-white sm:text-3xl">{title}</h1>
      {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

export const EmptyState: React.FC<{ title: string; description: string }> = ({ title, description }) => (
  <div className="rounded-xl border border-dashed border-slate-700/80 px-5 py-10 text-center">
    <p className="font-medium text-slate-200">{title}</p>
    <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-400">{description}</p>
  </div>
);

export const ConfirmationDialog: React.FC<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ open, title, description, confirmLabel, cancelLabel, danger = false, onConfirm, onCancel }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="app-confirm-dialog"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="app-panel w-[min(100%,32rem)] p-6">
        <h2 id="confirm-dialog-title" className="font-display text-lg font-semibold text-white">{title}</h2>
        <p id="confirm-dialog-description" className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
        <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row">
          <button type="button" className="ss-button-secondary" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={`ss-button-primary ${danger ? 'app-button-danger' : ''}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </dialog>
  );
};
