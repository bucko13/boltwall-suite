import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import prettier from "eslint-config-prettier";

const baseConfig = {
  files: ["**/*.{js,mjs,cjs,ts,mts,cts,tsx,jsx}"],
  ignores: ["dist/**", ".next/**", "coverage/**", "node_modules/**"],
  languageOptions: {
    parser: tsparser,
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: {
    "@typescript-eslint": tseslint,
    import: importPlugin,
  },
  rules: {
    "@typescript-eslint/consistent-type-imports": "error",
    "@typescript-eslint/no-explicit-any": "error",
    "import/order": [
      "warn",
      {
        "newlines-between": "always",
        alphabetize: { order: "asc", caseInsensitive: true },
      },
    ],
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "buffer",
            message:
              "Use Uint8Array for cross-runtime APIs; avoid Buffer in browser-compatible code.",
          },
        ],
      },
    ],
  },
};

export default [baseConfig, prettier];
