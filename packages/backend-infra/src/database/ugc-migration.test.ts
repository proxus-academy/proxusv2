import { PgliteClient } from "@effect/sql-pglite"
import { sql } from "drizzle-orm"
import * as PgliteDrizzle from "drizzle-orm/effect-pglite"
import { migrate as migratePgSession } from "drizzle-orm/pg-core/effect/session"
import { readMigrationFiles } from "drizzle-orm/migrator"
import { Effect, Layer, Schema } from "effect"
import { describe, expect, test } from "vitest"
import { defaultMigrationsFolder } from "./paths.js"
import { migratePglite } from "./pglite.js"

const ugcTermsMigrationName = "20260822175540_bent_runaways"
const creatorId = "00000000-0000-4000-8000-000000000801"
const terminalId = "00000000-0000-4000-8000-000000000802"
const campaignId = "00000000-0000-4000-8000-000000000803"
const paymentId = "00000000-0000-4000-8000-000000000804"
const creatorData = '{"_tag":"CreatorData","profile":{"bio":"Existing profile"}}'
const terminalData = '{"_tag":"TerminalData","reason":"completed","previousStatus":"creator","previousCreatorData":{"_tag":"CreatorData","profile":{"bio":"Existing history"}}}'
const campaignData = '{"countries":["ES"],"formats":["review"],"currency":"EUR","tiers":[],"bonusRules":[]}'

const withDatabase = <A, E>(effect: Effect.Effect<A, E, PgliteClient.PgliteClient>) =>
  Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const context = yield* Layer.build(PgliteClient.layer())
    return yield* effect.pipe(Effect.provide(context))
  })))

const MigratedRows = Schema.Struct({
  rows: Schema.Array(Schema.Struct({
    creator_contracts: Schema.String,
    creator_acquisition: Schema.String,
    terminal_contracts: Schema.String,
    terminal_acquisition: Schema.String,
    history_available_until: Schema.String,
    campaign_currency: Schema.String,
    campaign_platforms: Schema.String,
    payment_recipient: Schema.String,
    payment_kind: Schema.String,
    payment_source_key: Schema.String,
    payment_currency: Schema.String,
    configuration_table: Schema.String,
  })),
})

describe("UGC agreement and incentive database migration", () => {
  test("upgrades populated UGC rows without losing their relationships", () => withDatabase(Effect.gen(function*() {
    const db = yield* PgliteDrizzle.makeWithDefaults()
    const migrations = readMigrationFiles({ migrationsFolder: defaultMigrationsFolder })
    const migrationIndex = migrations.findIndex(({ name }) => name === ugcTermsMigrationName)
    expect(migrationIndex).toBeGreaterThan(0)
    yield* migratePgSession(migrations.slice(0, migrationIndex), db._.session, {
      migrationsFolder: defaultMigrationsFolder,
    })

    yield* db.execute(sql`insert into ugc_users
      (id, auth_user_id, user_type, status, display_name, email, country_code, data, created_at, updated_at)
      values
      (${creatorId}::uuid, null, 'creator', 'creator', 'Creator', 'creator@example.com', 'ES',
        ${creatorData}::jsonb, now(), now()),
      (${terminalId}::uuid, null, 'creator', 'exited', 'Former creator', 'former@example.com', 'ES',
        ${terminalData}::jsonb, now(), now())`)
    yield* db.execute(sql`insert into ugc_campaigns
      (id, name, status, starts_at, submissions_close_at, reconciliation_ends_at, data, created_at, updated_at)
      values (${campaignId}::uuid, 'Existing campaign', 'published', now(), now() + interval '7 days', now() + interval '14 days',
        ${campaignData}::jsonb, now(), now())`)
    yield* db.execute(sql`insert into ugc_payments
      (id, creator_id, campaign_id, status, amount_cents, breakdown, paid_at, created_at, updated_at)
      values (${paymentId}::uuid, ${creatorId}::uuid, ${campaignId}::uuid, 'pending', 7200, '{}'::jsonb, null, now(), now())`)

    yield* migratePglite(defaultMigrationsFolder)

    const result = yield* db.execute(sql`
      select
        jsonb_typeof(creator.data->'contracts') as creator_contracts,
        creator.data->'acquisition'->>'source' as creator_acquisition,
        jsonb_typeof(terminal.data->'previousCreatorData'->'contracts') as terminal_contracts,
        terminal.data->'previousCreatorData'->'acquisition'->>'source' as terminal_acquisition,
        terminal.data->>'historyAvailableUntil' as history_available_until,
        campaign.data->>'currency' as campaign_currency,
        jsonb_typeof(campaign.data->'requiredPlatforms') as campaign_platforms,
        payment.recipient_user_id::text as payment_recipient,
        payment.kind as payment_kind,
        payment.source_key as payment_source_key,
        payment.currency as payment_currency,
        to_regclass('public.ugc_program_configurations')::text as configuration_table
      from ugc_users creator
      join ugc_users terminal on terminal.id = ${terminalId}::uuid
      join ugc_campaigns campaign on campaign.id = ${campaignId}::uuid
      join ugc_payments payment on payment.id = ${paymentId}::uuid
      where creator.id = ${creatorId}::uuid
    `)
    const decoded = yield* Schema.decodeUnknownEffect(MigratedRows)(result)
    expect(decoded.rows).toEqual([{
      creator_contracts: "array",
      creator_acquisition: "inbound",
      terminal_contracts: "array",
      terminal_acquisition: "inbound",
      history_available_until: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      campaign_currency: "EUR",
      campaign_platforms: "array",
      payment_recipient: creatorId,
      payment_kind: "creator_campaign",
      payment_source_key: `creator-campaign:${campaignId}:${creatorId}`,
      payment_currency: "EUR",
      configuration_table: "ugc_program_configurations",
    }])
  })), 20_000)
})
