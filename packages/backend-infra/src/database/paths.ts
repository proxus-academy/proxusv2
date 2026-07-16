import { fileURLToPath } from "node:url"

/** Default owned by backend-infra, independent of the executable working directory. */
export const defaultMigrationsFolder = fileURLToPath(
  new URL("../../drizzle", import.meta.url),
)
