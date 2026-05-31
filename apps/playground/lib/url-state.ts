"use client";

import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type WorkbenchMemoryField = "signingKey" | "macaroon" | "challenge" | "credential";

type WorkbenchMemoryContextValue = {
  signingKey: string;
  macaroon: string;
  challenge: string;
  credential: string;
  setSigningKey: (value: string | null) => void;
  setMacaroon: (value: string | null) => void;
  setChallenge: (value: string | null) => void;
  setCredential: (value: string | null) => void;
  clear: () => void;
};

const WorkbenchMemoryContext = createContext<WorkbenchMemoryContextValue | null>(null);
const WORKBENCH_MEMORY_STORAGE_KEY = "bw.workbench-memory";

type WorkbenchMemorySnapshot = Record<WorkbenchMemoryField, string>;

const EMPTY_WORKBENCH_MEMORY: WorkbenchMemorySnapshot = {
  signingKey: "",
  macaroon: "",
  challenge: "",
  credential: "",
};

function readStoredWorkbenchMemory(): WorkbenchMemorySnapshot {
  if (typeof window === "undefined") return EMPTY_WORKBENCH_MEMORY;
  try {
    const raw = window.sessionStorage.getItem(WORKBENCH_MEMORY_STORAGE_KEY);
    if (!raw) return EMPTY_WORKBENCH_MEMORY;
    const parsed = JSON.parse(raw) as Partial<Record<WorkbenchMemoryField, unknown>>;
    return {
      signingKey: typeof parsed.signingKey === "string" ? parsed.signingKey : "",
      macaroon: typeof parsed.macaroon === "string" ? parsed.macaroon : "",
      challenge: typeof parsed.challenge === "string" ? parsed.challenge : "",
      credential: typeof parsed.credential === "string" ? parsed.credential : "",
    };
  } catch {
    return EMPTY_WORKBENCH_MEMORY;
  }
}

function writeStoredWorkbenchMemory(snapshot: WorkbenchMemorySnapshot) {
  if (typeof window === "undefined") return;
  const hasValue = Object.values(snapshot).some(Boolean);
  try {
    if (hasValue) {
      window.sessionStorage.setItem(WORKBENCH_MEMORY_STORAGE_KEY, JSON.stringify(snapshot));
      return;
    }
    window.sessionStorage.removeItem(WORKBENCH_MEMORY_STORAGE_KEY);
  } catch {
    // Storage is a progressive enhancement; keep in-memory Workbench state usable.
  }
}

/**
 * Provides Workbench memory: the per-tab carrier for artifacts (signing key,
 * macaroon, challenge, credential) staged in one panel and loaded into another.
 * Panels never auto-sync their inputs here — values enter a panel only through an
 * explicit "Fill from workbench" action, and a panel writes here only as a
 * deliberate producer (e.g. Generate's minted outputs, Signing Key's key).
 * Persisted in sessionStorage so it survives navigation within the tab.
 */
export function WorkbenchMemoryProvider({ children }: { children: ReactNode }) {
  const [signingKey, setSigningKeyState] = useState("");
  const [macaroon, setMacaroonState] = useState("");
  const [challenge, setChallengeState] = useState("");
  const [credential, setCredentialState] = useState("");
  const [storageHydrated, setStorageHydrated] = useState(false);

  useEffect(() => {
    const stored = readStoredWorkbenchMemory();
    setSigningKeyState(stored.signingKey);
    setMacaroonState(stored.macaroon);
    setChallengeState(stored.challenge);
    setCredentialState(stored.credential);
    setStorageHydrated(true);
  }, []);

  useEffect(() => {
    if (!storageHydrated) return;
    writeStoredWorkbenchMemory({ signingKey, macaroon, challenge, credential });
  }, [challenge, credential, macaroon, signingKey, storageHydrated]);

  const setSigningKey = useCallback((value: string | null) => setSigningKeyState(value || ""), []);
  const setMacaroon = useCallback((value: string | null) => setMacaroonState(value || ""), []);
  const setChallenge = useCallback((value: string | null) => setChallengeState(value || ""), []);
  const setCredential = useCallback((value: string | null) => setCredentialState(value || ""), []);

  const clear = useCallback(() => {
    setSigningKeyState("");
    setMacaroonState("");
    setChallengeState("");
    setCredentialState("");
  }, []);

  const contextValue = useMemo<WorkbenchMemoryContextValue>(
    () => ({
      signingKey,
      macaroon,
      challenge,
      credential,
      setSigningKey,
      setMacaroon,
      setChallenge,
      setCredential,
      clear,
    }),
    [
      challenge,
      clear,
      credential,
      macaroon,
      setChallenge,
      setCredential,
      setMacaroon,
      setSigningKey,
      signingKey,
    ],
  );

  return createElement(WorkbenchMemoryContext.Provider, { value: contextValue }, children);
}

/**
 * Read the Workbench memory carrier. Returns null outside the provider.
 *
 * @example
 * const workbench = useWorkbenchMemory();
 * workbench?.setMacaroon(minted); // stage an artifact for other panels
 */
export function useWorkbenchMemory() {
  return useContext(WorkbenchMemoryContext);
}
