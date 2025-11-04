import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.config({
    extends: ["next/core-web-vitals","next/typescript","plugin:prettier/recommended"],
    ignorePatterns: ["app/generated/**"],
    rules: {
      // ✅ Prettier formatting rules
      "prettier/prettier": [
        "error",
        {
          endOfLine: "auto",
          singleQuote: false, // ⬅️ use double quotes
          semi: true,
          tabWidth: 2,
          printWidth: 100,
          trailingComma: "es5",
          bracketSpacing: true,
          arrowParens: "always",
        },
      ],

      // ✅ ESLint style and safety rules
      curly: ["error", "all"],
      quotes: ["error", "double", { avoidEscape: true }], // ⬅️ enforce double quotes
      semi: ["error", "always"],

      // ❌ disable conflicting formatting rules
      indent: "off",
      "max-len": "off",
    },
  }),
];

export default eslintConfig;
