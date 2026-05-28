import { describe, expect, test } from "bun:test";
import { ESLint } from "eslint";

import baseConfig from "../base.js";
import browserConfig from "../browser.js";
import nextConfig from "../next.js";
import nodeConfig from "../node.js";
import reactConfig from "../react.js";

const presets = {
  base: baseConfig,
  browser: browserConfig,
  next: nextConfig,
  node: nodeConfig,
  react: reactConfig,
};

function eslintFor(config: typeof baseConfig): ESLint {
  return new ESLint({
    overrideConfig: config,
    overrideConfigFile: true,
  });
}

async function lintRuleIds(
  config: typeof baseConfig,
  code: string,
  filePath: string,
): Promise<string[]> {
  const [result] = await eslintFor(config).lintText(code, { filePath });

  return result.messages.map((message) => message.ruleId ?? "<fatal>");
}

describe("@boltwall/eslint-config presets", () => {
  for (const [name, config] of Object.entries(presets)) {
    test(`${name} preset loads`, async () => {
      expect(Array.isArray(config)).toBe(true);
      expect(config.length).toBeGreaterThan(0);

      const calculated = await eslintFor(config).calculateConfigForFile(
        `fixture-${name}.ts`,
      );

      expect(calculated).toBeTruthy();
    });
  }

  test("base preset rejects explicit any", async () => {
    await expect(
      lintRuleIds(baseConfig, "const value: any = 1;\n", "fixture.ts"),
    ).resolves.toContain("@typescript-eslint/no-explicit-any");
  });

  test("base preset rejects Buffer imports", async () => {
    await expect(
      lintRuleIds(
        baseConfig,
        'import { Buffer } from "buffer";\n',
        "fixture.ts",
      ),
    ).resolves.toContain("no-restricted-imports");
  });

  test("next preset inherits the base Buffer restriction", async () => {
    await expect(
      lintRuleIds(nextConfig, 'import { Buffer } from "buffer";\n', "page.tsx"),
    ).resolves.toContain("no-restricted-imports");
  });

  test("react preset enforces hooks rules", async () => {
    const code = [
      'import { useEffect } from "react";',
      "export function Component({ enabled }: { enabled: boolean }) {",
      "  if (enabled) {",
      "    useEffect(() => {}, []);",
      "  }",
      "  return null;",
      "}",
    ].join("\n");

    await expect(
      lintRuleIds(reactConfig, code, "component.tsx"),
    ).resolves.toContain("react-hooks/rules-of-hooks");
  });
});
