import type { AccessRole } from "@proxus/backend-domain/access-control"
import type { UserStatus } from "@proxus/backend-domain/auth"
import type { EffectPgQueryEffectHKT, EffectPgQueryResultHKT } from "drizzle-orm/effect-pglite"
import type { EffectPgQueryEffectHKT as PostgresEffectHKT, EffectPgQueryResultHKT as PostgresResultHKT } from "drizzle-orm/effect-postgres"
import { sql } from "drizzle-orm"
import type { PgEffectDatabase } from "drizzle-orm/pg-core/effect"
import { Effect } from "effect"
import { studyCatalogSeed } from "../database/study-catalog.seed.js"

export type AuthQaFixtureName = "admin" | "catalog-editor" | "student-email" | "student-google" | "pending-email"
export interface AuthQaFixture {
  readonly name: AuthQaFixtureName
  readonly id: string
  readonly email: string
  readonly username: string
  readonly status: UserStatus
  readonly provider: "email" | "google"
  readonly role: AccessRole
}

const firstNode = (kind: string) => {
  const value = studyCatalogSeed.nodes.find((candidate) => candidate.kind === kind)
  if (value === undefined) throw new Error(`QA catalog requires a ${kind} node`)
  return value.id
}
const child = (from: string, tag: string) => {
  const edge = studyCatalogSeed.edges.find((candidate) => candidate.from === from && candidate._tag === tag)
  if (edge === undefined) throw new Error(`QA catalog requires a ${tag} edge from ${from}`)
  return edge.to
}

/** Published, contiguous university branch of the deterministic development catalog. */
const qaCountry = firstNode("country")
const qaType = studyCatalogSeed.edges
  .filter((edge) => edge.from === qaCountry && edge._tag === "CountryTypeEdge")
  .map((edge) => edge.to)
  .find((id) => studyCatalogSeed.edges.some((edge) => edge.from === id && edge._tag === "TypeUniversityEdge"))
if (qaType === undefined) throw new Error("QA catalog requires a university study type")
const qaUniversity = child(qaType, "TypeUniversityEdge")
const qaDegree = child(qaUniversity, "UniversityDegreeEdge")
const qaSubject = child(qaDegree, "DegreeSubjectEdge")
export const authQaStudyPath = [qaCountry, qaType, qaUniversity, qaDegree, qaSubject] as const

type PgliteDatabase = PgEffectDatabase<EffectPgQueryEffectHKT, EffectPgQueryResultHKT>
type PathRow = { readonly country: string | null; readonly type: string | null; readonly university: string | null; readonly degree: string | null; readonly subject: string | null }

/** Resolves by graph semantics; fixture users must never assume deterministic catalog IDs. */
export const resolveAuthQaStudyPath = (db: PgliteDatabase) => Effect.gen(function* () {
  const result = yield* db.execute<PathRow>(sql`
    select
      (select id::text from study_nodes where kind = 'country' order by id limit 1) country,
      (select id::text from study_nodes where kind = 'type' order by id limit 1) type,
      (select id::text from study_nodes where kind = 'university' order by id limit 1) university,
      (select id::text from study_nodes where kind = 'degree' order by id limit 1) degree,
      (select id::text from study_nodes where kind = 'subject' order by id limit 1) subject
  `)
  const row = result[0]
  if (row === undefined || row.country === null || row.type === null || row.university === null || row.degree === null || row.subject === null) return yield* Effect.die(new Error("QA catalog branch could not be reconciled"))
  return [row.country, row.type, row.university, row.degree, row.subject] as const
})

type PostgresDatabase = PgEffectDatabase<PostgresEffectHKT, PostgresResultHKT>

export const resolveAuthQaStudyPathPostgres = (db: PostgresDatabase) => Effect.gen(function* () {
  const result = yield* db.execute<PathRow>(sql`
    select
      (select id::text from study_nodes where kind = 'country' order by id limit 1) country,
      (select id::text from study_nodes where kind = 'type' order by id limit 1) type,
      (select id::text from study_nodes where kind = 'university' order by id limit 1) university,
      (select id::text from study_nodes where kind = 'degree' order by id limit 1) degree,
      (select id::text from study_nodes where kind = 'subject' order by id limit 1) subject
  `)
  const row = result[0]
  if (row === undefined || row.country === null || row.type === null || row.university === null || row.degree === null || row.subject === null) return yield* Effect.die(new Error("QA catalog branch could not be reconciled"))
  return [row.country, row.type, row.university, row.degree, row.subject] as const
})

export const authQaFixtures: readonly AuthQaFixture[] = [
  { name: "admin", id: "40000000-0000-4000-8000-000000000001", email: "admin.qa@proxus.dev", username: "qa_admin", status: "active", provider: "email", role: "admin" },
  { name: "catalog-editor", id: "40000000-0000-4000-8000-000000000002", email: "editor.qa@proxus.dev", username: "qa_editor", status: "active", provider: "email", role: "catalog-editor" },
  { name: "student-email", id: "40000000-0000-4000-8000-000000000003", email: "student.email.qa@proxus.dev", username: "qa_student_email", status: "active", provider: "email", role: "student" },
  { name: "student-google", id: "40000000-0000-4000-8000-000000000004", email: "student.google.qa@proxus.dev", username: "qa_student_google", status: "active", provider: "google", role: "student" },
  { name: "pending-email", id: "40000000-0000-4000-8000-000000000005", email: "pending.qa@proxus.dev", username: "qa_pending", status: "pending", provider: "email", role: "student" },
]
