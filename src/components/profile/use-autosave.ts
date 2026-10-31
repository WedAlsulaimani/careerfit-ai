"use client";

import { useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

/**
 * Debounced autosave: calls `save` after the user stops typing, only when
 * `enabled` (form dirty and valid). Returns the current status for display.
 */
export function useAutosave<T>(value: T, enabled: boolean, save: (v: T) => Promise<void>, delay = 1200) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  const serialized = JSON.stringify(value);
  const last = useRef(serialized);

  useEffect(() => {
    if (!enabled || serialized === last.current) return;
    setStatus("pending");
    const timer = setTimeout(async () => {
      setStatus("saving");
      try {
        await saveRef.current(JSON.parse(serialized) as T);
        last.current = serialized;
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [serialized, enabled, delay]);

  return status;
}
