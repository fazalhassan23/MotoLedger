module.exports = [
  { ignores: ["dist/icons.js", "node_modules/**", "android/release/**"] },
  {
    files: ["**/*.js", "**/*.cjs"],
    languageOptions: { ecmaVersion: 2022, sourceType: "script" },
    rules: {
      "constructor-super": "error",
      "for-direction": "error",
      "no-async-promise-executor": "error",
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-debugger": "error",
      "no-dupe-args": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-unreachable": "error",
      "valid-typeof": "error",
    },
  },
];
