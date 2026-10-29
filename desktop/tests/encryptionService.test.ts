import { describe, expect, test } from "vitest";
import { KEYS_EXIST, type DataRequest, type KeysData } from "@shared/sync";
import { EncryptionService, type KeyStore } from "../src/main/encryptionService";

/** The data window with an in-memory state/keys document. */
function fakeData() {
  const server = { keys: null as KeysData | null, requests: [] as DataRequest["op"][] };
  const data = {
    async request<T>(r: DataRequest): Promise<T> {
      server.requests.push(r.op);
      switch (r.op) {
        case "getKeys":
          return structuredClone(server.keys) as T;
        case "createKeys":
          if (server.keys) throw new Error(KEYS_EXIST);
          server.keys = structuredClone(r.keys);
          return undefined as T;
        case "updateKeys":
          server.keys = { ...server.keys!, ...structuredClone(r.patch) };
          return undefined as T;
        default:
          throw new Error(`unexpected ${r.op}`);
      }
    },
  };
  return { server, data };
}

function memoryStore() {
  const saved = new Map<string, Buffer>();
  const store: KeyStore = {
    load: (uid) => saved.get(uid) ?? null,
    save: (uid, key) => void saved.set(uid, key),
    clear: () => saved.clear(),
  };
  return { saved, store };
}

const PASSPHRASE = "kaze-no-tayori";
const ITERATIONS = 1000;

/** First PC: set up encryption for "alice". */
async function setUp() {
  const { server, data } = fakeData();
  const first = memoryStore();
  const pc1 = new EncryptionService(data, first.store, ITERATIONS);
  pc1.restore("alice");
  const recoveryKey = await pc1.create(PASSPHRASE);
  return { server, data, first, pc1, recoveryKey };
}

describe("EncryptionService", () => {
  test("setup stores two wrapped keys, never the key or the secrets, and keeps the key on this PC", async () => {
    const { server, first, pc1, recoveryKey } = await setUp();
    expect(recoveryKey).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
    expect(server.keys).toMatchObject({
      v: 1,
      passphrase: { kdf: "PBKDF2-SHA256", iterations: ITERATIONS },
      recovery: { kdf: "HKDF-SHA256" },
    });
    expect(server.keys!.passphrase.wrappedKey).toMatch(/^e1:/);
    expect(server.keys!.passphrase.salt).not.toBe(server.keys!.recovery.salt);
    const stored = JSON.stringify(server.keys);
    expect(stored).not.toContain(PASSPHRASE);
    expect(stored).not.toContain(recoveryKey);
    expect(stored).not.toContain(first.saved.get("alice")!.toString("base64"));
    expect(pc1.ready).toBe(true);
  });

  test("the passphrase must be long enough, also in the main process", async () => {
    const { data } = fakeData();
    const service = new EncryptionService(data, memoryStore().store, ITERATIONS);
    service.restore("alice");
    await expect(service.create("short")).rejects.toThrow();
  });

  test("another PC unlocks with the passphrase or the recovery key and reads the same data", async () => {
    const { data, pc1, recoveryKey } = await setUp();
    const value = pc1.encrypt("要件を書く");

    const pc2 = new EncryptionService(data, memoryStore().store, ITERATIONS);
    pc2.restore("alice");
    expect(pc2.ready).toBe(false);
    expect(await pc2.hasKeys()).toBe(true);
    expect(await pc2.unlock("passphrase", "wrong passphrase")).toBe(false);
    expect(await pc2.unlock("recoveryKey", "K7QM-2XRT-P9DW-H4NA-VC3E-J8KZ-R6FY-T2GB")).toBe(false);
    expect(await pc2.unlock("recoveryKey", "not a key")).toBe(false);
    expect(pc2.ready).toBe(false);
    expect(await pc2.unlock("passphrase", PASSPHRASE)).toBe(true);
    expect(pc2.decrypt(value)).toBe("要件を書く");

    const pc3 = new EncryptionService(data, memoryStore().store, ITERATIONS);
    pc3.restore("alice");
    expect(await pc3.unlock("recoveryKey", recoveryKey.toLowerCase().replace(/-/g, ""))).toBe(true);
    expect(pc3.decrypt(value)).toBe("要件を書く");
  });

  test("the key survives a restart and is forgotten on sign-out; another account does not get it", async () => {
    const { data, first } = await setUp();
    const restarted = new EncryptionService(data, first.store, ITERATIONS);
    expect(restarted.restore("bob")).toBe(false);
    expect(restarted.restore("alice")).toBe(true);
    restarted.forget();
    expect(restarted.ready).toBe(false);
    expect(first.saved.size).toBe(0);
    expect(() => restarted.encrypt("x")).toThrow();
  });

  test("setup on a second PC never replaces the first PC's keys", async () => {
    const { server, data } = await setUp();
    const before = structuredClone(server.keys);
    const pc2 = new EncryptionService(data, memoryStore().store, ITERATIONS);
    pc2.restore("alice");
    await expect(pc2.create("another-passphrase")).rejects.toThrow(/ほかの PC/);
    expect(server.keys).toEqual(before);
    expect(pc2.ready).toBe(false);
  });

  test("changing the passphrase re-wraps the same key: the old passphrase stops working, data stays readable", async () => {
    const { server, data, pc1, recoveryKey } = await setUp();
    const value = pc1.encrypt("memo");
    const recoveryBefore = server.keys!.recovery;

    expect(await pc1.changePassphrase("passphrase", "wrong passphrase", "new-passphrase-1")).toBe(false);
    expect(await pc1.changePassphrase("passphrase", PASSPHRASE, "new-passphrase-1")).toBe(true);
    // The "forgot my passphrase" path: verified by the recovery key.
    expect(await pc1.changePassphrase("recoveryKey", recoveryKey, "new-passphrase-2")).toBe(true);
    expect(server.keys!.recovery).toEqual(recoveryBefore);

    const pc2 = new EncryptionService(data, memoryStore().store, ITERATIONS);
    pc2.restore("alice");
    expect(await pc2.unlock("passphrase", PASSPHRASE)).toBe(false);
    expect(await pc2.unlock("passphrase", "new-passphrase-1")).toBe(false);
    expect(await pc2.unlock("passphrase", "new-passphrase-2")).toBe(true);
    expect(pc2.decrypt(value)).toBe("memo");
  });

  test("a new recovery key replaces the old one", async () => {
    const { data, pc1, recoveryKey } = await setUp();
    const newKey = await pc1.createRecoveryKey();
    expect(newKey).not.toBe(recoveryKey);

    const pc2 = new EncryptionService(data, memoryStore().store, ITERATIONS);
    pc2.restore("alice");
    expect(await pc2.unlock("recoveryKey", recoveryKey)).toBe(false);
    expect(await pc2.unlock("recoveryKey", newKey)).toBe(true);
    expect(await pc2.unlock("passphrase", PASSPHRASE)).toBe(true);
  });

  test("plain values written before encryption are read as they are", async () => {
    const { pc1 } = await setUp();
    expect(pc1.decrypt("old plain name")).toBe("old plain name");
    expect(pc1.decrypt(pc1.encrypt(""))).toBe("");
  });
});
