import { describe, expect, test } from "vitest"
import { runtimeDefaultPrivilegesSql } from "./runtime-default-privileges.sql.js"

describe("runtime default privileges SQL", () => {
  test("revokes PUBLIC and idempotently grants existing and future runtime DML after migrations", () => {
    const statements = runtimeDefaultPrivilegesSql("runtime@proxus-v2.iam")
    for (const schema of ["public", "drizzle"]) {
      expect(statements).toContain(`REVOKE ALL ON ALL TABLES IN SCHEMA ${schema} FROM PUBLIC`)
      expect(statements).toContain(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA ${schema} FROM PUBLIC`)
      expect(statements).toContain(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO "runtime@proxus-v2.iam"`)
      expect(statements).toContain(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO "runtime@proxus-v2.iam"`)
      expect(statements).toContain(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} REVOKE ALL ON TABLES FROM PUBLIC`)
      expect(statements).toContain(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "runtime@proxus-v2.iam"`)
    }
    expect(statements.join("\n")).not.toContain("FOR ROLE")
  })

  test.each(["runtime; DROP ROLE runtime", "role\"name", "", "UPPER"])(
    "rejects runtime-role injection: %s",
    (role) => expect(() => runtimeDefaultPrivilegesSql(role)).toThrow("invalid PostgreSQL identifier"),
  )
})
