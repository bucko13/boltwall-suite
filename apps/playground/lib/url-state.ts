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

export type WorkbenchMemoryFeedback = {
  id: number;
  message: string;
};

type WorkbenchMemoryContextValue = {
  signingKey: string;
  macaroon: string;
  challenge: string;
  credential: string;
  feedback: WorkbenchMemoryFeedback | null;
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

const WORKBENCH_MEMORY_LABELS: Record<WorkbenchMemoryField, string> = {
  signingKey: "signing key",
  macaroon: "macaroon",
  challenge: "challenge",
  credential: "credential",
};

function sentenceCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function describeFieldChange(
  field: WorkbenchMemoryField,
  previous: string,
  next: string,
): string | null {
  const label = WORKBENCH_MEMORY_LABELS[field];
  if (previous === next) return next ? `${sentenceCase(label)} already stored.` : null;
  if (!next) return `Cleared ${label}.`;
  if (previous) return `Replaced ${label}.`;
  return `Stored ${label}.`;
}

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
  const [feedback, setFeedback] = useState<WorkbenchMemoryFeedback | null>(null);
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

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const notify = useCallback((message: string | null) => {
    if (!message) return;
    setFeedback((current) => ({ id: (current?.id ?? 0) + 1, message }));
  }, []);

  const setSigningKey = useCallback(
    (value: string | null) => {
      const next = value || "";
      notify(describeFieldChange("signingKey", signingKey, next));
      setSigningKeyState(next);
    },
    [notify, signingKey],
  );
  const setMacaroon = useCallback(
    (value: string | null) => {
      const next = value || "";
      notify(describeFieldChange("macaroon", macaroon, next));
      setMacaroonState(next);
    },
    [macaroon, notify],
  );
  const setChallenge = useCallback(
    (value: string | null) => {
      const next = value || "";
      notify(describeFieldChange("challenge", challenge, next));
      setChallengeState(next);
    },
    [challenge, notify],
  );
  const setCredential = useCallback(
    (value: string | null) => {
      const next = value || "";
      notify(describeFieldChange("credential", credential, next));
      setCredentialState(next);
    },
    [credential, notify],
  );

  const clear = useCallback(() => {
    const clearedCount = [signingKey, macaroon, challenge, credential].filter(Boolean).length;
    if (clearedCount > 0) {
      notify("Cleared Workbench memory.");
    }
    setSigningKeyState("");
    setMacaroonState("");
    setChallengeState("");
    setCredentialState("");
  }, [challenge, credential, macaroon, notify, signingKey]);

  const contextValue = useMemo<WorkbenchMemoryContextValue>(
    () => ({
      signingKey,
      macaroon,
      challenge,
      credential,
      feedback,
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
      feedback,
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
