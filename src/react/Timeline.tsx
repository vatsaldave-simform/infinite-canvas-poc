import { useEffect, useRef, useSyncExternalStore, type RefObject } from 'react'
import type { SceneStore } from '@core/scene'
import type { EditorStore } from '@core/editor'
import type { History, Replay } from '@core/history'
import { selectEntryElement } from './historySelection'

interface TimelineProps {
  history: History
  replay: Replay
  store: SceneStore
  editorStore: EditorStore
  /** Whether a pointer is pressed on the canvas; the bar ignores input then. */
  canvasPressRef: RefObject<boolean>
}

/** Past this many entries, the marks merge into one continuous track. */
const MAX_SEPARATE_MARKS = 100

const BAR_BOTTOM = 16
const BAR_HEIGHT = 48

/** How far up the notices sit while the bar is open, so it never covers them. */
export const ABOVE_TIMELINE = BAR_BOTTOM + BAR_HEIGHT + 8

const ACCENT = '#1e88e5'

/**
 * Timeline — the editor's view of history: one mark per entry, a ring for the
 * document as loaded, and a thumb at the present. Pressing or dragging on it
 * scrubs, which is real undo and redo through history, so the document
 * changes as the thumb moves. Marks in the future are dimmed: a new change
 * throws them away.
 *
 * The play button, or Space while the bar is open, replays history from the
 * present: the document rebuilds itself one entry at a time. Scrubbing pauses
 * a replay.
 */
export function Timeline({ history, replay, store, editorStore, canvasPressRef }: TimelineProps) {
  const present = useSyncExternalStore(history.subscribe, history.getPresent)
  const count = useSyncExternalStore(history.subscribe, history.getCount)
  const playing = useSyncExternalStore(replay.subscribe, replay.isPlaying)

  const railRef = useRef<HTMLDivElement>(null)
  // The pointer scrubbing right now, or null between scrubs.
  const scrubPointerRef = useRef<number | null>(null)

  // How far along the rail point `n` of history sits, from 0 to 1.
  const alongRail = (n: number) => (count === 0 ? 0 : n / count)

  const scrubTo = (target: number) => {
    // The bar takes no input while the canvas is pressed.
    if (canvasPressRef.current) return

    // A scrub takes over from a replay.
    replay.pause()
    const entry = history.goTo(target)
    // A scrub that applied nothing leaves the selection alone.
    if (entry) selectEntryElement(entry, store, editorStore)
  }

  // The point of history nearest the pointer. A pointer past either end is
  // fine: goTo stops at the end of history.
  const targetAt = (clientX: number) => {
    const rail = railRef.current
    if (!rail) return present

    const rect = rail.getBoundingClientRect()
    const along = (clientX - rect.left) / rect.width
    return Math.round(along * count)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    if (canvasPressRef.current) return

    // Keep getting moves even when the pointer leaves the bar.
    e.currentTarget.setPointerCapture(e.pointerId)
    scrubPointerRef.current = e.pointerId
    scrubTo(targetAt(e.clientX))
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (scrubPointerRef.current !== e.pointerId) return
    scrubTo(targetAt(e.clientX))
  }

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (scrubPointerRef.current === e.pointerId) scrubPointerRef.current = null
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = getKeyTarget(e.key, present, count)
    if (target === null) return

    e.preventDefault()
    scrubTo(target)
  }

  // Space plays and pauses. The bar is only mounted while it is open, so
  // Space does nothing while it is closed.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isSpace(e)) return
      // Stop the page scrolling, and a focused button clicking as well.
      e.preventDefault()
      // Holding Space would flicker between play and pause.
      if (e.repeat) return

      togglePlay(replay, canvasPressRef)
    }

    // Some browsers click a focused button when Space comes back up.
    const onKeyUp = (e: KeyboardEvent) => {
      if (isSpace(e)) e.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [replay, canvasPressRef])

  const hasFuture = present < count
  const dense = count > MAX_SEPARATE_MARKS
  const presentAlongRail = alongRail(present)

  return (
    <div style={styles.bar}>
      <button
        type="button"
        aria-label={playing ? 'Pause' : 'Play'}
        title={playing ? 'Pause (Space)' : 'Play (Space)'}
        disabled={!hasFuture}
        onClick={() => togglePlay(replay, canvasPressRef)}
        style={{ ...styles.playButton, ...(hasFuture ? null : styles.playButtonDisabled) }}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div
        role="slider"
        tabIndex={0}
        aria-label="History"
        aria-valuemin={0}
        aria-valuemax={count}
        aria-valuenow={present}
        aria-valuetext={describePresent(present, count)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
        style={styles.scrubArea}
      >
        <div ref={railRef} style={styles.rail}>
          <div
            style={{
              ...styles.line,
              ...(dense ? styles.lineDense : null),
              left: 0,
              width: toPercent(presentAlongRail),
            }}
          />
          {present < count && (
            <div
              style={{
                ...styles.line,
                ...(dense ? styles.lineDense : null),
                ...styles.future,
                left: toPercent(presentAlongRail),
                right: 0,
              }}
            />
          )}

          {!dense &&
            getEntryPoints(count).map((n) => (
              <div
                key={n}
                style={{
                  ...styles.mark,
                  ...(n > present ? styles.future : null),
                  left: toPercent(alongRail(n)),
                }}
              />
            ))}

          <div style={styles.asLoaded} />
          <div style={{ ...styles.thumb, left: toPercent(presentAlongRail) }} />
        </div>
      </div>
      <span style={styles.counter}>{describePresent(present, count)}</span>
    </div>
  )
}

