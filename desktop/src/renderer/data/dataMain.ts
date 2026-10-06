/**
 * Entry point of the hidden data window. Owns the Firebase SDK (Auth +
 * Firestore with offline persistence in IndexedDB) and serves requests
 * from the main process (src/main/dataBridge.ts).
 */

import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithCredential,
  signOut,
} from "firebase/auth";
import {
  clearIndexedDbPersistence,
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  terminate,
} from "firebase/firestore";
import type { DataBridgeApi, DataRequest } from "@shared/sync";
import { FirestoreStore } from "./firestoreStore";

declare global {
  interface Window {
    dataBridge: DataBridgeApi;
  }
}

const bridge = window.dataBridge;
let store: FirestoreStore | null = null;
let unsubscribe: (() => void) | null = null;

function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(error);
  bridge.emit({ type: "error", message });
}

async function main(): Promise<void> {
  const config = await bridge.getConfig();
  const app = initializeApp(config.firebase);
  // No popup/redirect resolver: sign-in happens in the system browser (src/main/googleOAuth.ts).
  const auth = initializeAuth(app, { persistence: indexedDBLocalPersistence });
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
  });
  if (config.emulator) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }

  function requireStore(): FirestoreStore {
    if (!store) throw new Error("ログインしていません");
    return store;
  }

  async function handle(request: DataRequest): Promise<unknown> {
    switch (request.op) {
      case "signIn": {
        const cred = await signInWithCredential(auth, GoogleAuthProvider.credential(request.idToken));
        return { uid: cred.user.uid, email: cred.user.email };
      }
      case "signOut":
        unsubscribe?.();
        unsubscribe = null;
        await signOut(auth);
        // Remove the cached data of this account from the PC.
        await terminate(db);
        await clearIndexedDbPersistence(db);
        return null;
      case "createTask":
        return requireStore().createTask(request.task);
      case "updateTask":
        return requireStore().updateTask(request.id, request.patch);
      case "recordSession":
        return requireStore().recordSession(request.session);
      case "setPreferences":
        return requireStore().setPreferences(request.patch);
      case "setDesktopState":
        return requireStore().setDesktopState(request.state);
      case "countRemoteTasks":
        return requireStore().countRemoteTasks();
      case "importTasks":
        return requireStore().importTasks(request.tasks, request.preferences);
      case "flush":
        return store ? store.flush(request.timeoutMs) : true;
    }
  }

  bridge.onRequest(async ({ id, request }) => {
    try {
      const result = await handle(request);
      bridge.respond({ id, ok: true, result: result ?? null });
    } catch (error) {
      bridge.respond({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  onAuthStateChanged(auth, (user) => {
    unsubscribe?.();
    unsubscribe = null;
    store = user ? new FirestoreStore(db, user.uid, reportError) : null;
    if (store) {
      unsubscribe = store.subscribe({
        onTasks: (tasks, status) => bridge.emit({ type: "tasks", tasks, status }),
        onPreferences: (preferences) => bridge.emit({ type: "preferences", preferences }),
        onError: reportError,
      });
    }
    bridge.emit({ type: "auth", uid: user?.uid ?? null, email: user?.email ?? null });
  });

  bridge.emit({ type: "ready" });
}

main().catch(reportError);
