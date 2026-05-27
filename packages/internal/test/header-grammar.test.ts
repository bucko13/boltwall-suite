import { describe, expect, test } from "bun:test";

import { tokenizeHttpAuth, type TokenizeOptions } from "../src/header-grammar";

const L402: TokenizeOptions = { knownSchemes: ["l402", "lsat"] };

describe("tokenizeHttpAuth / happy path", () => {
  test("tokenizes a single challenge into lowercased scheme and params", () => {
    expect(tokenizeHttpAuth('L402 macaroon="abc", invoice="lnbc1"', L402)).toEqual([
      {
        scheme: "l402",
        params: [
          { name: "macaroon", value: "abc" },
          { name: "invoice", value: "lnbc1" },
        ],
      },
    ]);
  });

  test("preserves source order of params (invoice before macaroon)", () => {
    const [challenge] = tokenizeHttpAuth('L402 invoice="lnbc1", macaroon="abc"', L402);
    expect(challenge?.params.map((p) => p.name)).toEqual(["invoice", "macaroon"]);
  });

  test("accepts an empty quoted-string value", () => {
    expect(tokenizeHttpAuth('L402 macaroon=""', L402)).toEqual([
      { scheme: "l402", params: [{ name: "macaroon", value: "" }] },
    ]);
  });

  test("tokenizes a custom scheme supplied via knownSchemes", () => {
    expect(tokenizeHttpAuth('Bearer token="x"', { knownSchemes: ["bearer"] })).toEqual([
      { scheme: "bearer", params: [{ name: "token", value: "x" }] },
    ]);
  });
});

describe("tokenizeHttpAuth / dual-scheme boundaries", () => {
  test("splits LSAT and L402 challenges folded into one value", () => {
    expect(
      tokenizeHttpAuth('LSAT macaroon="a", invoice="b", L402 macaroon="c", invoice="d"', L402),
    ).toEqual([
      {
        scheme: "lsat",
        params: [
          { name: "macaroon", value: "a" },
          { name: "invoice", value: "b" },
        ],
      },
      {
        scheme: "l402",
        params: [
          { name: "macaroon", value: "c" },
          { name: "invoice", value: "d" },
        ],
      },
    ]);
  });

  test("detects a challenge boundary even without a space after the comma", () => {
    expect(tokenizeHttpAuth('LSAT macaroon="a",L402 macaroon="b"', L402)).toEqual([
      { scheme: "lsat", params: [{ name: "macaroon", value: "a" }] },
      { scheme: "l402", params: [{ name: "macaroon", value: "b" }] },
    ]);
  });

  test("a param name that merely prefixes a known scheme is not a boundary", () => {
    // `l402x` shares a prefix with `l402` but is not the scheme keyword, so it
    // is parsed as another param of the first challenge rather than a new one.
    const challenges = tokenizeHttpAuth('L402 macaroon="a", l402x="b"', L402);
    expect(challenges).toHaveLength(1);
    expect(challenges[0]?.params.map((p) => p.name)).toEqual(["macaroon", "l402x"]);
  });
});

describe("tokenizeHttpAuth / case-insensitivity", () => {
  for (const scheme of ["L402", "l402", "L402".toUpperCase()]) {
    test(`normalizes scheme \`${scheme}\` to lowercase`, () => {
      expect(tokenizeHttpAuth(`${scheme} macaroon="a"`, L402)[0]?.scheme).toBe("l402");
    });
  }

  test("normalizes param names to lowercase", () => {
    expect(tokenizeHttpAuth('L402 MaCaRoOn="a"', L402)[0]?.params[0]?.name).toBe("macaroon");
  });

  test("matches a mixed-case known scheme (LsAt)", () => {
    expect(tokenizeHttpAuth('LsAt macaroon="a"', L402)[0]?.scheme).toBe("lsat");
  });
});

describe("tokenizeHttpAuth / whitespace handling", () => {
  test("skips leading whitespace before the scheme", () => {
    expect(tokenizeHttpAuth('   L402 macaroon="a"', L402)[0]?.scheme).toBe("l402");
  });

  test("accepts a tab as the scheme separator", () => {
    expect(tokenizeHttpAuth('L402\tmacaroon="a"', L402)[0]?.scheme).toBe("l402");
  });

  test("tolerates whitespace around the `=` separator", () => {
    expect(tokenizeHttpAuth('L402 macaroon = "a"', L402)[0]?.params[0]).toEqual({
      name: "macaroon",
      value: "a",
    });
  });
});

describe("tokenizeHttpAuth / quoted-string escaping", () => {
  test("resolves `\\X` escapes to the verbatim next byte", () => {
    // `"a\"b\\c"` decodes to `a"b\c`: the escaped quote and backslash are kept literally.
    expect(tokenizeHttpAuth('L402 macaroon="a\\"b\\\\c"', L402)[0]?.params[0]?.value).toBe(
      'a"b\\c',
    );
  });

  test("does not treat a comma inside a quoted value as a separator", () => {
    expect(tokenizeHttpAuth('L402 macaroon="a,b"', L402)[0]?.params[0]?.value).toBe("a,b");
  });
});

describe("tokenizeHttpAuth / error codes", () => {
  // Each row pins an input to the exact error code thrown, matching the
  // documented contract in header-grammar.ts.
  const cases: ReadonlyArray<[label: string, input: string, code: string]> = [
    ["empty string", "", "empty-header"],
    ["whitespace-only", "   \t ", "empty-header"],
    ["leading comma (non-token byte)", ",foo", "garbage-data"],
    ["leading quote (non-token byte)", '"foo"', "garbage-data"],
    ["scheme not in knownSchemes", 'Bearer x="y"', "scheme-mismatch"],
    // `L402macaroon` is a single token that is not a known scheme, so the
    // mismatch fires before any separator check.
    ["scheme glued to first param", 'L402macaroon="a"', "scheme-mismatch"],
    ["scheme at end of input", "L402", "expected-sp-after-scheme"],
    ["scheme followed by a comma", "L402,x", "expected-sp-after-scheme"],
    ["scheme followed by a quote", 'L402"x"', "expected-sp-after-scheme"],
    ["missing param name", 'L402 ="a"', "expected-param-name"],
    ["trailing comma at end of input", 'L402 macaroon="a",', "expected-param-name"],
    ["param name without `=`", 'L402 macaroon "a"', "expected-equals"],
    // A top-level comma followed by an unknown scheme is not a boundary, so
    // `Bearer` is read as the next param name and fails on the missing `=`.
    ["comma before an unknown scheme", 'L402 macaroon="a", Bearer foo="b"', "expected-equals"],
    ["unquoted param value", "L402 macaroon=abc", "expected-quoted-value"],
    ["unterminated quoted-string", 'L402 macaroon="abc', "unterminated-quoted-string"],
    // A trailing backslash at EOF cannot start an escape, so the quote never closes.
    ["trailing backslash at EOF", 'L402 macaroon="a\\', "unterminated-quoted-string"],
    ["junk after a param value", 'L402 macaroon="a" junk', "expected-comma-or-eof"],
  ];

  for (const [label, input, code] of cases) {
    test(`${label} -> ${code}`, () => {
      expect(() => tokenizeHttpAuth(input, L402)).toThrow(code);
    });
  }

  test("an empty knownSchemes list rejects every scheme", () => {
    expect(() => tokenizeHttpAuth('L402 macaroon="a"', { knownSchemes: [] })).toThrow(
      "scheme-mismatch",
    );
  });
});
