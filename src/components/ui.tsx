import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import { classNames } from '@/lib/utils';
import { STATUS_CONFIG } from '@/lib/status';
import { useI18n } from '@/lib/i18n';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const sizeClass = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className={classNames('relative w-full rounded-2xl bg-white shadow-2xl', sizeClass)}>
        {title && (
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <X size={20} />
            </button>
          </div>
        )}
        <div className="max-h-[80vh] overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

interface BadgeProps {
  status: string;
  label?: string;
}

export function StatusBadge({ status, label }: BadgeProps) {
  const { t } = useI18n();
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.idea;
  return (
    <span className={classNames('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', config.bg, config.color)}>
      <span className={classNames('h-1.5 w-1.5 rounded-full', config.dot)} />
      {label ?? t(config.labelKey)}
    </span>
  );
}

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}

export function Button({ children, onClick, variant = 'primary', size = 'md', className, disabled, type = 'button' }: ButtonProps) {
  const variants = {
    primary: 'bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-300',
    secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 disabled:opacity-50',
    ghost: 'text-slate-600 hover:bg-slate-100 disabled:opacity-50',
    danger: 'bg-red-600 text-white hover:bg-red-500 disabled:bg-red-300',
  };
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-sm' };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={classNames(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </button>
  );
}

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return <div className={classNames('rounded-xl border border-slate-200 bg-white', className)}>{children}</div>;
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}

export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={classNames(
          'relative h-6 w-11 rounded-full transition-colors',
          checked ? 'bg-emerald-500' : 'bg-slate-300'
        )}
      >
        <span
          className={classNames(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5'
          )}
        />
      </button>
      {label && <span className="text-sm text-slate-700">{label}</span>}
    </label>
  );
}

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">{icon}</div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
