import { useEffect, useState } from "react";

/** Whether the timeline is open. `H` opens and closes it; it starts closed. */
export function useTimelineOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "h") return;
      // Leave Ctrl+H and the like to the browser.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Holding H would flicker the bar open and shut.
      if (e.repeat) return;

      setOpen((wasOpen) => !wasOpen);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return open;
}
