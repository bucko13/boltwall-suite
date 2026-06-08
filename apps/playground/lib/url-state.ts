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
export type WorkbenchMemoryValues = Record<WorkbenchMemoryField, string>;
export type WorkbenchMemoryWrite = Partial<Record<WorkbenchMemoryField, string | null>>;

export type WorkbenchMemoryFeedback = {
  id: number;
  message: string;
  fields: WorkbenchMemoryField[];
};

const WORKBENCH_MEMORY_FIELDS: WorkbenchMemoryField[] = [
  "signingKey",
  "macaroon",
  "challenge",
  "credential",
];

export function changedWorkbenchFields(
  memory: WorkbenchMemoryValues,
  fields: readonly WorkbenchMemoryField[],
  next: WorkbenchMemoryWrite,
): WorkbenchMemoryField[] {
  return fields.filter((field) => {
    if (!Object.prototype.hasOwnProperty.call(next, field)) return false;
    return memory[field] !== (next[field] || "");
  });
}

type WorkbenchMemoryContextValue = WorkbenchMemoryValues & {
  feedback: WorkbenchMemoryFeedback | null;
  setSigningKey: (value: string | null) => void;
  setMacaroon: (value: string | null) => void;
  setChallenge: (value: string | null) => void;
  setCredential: (value: string | null) => void;
  setFields: (values: WorkbenchMemoryWrite, fields?: readonly WorkbenchMemoryField[]) => void;
  notify: (fields: WorkbenchMemoryField[]) => void;
  clear: () => void;
};

const WorkbenchMemoryContext = createContext<WorkbenchMemoryContextValue | null>(null);
const WORKBENCH_MEMORY_STORAGE_KEY = "bw.workbench-memory";

const EMPTY_WORKBENCH_MEMORY: WorkbenchMemoryValues = {
  signingKey: "",
  macaroon: "",
  challenge: "",
  credential: "",
};

function readStoredWorkbenchMemory(): WorkbenchMemoryValues {
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

function writeStoredWorkbenchMemory(snapshot: WorkbenchMemoryValues) {
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

  const notify = useCallback((fields: WorkbenchMemoryField[]) => {
    if (fields.length === 0) return;
    setFeedback((current) => ({
      id: (current?.id ?? 0) + 1,
      message: "Workbench updated.",
      fields: Array.from(new Set(fields)),
    }));
  }, []);

  const setSigningKey = useCallback(
    (value: string | null) => {
      const next = value || "";
      if (signingKey !== next) notify(["signingKey"]);
      setSigningKeyState(next);
    },
    [notify, signingKey],
  );
  const setMacaroon = useCallback(
    (value: string | null) => {
      const next = value || "";
      if (macaroon !== next) notify(["macaroon"]);
      setMacaroonState(next);
    },
    [macaroon, notify],
  );
  const setChallenge = useCallback(
    (value: string | null) => {
      const next = value || "";
      if (challenge !== next) notify(["challenge"]);
      setChallengeState(next);
    },
    [challenge, notify],
  );
  const setCredential = useCallback(
    (value: string | null) => {
      const next = value || "";
      if (credential !== next) notify(["credential"]);
      setCredentialState(next);
    },
    [credential, notify],
  );

  const setFields = useCallback(
    (
      values: WorkbenchMemoryWrite,
      fields: readonly WorkbenchMemoryField[] = WORKBENCH_MEMORY_FIELDS,
    ) => {
      const memory = { signingKey, macaroon, challenge, credential };
      notify(changedWorkbenchFields(memory, fields, values));

      if (Object.prototype.hasOwnProperty.call(values, "signingKey")) {
        setSigningKeyState(values.signingKey || "");
      }
      if (Object.prototype.hasOwnProperty.call(values, "macaroon")) {
        setMacaroonState(values.macaroon || "");
      }
      if (Object.prototype.hasOwnProperty.call(values, "challenge")) {
        setChallengeState(values.challenge || "");
      }
      if (Object.prototype.hasOwnProperty.call(values, "credential")) {
        setCredentialState(values.credential || "");
      }
    },
    [challenge, credential, macaroon, notify, signingKey],
  );

  const clear = useCallback(() => {
    const clearedFields: WorkbenchMemoryField[] = [];
    if (signingKey) clearedFields.push("signingKey");
    if (macaroon) clearedFields.push("macaroon");
    if (challenge) clearedFields.push("challenge");
    if (credential) clearedFields.push("credential");
    notify(clearedFields);
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
      setFields,
      notify,
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
      setFields,
      setMacaroon,
      setSigningKey,
      signingKey,
      notify,
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
