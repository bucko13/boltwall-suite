import reactConfig from "./react.js";

const nextOverlay = {
  files: ["**/*.{js,mjs,ts,mts,tsx,jsx}"],
  rules: {
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

export default [...reactConfig, nextOverlay];
