"use client";

import { createParser, useQueryState } from "nuqs";

export type ParseUrlInput<T> = (raw: string | null) => T;
export type SerializeUrlInput<T> = (value: T) => string | null;

export type UrlInputOptions = {
  panel?: string;
};

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
