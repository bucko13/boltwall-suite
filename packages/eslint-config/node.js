import baseConfig from "./base.js";

const nodeOverlay = {
  files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
  languageOptions: {
    globals: {
      process: "readonly",
      console: "readonly",
      module: "readonly",
      __dirname: "readonly",
      __filename: "readonly",
    },
  },
};

export default [...baseConfig, nodeOverlay];
