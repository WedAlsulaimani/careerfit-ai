"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Undo/redo history for an immutable document. Consecutive edits to the same
 * field (same `group`) within 800 ms are coalesced so undo steps feel natural.
 */
export function useHistory<T>(initial: T, limit = 60) {
  const [state, setState] = useState({ past: [] as T[], present: initial, future: [] as T[] });
  const lastGroup = useRef<{ key: string; at: number } | null>(null);

  const set = useCallback(
    (updater: (prev: T) => T, group?: string) => {
      setState((s) => {
        const next = updater(s.present);
        if (next === s.present) return s;
        const now = Date.now();
        const coalesce = group && lastGroup.current?.key === group && now - lastGroup.current.at < 800;
        lastGroup.current = group ? { key: group, at: now } : null;
        return {
          past: coalesce ? s.past : [...s.past, s.present].slice(-limit),
          present: next,
          future: [],
        };
      });
    },
    [limit],
  );

  const undo = useCallback(() => {
    lastGroup.current = null;
    setState((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s));
  }, []);

  const redo = useCallback(() => {
    lastGroup.current = null;
    setState((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s));
  }, []);

  const reset = useCallback((value: T) => {
    lastGroup.current = null;
    setState({ past: [], present: value, future: [] });
  }, []);

  return { value: state.present, set, undo, redo, reset, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}
