import type { Tool } from './useDrawTool'

/**
 * Toolbar — pure UI chrome: pick the active tool. Holds no scene state, just
 * reports the selected tool upward.
 */
const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'select', label: 'Select', hint: 'Select' },
  { id: 'rectangle', label: 'Rectangle', hint: 'Drag to draw a rectangle' },
  { id: 'ellipse', label: 'Ellipse', hint: 'Drag to draw an ellipse' },
  { id: 'freehand', label: 'Freehand', hint: 'Drag to draw freehand' },
]

interface ToolbarProps {
  tool: Tool
  onToolChange: (tool: Tool) => void
}

export function Toolbar({ tool, onToolChange }: ToolbarProps) {
  return (
    <div style={styles.bar} role="toolbar" aria-label="Drawing tools">
      {TOOLS.map((t) => {
        const active = t.id === tool
        return (
          <button
            key={t.id}
            type="button"
            title={t.hint}
            aria-pressed={active}
            onClick={() => onToolChange(t.id)}
            style={{ ...styles.button, ...(active ? styles.buttonActive : null) }}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

const styles = {
  bar: {
    position: 'fixed',
    top: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: 4,
    padding: 4,
    borderRadius: 12,
    background: 'rgba(255,255,255,0.9)',
    backdropFilter: 'blur(8px)',
    boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
    border: '1px solid rgba(0,0,0,0.06)',
    zIndex: 10,
    userSelect: 'none',
  },
  button: {
    appearance: 'none',
    border: 'none',
    background: 'transparent',
    padding: '8px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    color: '#3a3a3a',
    cursor: 'pointer',
  },
  buttonActive: {
    background: '#1e88e5',
    color: '#fff',
  },
} satisfies Record<string, React.CSSProperties>
