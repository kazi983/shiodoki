import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { DataRequest } from "@shared/sync";
import type { Task } from "@shared/task";
import { DesktopStateReporter } from "../src/main/desktopStateReporter";
import { FirestoreTaskRepository } from "../src/main/firestoreTaskRepository";
import { buildAuthUrl, createPkce, loadOAuthClient, parseCallback, signInWithGoogle } from "../src/main/googleOAuth";
import { findLocalData } from "../src/main/localMigration";
import { JsonFileTaskRepository } from "../src/main/taskRepository";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "firebase-main-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
});

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    name: "Task",
    memo: "",
    priority: "NOW",
    completed: false,
    completedAt: null,
    deleted: false,
    totalMinutes: 10,
    sessionCount: 1,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    updatedBy: "desktop",
    ...overrides,
  };
}

describe("FirestoreTaskRepository", () => {
  function setup(timeoutMs = 50) {
    const requests: DataRequest[] = [];
    const changed = vi.fn();
    const repo = new FirestoreTaskRepository(
      { request: async (r: DataRequest) => void requests.push(r) as never },
      changed,
      timeoutMs,
    );
    return { repo, requests, changed };
  }

  test("reads come from snapshots, writes update the cache and are forwarded", async () => {
    const { repo, requests, changed } = setup();
    repo.handleEvent({ type: "tasks", tasks: [task()], status: "synced" });
    expect(changed).toHaveBeenCalledOnce();
    expect(repo.status).toBe("synced");

    await repo.updateTask("t1", { name: "Renamed" });
    expect((await repo.getTask("t1"))?.name).toBe("Renamed");

    await repo.recordSession({
      id: "s1",
      taskId: "t1",
      taskName: "Renamed",
      startedAt: "2026-10-06T09:00:00.000Z",
      endedAt: "2026-10-06T09:30:00.000Z",
      elapsedMinutes: 30,
      endReason: "interval",
      device: "pc",
    });
    expect(await repo.getTask("t1")).toMatchObject({ totalMinutes: 40, sessionCount: 2 });

    await repo.createTask(task({ id: "t2" }));
    expect((await repo.listTasks()).map((t) => t.id)).toEqual(["t1", "t2"]);

    await repo.setPreferences({ lastSelectedTaskId: "t2" });
    expect((await repo.getPreferences()).lastSelectedTaskId).toBe("t2");

    expect(requests.map((r) => r.op)).toEqual(["updateTask", "recordSession", "createTask", "setPreferences"]);
  });

  test("a later snapshot replaces the cache (remote edits from Android)", async () => {
    const { repo } = setup();
    repo.handleEvent({ type: "tasks", tasks: [task()], status: "synced" });
    repo.handleEvent({ type: "tasks", tasks: [task({ name: "Edited on phone", updatedBy: "android" })], status: "pending" });
    expect((await repo.getTask("t1"))?.name).toBe("Edited on phone");
    expect(repo.status).toBe("pending");
  });

  test("listTasks waits for the first snapshot, but not forever", async () => {
    const { repo } = setup(30);
    const started = Date.now();
    expect(await repo.listTasks()).toEqual([]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(25);
  });

  test("updating an unknown task fails", async () => {
    const { repo } = setup();
    repo.handleEvent({ type: "tasks", tasks: [], status: "synced" });
    await expect(repo.updateTask("nope", { name: "x" })).rejects.toThrow();
  });
});

describe("DesktopStateReporter", () => {
  test("writes changes, skips duplicates, sends heartbeats and stops", async () => {
    vi.useFakeTimers();
    const write = vi.fn(async () => {});
    const reporter = new DesktopStateReporter(write, "pc", 1000);
    const startedAt = new Date("2026-10-06T09:00:00.000Z");

    reporter.report({ status: "idle", currentTaskId: null, currentTaskName: null, startedAt: null, nextPromptAt: null });
    reporter.report({ status: "idle", currentTaskId: null, currentTaskName: null, startedAt: null, nextPromptAt: null });
    reporter.report({ status: "running", currentTaskId: "t1", currentTaskName: "Task", startedAt, nextPromptAt: null });
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith({
      status: "running",
      currentTaskId: "t1",
      currentTaskName: "Task",
      startedAt: startedAt.toISOString(),
      nextPromptAt: null,
      device: "pc",
    });

    vi.advanceTimersByTime(2500);
    expect(write).toHaveBeenCalledTimes(4);

    reporter.report({ status: "stopped", currentTaskId: null, currentTaskName: null, startedAt: null, nextPromptAt: null });
    vi.advanceTimersByTime(5000);
    expect(write).toHaveBeenCalledTimes(5);
  });
});

describe("Google OAuth (loopback + PKCE)", () => {
  test("PKCE challenge is the SHA-256 of the verifier", () => {
    const { verifier, challenge } = createPkce();
    const expected = createHash("sha256").update(verifier).digest("base64url");
    expect(challenge).toBe(expected);
  });

  test("auth URL", () => {
    const url = new URL(buildAuthUrl("cid", "http://127.0.0.1:1234", "chal", "st"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "cid",
      redirect_uri: "http://127.0.0.1:1234",
      response_type: "code",
      code_challenge: "chal",
      code_challenge_method: "S256",
      state: "st",
    });
  });

  test("callback parsing", () => {
    expect(parseCallback("/?code=abc&state=s", "s")).toEqual({ code: "abc" });
    expect(parseCallback("/?code=abc&state=x", "s")).toEqual({ error: "state が一致しません" });
    expect(parseCallback("/?error=access_denied&state=s", "s")).toEqual({ error: "ログインがキャンセルされました" });
    expect(parseCallback("/favicon.ico", "s")).toBeNull();
  });

  test("loads the client JSON downloaded from Google Cloud", () => {
    const file = join(dir, "oauth-client.json");
    expect(loadOAuthClient(file)).toBeNull();
    writeFileSync(file, JSON.stringify({ installed: { client_id: "id", client_secret: "secret" } }));
    expect(loadOAuthClient(file)).toEqual({ clientId: "id", clientSecret: "secret" });
    writeFileSync(file, JSON.stringify({ installed: {} }));
    expect(() => loadOAuthClient(file)).toThrow();
  });

  test("full flow: browser redirect -> token exchange -> ID token", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).startsWith("http://127.0.0.1")) return fetch(url, init);
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("code")).toBe("the-code");
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("code_verifier")).toBeTruthy();
      return new Response(JSON.stringify({ id_token: "google-id-token" }), { status: 200 });
    }) as unknown as typeof fetch;

    // Plays the role of the system browser: follows the redirect back to the app.
    const openBrowser = async (authUrl: string) => {
      const u = new URL(authUrl);
      const redirect = `${u.searchParams.get("redirect_uri")}/?code=the-code&state=${u.searchParams.get("state")}`;
      const res = await fetch(redirect);
      expect(await res.text()).toContain("ログインしました");
    };

    const idToken = await signInWithGoogle({ clientId: "id", clientSecret: "secret" }, openBrowser, { fetchImpl });
    expect(idToken).toBe("google-id-token");
  });

  test("cancel in the browser is reported", async () => {
    const openBrowser = async (authUrl: string) => {
      const u = new URL(authUrl);
      await fetch(`${u.searchParams.get("redirect_uri")}/?error=access_denied&state=${u.searchParams.get("state")}`);
    };
    await expect(signInWithGoogle({ clientId: "id", clientSecret: "s" }, openBrowser)).rejects.toThrow(
      "キャンセル",
    );
  });
});

