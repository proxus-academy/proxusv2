import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/storybook-static/**", "**/coverage/**", ".repos/**"]
  },
  {
    files: ["apps/**/*.{js,mjs}"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: ["fs", "node:fs", "fs/promises", "node:fs/promises", "path", "node:path", "path/posix", "node:path/posix", "path/win32", "node:path/win32", "child_process", "node:child_process", "http", "node:http", "https", "node:https"].map((name) => ({
          name,
          message: "Use the corresponding Effect platform API instead of importing this Node.js API directly."
        }))
      }]
    }
  },
  {
    files: ["apps/*/**/*.{ts,tsx}", "packages/*/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: process.cwd()
      }
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin
    },
    rules: {
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "no-restricted-imports": ["error", {
        paths: ["fs", "node:fs", "fs/promises", "node:fs/promises", "path", "node:path", "path/posix", "node:path/posix", "path/win32", "node:path/win32", "child_process", "node:child_process", "http", "node:http", "https", "node:https"].map((name) => ({
          name,
          message: "Use the corresponding Effect platform API instead of importing this Node.js API directly."
        }))
      }],
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-unsafe-type-assertion": "error"
    }
  }
)
