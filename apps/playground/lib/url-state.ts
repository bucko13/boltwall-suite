"use client";

import { createParser, useQueryState } from "nuqs";
import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type ParseUrlInput<T> = (raw: string | null) => T;
export type SerializeUrlInput<T> = (value: T) => string | null;

export type UrlInputOptions = {
  panel?: string;
};

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
const WORKBENCH_MEMORY_CLEAR_EVENT = "boltwall:workbench-memory-clear";
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

function notifyMemoryFieldCleared(field: WorkbenchMemoryField) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(WORKBENCH_MEMORY_CLEAR_EVENT, { detail: { field } }));
}

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

  const setSigningKey = useCallback((value: string | null) => {
    if (!value) notifyMemoryFieldCleared("signingKey");
    setSigningKeyState(value || "");
  }, []);

  const setMacaroon = useCallback((value: string | null) => {
    if (!value) notifyMemoryFieldCleared("macaroon");
    setMacaroonState(value || "");
  }, []);

  const setChallenge = useCallback((value: string | null) => {
    if (!value) notifyMemoryFieldCleared("challenge");
    setChallengeState(value || "");
  }, []);

  const setCredential = useCallback((value: string | null) => {
    if (!value) notifyMemoryFieldCleared("credential");
    setCredentialState(value || "");
  }, []);

  const clear = useCallback(() => {
    notifyMemoryFieldCleared("signingKey");
    notifyMemoryFieldCleared("macaroon");
    notifyMemoryFieldCleared("challenge");
    notifyMemoryFieldCleared("credential");
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

export function useWorkbenchMemory() {
  return useContext(WorkbenchMemoryContext);
}

function getMemoryValue(memory: WorkbenchMemoryContextValue | null, field: WorkbenchMemoryField) {
  if (!memory) return "";
  if (field === "signingKey") return memory.signingKey;
  if (field === "challenge") return memory.challenge;
  if (field === "credential") return memory.credential;
  return memory.macaroon;
}

function setMemoryValue(
  memory: WorkbenchMemoryContextValue | null,
  field: WorkbenchMemoryField,
  value: string | null,
) {
  if (!memory) return;
  if (field === "signingKey") {
    memory.setSigningKey(value);
    return;
  }
  if (field === "challenge") {
    memory.setChallenge(value);
    return;
  }
  if (field === "credential") {
    memory.setCredential(value);
    return;
  }
  memory.setMacaroon(value);
}

/**
 * Keeps a single input value in sync with the current URL search params.
 * The API matches the planned panel usage so callers stay scoped to one key.
 */
export function useUrlInput<T>(
  key: string,
  parse: ParseUrlInput<T>,
  serialize: SerializeUrlInput<T>,
  options: UrlInputOptions = {},
) {
  const scopedKey = options.panel ? `${options.panel}.${key}` : key;
  return useQueryState(
    scopedKey,
    createParser({
      parse: (value) => parse(value),
      serialize: (value) => {
        const serialized = serialize(value);
        return serialized ?? "";
      },
    }).withOptions({
      scroll: false,
    }),
  );
}

export function useRememberedStringInput(
  key: string,
  options: UrlInputOptions & { field: WorkbenchMemoryField },
) {
  const memory = useWorkbenchMemory();
  const [urlValue, setUrlValue] = useUrlInput<string>(
    key,
    (raw) => raw ?? "",
    (value) => value || null,
    options.panel ? { panel: options.panel } : {},
  );
  const memoryValue = getMemoryValue(memory, options.field);
  const value = urlValue ?? memoryValue;
  const previousMemoryValue = useRef(memoryValue);

  useEffect(() => {
    const memoryWasJustCleared = Boolean(previousMemoryValue.current && !memoryValue);
    if (urlValue && !memoryWasJustCleared) {
      setMemoryValue(memory, options.field, urlValue);
    }
  }, [memory, memoryValue, options.field, urlValue]);

  useEffect(() => {
    if (previousMemoryValue.current && !memoryValue && urlValue) {
      void setUrlValue(null);
    }
    previousMemoryValue.current = memoryValue;
  }, [memoryValue, setUrlValue, urlValue]);

  useEffect(() => {
    function onMemoryClear(event: Event) {
      const detail = (event as CustomEvent<{ field?: WorkbenchMemoryField }>).detail;
      if (detail?.field === options.field) {
        void setUrlValue(null);
      }
    }

    window.addEventListener(WORKBENCH_MEMORY_CLEAR_EVENT, onMemoryClear);
    return () => window.removeEventListener(WORKBENCH_MEMORY_CLEAR_EVENT, onMemoryClear);
  }, [options.field, setUrlValue]);

  function setValue(next: string | null) {
    setMemoryValue(memory, options.field, next);
    return setUrlValue(next);
  }

  return [value, setValue] as const;
}
