import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

import browserConfig from "./browser.js";

const reactOverlay = {
  files: ["**/*.{jsx,tsx}"],
  plugins: {
    react: reactPlugin,
    "react-hooks": reactHooksPlugin,
  },
  rules: {
    "react/jsx-uses-react": "off",
    "react/react-in-jsx-scope": "off",
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
  },
  settings: {
    react: {
      version: "detect",
    },
  },
};

export default [...browserConfig, reactOverlay];
