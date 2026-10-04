import type { ReactNode } from 'react'

/**
 * Notice — a message pinned above the canvas. Dismissible when given
 * `onDismiss`; persistent otherwise, for a state the user must not lose sight
 * of. Covers only its own box, so the canvas around it stays drawable.
 */
interface NoticeProps {
  message: string
  /** `error` when the drawing is not being kept; `warning` for anything else. */
  tone?: 'warning' | 'error'
  onDismiss?: () => void
}

export function Notice({ message, tone = 'warning', onDismiss }: NoticeProps) {
  return (
    <div
      style={{
        ...styles.notice,
        borderLeft: `3px solid ${TONE_COLORS[tone]}`,
        // Without a dismiss button the text runs to the edge, so pad it evenly.
        paddingRight: onDismiss ? 10 : 16,
      }}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <span>{message}</span>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          title="Dismiss"
          onClick={onDismiss}
          style={styles.dismiss}
        >
          ×
        </button>
      )}
    </div>
  )
}

interface NoticeStackProps {
  children: ReactNode
  /** Distance from the bottom of the viewport, raised to clear other chrome. */
  bottom?: number
}

/**
 * NoticeStack — pins notices to the bottom of the viewport, stacked so two at
 * once never overlap. The stack itself lets pointer events through, so only
 * the notices' own boxes are off-limits to drawing.
 */
export function NoticeStack({ children, bottom = 16 }: NoticeStackProps) {
  return <div style={{ ...styles.stack, bottom }}>{children}</div>
}

const TONE_COLORS = {
  warning: '#f59e0b',
  error: '#dc2626',
}

const styles = {
  stack: {
    position: 'fixed',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    width: 'max-content',
    maxWidth: 'calc(100vw - 32px)',
    zIndex: 10,
    pointerEvents: 'none',
  },
  notice: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    maxWidth: '100%',
    boxSizing: 'border-box',
    minHeight: 48,
    padding: '10px 16px',
    borderRadius: 12,
    background: 'rgba(255,255,255,0.9)',
    backdropFilter: 'blur(8px)',
    boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
    border: '1px solid rgba(0,0,0,0.06)',
    fontSize: 13,
    lineHeight: 1.4,
    color: '#3a3a3a',
    pointerEvents: 'auto',
  },
  dismiss: {
    appearance: 'none',
    flexShrink: 0,
    border: 'none',
    background: 'transparent',
    width: 28,
    height: 28,
    borderRadius: 8,
    fontSize: 18,
    lineHeight: 1,
    color: '#6b6b6b',
    cursor: 'pointer',
  },
} satisfies Record<string, React.CSSProperties>
