import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { Row } from "@/lib/evidence/catalog";
import { SECTION_KEYS, type SectionKey } from "@/lib/profile/sections";
import { getGoals, getPersonal, listEntries } from "./repository";

/** Loads every profile section for editor pages. */
export async function loadProfileForEditing(supabase: SupabaseServerClient, userId: string) {
  const [personal, goals, ...lists] = await Promise.all([
    getPersonal(supabase, userId),
    getGoals(supabase, userId),
    ...SECTION_KEYS.map((k) => listEntries(supabase, k)),
  ]);
  const sections = Object.fromEntries(SECTION_KEYS.map((k, i) => [k, lists[i] as Row[]])) as Record<SectionKey, Row[]>;
  return {
    personal: personal as Record<string, unknown> | null,
    goals: goals as Record<string, unknown> | null,
    sections,
  };
}
