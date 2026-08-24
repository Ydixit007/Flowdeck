import next from "eslint-config-next";

/** eslint-config-next v16 ships a flat config, so no compat layer is needed. */
const config = [
  { ignores: [".next/**", "node_modules/**", "public/sw.js", "next-env.d.ts"] },
  ...next,
  {
    rules: {
      /*
       * eslint-plugin-react-hooks v7 ships React Compiler rules that flag
       * fetch-on-mount and prop-sync effects. Both patterns are deliberate here
       * (data loads from the API after mount; forms sync when the selected task
       * changes) and every such effect is guarded and cleaned up, so these stay
       * advisory rather than blocking.
       */
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      // Fires on `new Date()` inside async server components, which is safe.
      "react-hooks/purity": "warn",
    },
  },
];

export default config;
