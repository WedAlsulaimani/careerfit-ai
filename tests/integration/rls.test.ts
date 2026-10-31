import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Multi-user isolation against a REAL Supabase project with the migration
 * applied (scenario 18). Runs only when RLS_TEST_SUPABASE_URL,
 * RLS_TEST_SUPABASE_ANON_KEY and RLS_TEST_SUPABASE_SERVICE_ROLE_KEY are set.
 * It creates two throwaway users and deletes them afterwards.
 * Use a development project, never production.
 */
const url = process.env.RLS_TEST_SUPABASE_URL;
const anon = process.env.RLS_TEST_SUPABASE_ANON_KEY;
const service = process.env.RLS_TEST_SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(url && anon && service);

describe.skipIf(!enabled)("Row Level Security isolation", () => {
  let admin: SupabaseClient;
  let alice: SupabaseClient;
  let bob: SupabaseClient;
  const users: { id: string; email: string }[] = [];
  const password = `Test-${randomUUID()}-9`;

  const signIn = async (email: string) => {
    const client = createClient(url!, anon!, { auth: { persistSession: false } });
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return client;
  };

  beforeAll(async () => {
    admin = createClient(url!, service!, { auth: { persistSession: false } });
    for (const name of ["alice", "bob"]) {
      const email = `rls-${name}-${randomUUID()}@example.com`;
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      users.push({ id: data.user.id, email });
    }
    alice = await signIn(users[0].email);
    bob = await signIn(users[1].email);
  }, 60_000);

  afterAll(async () => {
    for (const u of users) await admin.auth.admin.deleteUser(u.id);
  });

  it("creates a profile row for each new user", async () => {
    const { data } = await alice.from("profiles").select("user_id");
    expect(data).toHaveLength(1);
    expect(data![0].user_id).toBe(users[0].id);
  });

  it("prevents reading, updating or deleting another user's records", async () => {
    const { data: created, error } = await alice
      .from("projects")
      .insert({ user_id: users[0].id, title: "Alice private project", category: "personal" })
      .select("id")
      .single();
    expect(error).toBeNull();

    const read = await bob.from("projects").select("id").eq("id", created!.id);
    expect(read.data).toEqual([]);

    const upd = await bob.from("projects").update({ title: "hacked" }).eq("id", created!.id).select("id");
    expect(upd.data).toEqual([]);

    const del = await bob.from("projects").delete().eq("id", created!.id).select("id");
    expect(del.data).toEqual([]);

    const still = await alice.from("projects").select("title").eq("id", created!.id).single();
    expect(still.data?.title).toBe("Alice private project");
  });

  it("rejects inserts that claim another user's id", async () => {
    const { error } = await bob.from("projects").insert({ user_id: users[0].id, title: "spoof", category: "personal" });
    expect(error).not.toBeNull();
  });

  it("rejects child rows that reference another user's parent", async () => {
    const { data: opp } = await alice.from("job_opportunities").insert({ user_id: users[0].id, source_type: "manual", title: "Job" }).select("id").single();
    const { error } = await bob.from("job_sources").insert({ user_id: users[1].id, opportunity_id: opp!.id, source_type: "manual", raw_text: "x" });
    expect(error).not.toBeNull();
  });

  it("keeps the AI usage ledger append-only", async () => {
    await alice.from("ai_usage").insert({ user_id: users[0].id, operation: "test" });
    const del = await alice.from("ai_usage").delete().eq("user_id", users[0].id).select("id");
    expect(del.data ?? []).toEqual([]);
    const { count } = await alice.from("ai_usage").select("id", { count: "exact", head: true });
    expect(count).toBe(1);
  });

  it("isolates private storage objects", async () => {
    const path = `${users[0].id}/${randomUUID()}.pdf`;
    const up = await alice.storage.from("documents").upload(path, new Blob(["%PDF-1.4 test"], { type: "application/pdf" }));
    expect(up.error).toBeNull();
    const down = await bob.storage.from("documents").download(path);
    expect(down.error).not.toBeNull();
    const wrongFolder = await bob.storage.from("documents").upload(`${users[0].id}/evil.pdf`, new Blob(["%PDF-1.4"], { type: "application/pdf" }));
    expect(wrongFolder.error).not.toBeNull();
    await alice.storage.from("documents").remove([path]);
  });

  it("denies anonymous access", async () => {
    const anonClient = createClient(url!, anon!, { auth: { persistSession: false } });
    const { data } = await anonClient.from("profiles").select("user_id");
    expect(data ?? []).toEqual([]);
  });
});
