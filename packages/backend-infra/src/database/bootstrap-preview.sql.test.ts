import { describe, expect, test } from "vitest"
import { postgresIdentifier, postgresLiteral, previewGrantSql } from "./bootstrap-preview.sql"

const input = {
  database: "proxus_pr_42",
  runtimeRole: "runtime@proxus-v2.iam",
  migrationRole: "migrations@proxus-v2.iam",
}

describe("preview database bootstrap SQL", () => {
  test("gives DDL and schema ownership only to migrations and DML only to runtime", () => {
    const sql = previewGrantSql(input)
    expect(sql.database).toEqual([
      'REVOKE CONNECT, CREATE, TEMPORARY ON DATABASE "proxus_pr_42" FROM PUBLIC',
      'GRANT CONNECT ON DATABASE "proxus_pr_42" TO "runtime@proxus-v2.iam"',
      'GRANT CONNECT, CREATE, TEMPORARY ON DATABASE "proxus_pr_42" TO "migrations@proxus-v2.iam"',
    ])
    expect(sql.target).toContain(`DO $$ BEGIN IF pg_has_role(current_user, 'migrations@proxus-v2.iam', 'MEMBER') THEN ALTER SCHEMA public OWNER TO "migrations@proxus-v2.iam"; END IF; END $$`)
    expect(sql.target).toContain('CREATE SCHEMA IF NOT EXISTS drizzle')
    expect(sql.target.join("\n")).not.toContain('CREATE SCHEMA IF NOT EXISTS drizzle AUTHORIZATION')
    for (const schema of ["public", "drizzle"]) {
      expect(sql.target).toContain(`REVOKE ALL ON SCHEMA ${schema} FROM PUBLIC`)
      expect(sql.target).toContain(`GRANT USAGE ON SCHEMA ${schema} TO "runtime@proxus-v2.iam"`)
      expect(sql.target).toContain(`GRANT USAGE, CREATE ON SCHEMA ${schema} TO "migrations@proxus-v2.iam"`)
      expect(sql.target.join("\n")).not.toContain("ALTER DEFAULT PRIVILEGES")
    }
    expect(sql.target.join("\n")).not.toMatch(/GRANT .*CREATE.* TO "runtime@/)
  })

  test("quotes identifiers containing hyphens and @ without turning them into literals", () => {
    expect(postgresIdentifier("role-name@proxus-v2.iam")).toBe('"role-name@proxus-v2.iam"')
  })

  test.each(["x; DROP DATABASE postgres", "role\"name", "role'name", "UPPER", "", "a".repeat(128)])(
    "rejects identifier injection: %s",
    (value) => expect(() => postgresIdentifier(value)).toThrow("invalid PostgreSQL identifier"),
  )

  test("quotes role literals independently and escapes apostrophes", () => {
    expect(postgresLiteral("role-name@proxus-v2.iam")).toBe("'role-name@proxus-v2.iam'")
    expect(postgresLiteral("role'name")).toBe("'role''name'")
    expect(() => postgresLiteral("role\0name")).toThrow("invalid PostgreSQL literal")
  })
})
