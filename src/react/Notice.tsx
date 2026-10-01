/**
 * Notice — a dismissible message pinned to the bottom of the viewport. Covers
 * only its own box, so the canvas around it stays drawable.
 */
interface NoticeProps {
  message: string
  onDismiss: () => void
}

export function Notice({ message, onDismiss }: NoticeProps) {
  return (
    <div style={styles.notice} role="status">
      <span>{message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        title="Dismiss"
        onClick={onDismiss}
        style={styles.dismiss}
      >
        ×
      </button>
    </div>
  )
}

const styles = {
  notice: {
    position: 'fixed',
    bottom: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    maxWidth: 'calc(100vw - 32px)',
    boxSizing: 'border-box',
    padding: '10px 10px 10px 16px',
    borderRadius: 12,
    background: 'rgba(255,255,255,0.9)',
    backdropFilter: 'blur(8px)',
    boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
    border: '1px solid rgba(0,0,0,0.06)',
    borderLeft: '3px solid #f59e0b',
    zIndex: 10,
    fontSize: 13,
    lineHeight: 1.4,
    color: '#3a3a3a',
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
