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
    ".vercel/**",
    // Vendored from the affectUI registry; kept identical to upstream.
    "src/components/ui/{change-summary,decision-inbox,email-draft,grid-background,notification-stack,number-ticker,segmented-control,smart-recommendation,thinking-loader,tool-call-card}.tsx",
  ]),
]);

export default eslintConfig;