describe("findLocalData (first sign-in migration)", () => {
  test("prefers the v2 local store and renames it after migration", async () => {
    const store = join(dir, "store.json");
    const repo = new JsonFileTaskRepository(store);
    await repo.createTask(task({ id: "a" }));
    await repo.createTask(task({ id: "b", deleted: true }));
    await repo.setPreferences({ lastSelectedTaskId: "a" });

    const local = await findLocalData(store, join(dir, "none.json"), () => "x");
    expect(local?.tasks.map((t) => t.id)).toEqual(["a"]);
    expect(local?.lastSelectedTaskId).toBe("a");
    local?.markMigrated();
    expect(existsSync(store)).toBe(false);
    expect(existsSync(`${store}.migrated`)).toBe(true);
  });

  test("falls back to the v1 tasks.json and leaves it untouched", async () => {
    const legacy = join(dir, "tasks.json");
    writeFileSync(legacy, JSON.stringify([{ id: "v1", name: "Old", priority: "NOW", last_selected: true }]));
    const local = await findLocalData(join(dir, "store.json"), legacy, () => "x");
    expect(local?.tasks.map((t) => t.id)).toEqual(["v1"]);
    local?.markMigrated();
    expect(existsSync(legacy)).toBe(true);
  });

  test("nothing to migrate", async () => {
    expect(await findLocalData(join(dir, "a.json"), join(dir, "b.json"), () => "x")).toBeNull();
  });
});
