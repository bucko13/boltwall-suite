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
  useState,
} from "react";

export type ParseUrlInput<T> = (raw: string | null) => T;
export type SerializeUrlInput<T> = (value: T) => string | null;

export type UrlInputOptions = {
  panel?: string;
};

export type WorkbenchMemoryField = "signingKey" | "macaroon";

type WorkbenchMemoryContextValue = {
  signingKey: string;
  macaroon: string;
  setSigningKey: (value: string | null) => void;
  setMacaroon: (value: string | null) => void;
};

const WorkbenchMemoryContext = createContext<WorkbenchMemoryContextValue | null>(null);

export function WorkbenchMemoryProvider({ children }: { children: ReactNode }) {
  const [signingKey, setSigningKeyState] = useState("");
  const [macaroon, setMacaroonState] = useState("");

  const setSigningKey = useCallback((value: string | null) => {
    setSigningKeyState(value || "");
  }, []);

  const setMacaroon = useCallback((value: string | null) => {
    setMacaroonState(value || "");
  }, []);

  const contextValue = useMemo<WorkbenchMemoryContextValue>(
    () => ({
      signingKey,
      macaroon,
      setSigningKey,
      setMacaroon,
    }),
    [macaroon, setMacaroon, setSigningKey, signingKey],
  );

  return createElement(WorkbenchMemoryContext.Provider, { value: contextValue }, children);
}

export function useWorkbenchMemory() {
  return useContext(WorkbenchMemoryContext);
}

function getMemoryValue(memory: WorkbenchMemoryContextValue | null, field: WorkbenchMemoryField) {
  if (!memory) return "";
  return field === "signingKey" ? memory.signingKey : memory.macaroon;
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

  useEffect(() => {
    if (urlValue) {
      setMemoryValue(memory, options.field, urlValue);
    }
  }, [memory, options.field, urlValue]);

  function setValue(next: string | null) {
    setMemoryValue(memory, options.field, next);
    return setUrlValue(next);
  }

  return [value, setValue] as const;
}
