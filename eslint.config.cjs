"use strict";
const tsParser = require("@typescript-eslint/parser");
const almadarPlugin = require("@almadar/eslint-plugin");

module.exports = [
  { ignores: ["dist/**", "node_modules/**"] },
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
    },
    plugins: { almadar: almadarPlugin },
    rules: {
      "almadar/no-as-any": "error",
      "almadar/no-import-generated": "error",
      "almadar/no-record-string-unknown": "error",
    },
  },
];
