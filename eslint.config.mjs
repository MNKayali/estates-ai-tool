import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Unrelated side projects that happen to sit in this repo's root folder
    // (not part of the estates-ai-tool app, and not tracked in git). Without
    // this, `npm run lint` (`eslint` with no path — scans the whole tree)
    // swept their files in too, each with its own dependencies and shape this
    // config knows nothing about, making a clean lint run of the actual app
    // impossible without manually scoping the command every time.
    "nutritrack/**",
    "portfolio-advisor/**",
    "Beach Game/**",
  ]),
]);

export default eslintConfig;
