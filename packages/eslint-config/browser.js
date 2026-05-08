import baseConfig from "./base.js";

const browserOverlay = {
  files: ["**/*.{js,mjs,ts,mts,tsx,jsx}"],
  languageOptions: {
    globals: {
      window: "readonly",
      document: "readonly",
      navigator: "readonly",
      fetch: "readonly",
      Request: "readonly",
      Response: "readonly",
      URL: "readonly",
      URLSearchParams: "readonly",
    },
  },
};

export default [...baseConfig, browserOverlay];
