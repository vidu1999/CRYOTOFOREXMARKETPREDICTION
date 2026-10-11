import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Bitcoin, Minus, X } from 'lucide-react';
import type { Asset, Direction } from '../lib/types';

export function AssetIcon({ asset, small = false }: { asset: Asset; small?: boolean }) {
  const size = small ? 17 : 23;
  const icon =
    asset.id === 'btc' ? (
      <Bitcoin size={size} strokeWidth={1.7} />
    ) : asset.id === 'eth' ? (
      <svg width={size} height={size} viewBox="0 0 24 24">
        <path d="M12 1L5 12l7 4 7-4z" fill="currentColor" opacity=".9" />
        <path d="M12 1v15l7-4z" fill="currentColor" opacity=".4" />
        <path d="M5 14l7 9 7-9-7 4z" fill="currentColor" opacity=".7" />
      </svg>
    ) : asset.id === 'sol' ? (
      <svg width={size} height={size} viewBox="0 0 24 24">
        <path d="M6 4h15l-3 4H3zM3 10h15l3 4H6zM6 16h15l-3 4H3z" fill="currentColor" />
      </svg>
    ) : asset.id === 'bnb' ? (
      <svg width={size} height={size} viewBox="0 0 24 24">
        <path
          d="M12 1l5 5-3 3-2-2-2 2-3-3zM1 12l4-4 4 4-4 4zM23 12l-4-4-4 4 4 4zM12 23l5-5-3-3-2 2-2-2-3 3zM12 9l3 3-3 3-3-3z"
          fill="currentColor"
        />
      </svg>
    ) : asset.id === 'imported' ? (
      <ArrowUpRight size={size} />
    ) : (
      asset.mark
    );
  return (
    <span
      className={`asset-icon ${small ? 'small' : ''} ${asset.category.toLowerCase()}`}
      style={{
        color: asset.color,
        backgroundColor: `${asset.color}14`,
        borderColor: `${asset.color}24`,
      }}
      aria-hidden="true"
    >
      {icon}
    </span>
  );
}

export function DirectionBadge({
  direction,
  compact = false,
}: {
  direction: Direction;
  compact?: boolean;
}) {
  const Icon =
    direction === 'bullish' ? ArrowUpRight : direction === 'bearish' ? ArrowDownRight : Minus;
  return (
    <span className={`direction-badge ${direction} ${compact ? 'compact' : ''}`}>
      <Icon size={13} />
      {direction === 'bullish' ? 'Bullish' : direction === 'bearish' ? 'Bearish' : 'Neutral'}
    </span>
  );
}

export function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">
          <span />
          {eyebrow}
        </div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
      <ArrowRight size={14} />
    </button>
  );
}

export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const root = dialog.current;
    const focusable = () =>
      Array.from(
        root?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea, [tabindex="0"]',
        ) ?? [],
      );
    focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab') {
        const elements = focusable();
        if (!elements.length) {
          event.preventDefault();
          return;
        }
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first || !root?.contains(document.activeElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener('keydown', keydown);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  detail,
  tone = '',
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  tone?: string;
}) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <strong className={tone}>{value}</strong>
      {detail && <span className="stat-detail">{detail}</span>}
    </div>
  );
}
