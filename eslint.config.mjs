import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  eslintConfigPrettier,
  {
    languageOptions: {
      parserOptions: {
        project: ["tsconfig.json", "tsconfig.test.json", "tsconfig.bench.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-useless-constructor": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
    },
  },
  {
    // bench/datasets/ holds data, not source: images, ground-truth markdown, and
    // the standalone generator script for the example set.
    //
    // .claude/ holds local agent state, including transient git worktrees. Those
    // are checkouts of this same repo, so linting them both duplicates the work
    // and fails outright: their paths are not in any tsconfig `project`, which
    // the type-aware parser treats as an error.
    ignores: [
      "dist/",
      "coverage/",
      ".history/",
      ".claude/",
      "bench/datasets/",
      "*.config.*",
      "*.mjs",
    ],
  },
);