/** Pause a replay that is playing, or start one. Not while the canvas is pressed. */
function togglePlay(replay: Replay, canvasPressRef: RefObject<boolean>) {
  if (canvasPressRef.current) return

  if (replay.isPlaying()) {
    replay.pause()
  } else {
    replay.play()
  }
}

/** A plain Space press: with Ctrl, Cmd or Alt it belongs to someone else. */
function isSpace(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false
  return e.key === ' '
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 1.5 L10.5 6 L3 10.5 Z" fill="currentColor" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <rect x="2" y="1.5" width="3" height="9" rx="1" fill="currentColor" />
      <rect x="7" y="1.5" width="3" height="9" rx="1" fill="currentColor" />
    </svg>
  )
}

/** The points of history that end an entry: 1 to `count`. */
function getEntryPoints(count: number): number[] {
  const points: number[] = []
  for (let n = 1; n <= count; n++) points.push(n)
  return points
}

/** Where a slider key moves the present to, or `null` if it is not ours. */
function getKeyTarget(key: string, present: number, count: number): number | null {
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      return present - 1
    case 'ArrowRight':
    case 'ArrowUp':
      return present + 1
    case 'Home':
      return 0
    case 'End':
      return count
    default:
      return null
  }
}

function describePresent(present: number, count: number): string {
  if (present === 0) return 'As loaded'
  return `${present} / ${count}`
}

function toPercent(fraction: number): string {
  return `${fraction * 100}%`
}

const styles = {
  bar: {
    position: 'fixed',
    bottom: BAR_BOTTOM,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: 'min(560px, calc(100vw - 32px))',
    height: BAR_HEIGHT,
    boxSizing: 'border-box',
    padding: '0 16px 0 8px',
    borderRadius: 12,
    background: 'rgba(255,255,255,0.9)',
    backdropFilter: 'blur(8px)',
    boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
    border: '1px solid rgba(0,0,0,0.06)',
    zIndex: 10,
    userSelect: 'none',
  },
  playButton: {
    appearance: 'none',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    padding: 0,
    border: 'none',
    borderRadius: '50%',
    background: ACCENT,
    color: '#fff',
    cursor: 'pointer',
  },
  playButtonDisabled: {
    opacity: 0.35,
    cursor: 'default',
  },
  // The part that takes input: taller than the rail, so it is easy to hit.
  scrubArea: {
    flex: 1,
    alignSelf: 'stretch',
    display: 'flex',
    alignItems: 'center',
    // Room for the thumb and the ring at either end.
    padding: '0 10px',
    borderRadius: 8,
    cursor: 'pointer',
    touchAction: 'none',
  },
  rail: {
    position: 'relative',
    flex: 1,
    height: 24,
  },
  line: {
    position: 'absolute',
    top: '50%',
    height: 2,
    transform: 'translateY(-50%)',
    borderRadius: 1,
    background: ACCENT,
  },
  lineDense: {
    height: 6,
    borderRadius: 3,
  },
  mark: {
    position: 'absolute',
    top: '50%',
    width: 2,
    height: 10,
    transform: 'translate(-50%, -50%)',
    borderRadius: 1,
    background: ACCENT,
  },
  future: {
    opacity: 0.25,
  },
  asLoaded: {
    position: 'absolute',
    top: '50%',
    left: 0,
    width: 10,
    height: 10,
    boxSizing: 'border-box',
    transform: 'translate(-50%, -50%)',
    borderRadius: '50%',
    border: `2px solid ${ACCENT}`,
    background: '#fff',
  },
  thumb: {
    position: 'absolute',
    top: '50%',
    width: 8,
    height: 24,
    boxSizing: 'border-box',
    transform: 'translate(-50%, -50%)',
    borderRadius: 4,
    border: '2px solid #fff',
    background: ACCENT,
    boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
    transition: 'left 80ms ease-out',
  },
  counter: {
    minWidth: 64,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
    color: '#6b6b6b',
    whiteSpace: 'nowrap',
  },
} satisfies Record<string, React.CSSProperties>
