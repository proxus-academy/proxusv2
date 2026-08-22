import { UgcOptimisticConflict, UgcRepository, UgcRepositoryError } from "@proxus/backend-domain/ugc-management"
import {
  UgcCampaign,
  UgcGroup,
  UgcGroupMember,
  UgcMeet,
  UgcPayment,
  UgcUser,
  UgcVideo,
  UgcVideoData,
  type UgcCampaign as UgcCampaignType,
  type UgcGroup as UgcGroupType,
  type UgcGroupMember as UgcGroupMemberType,
  type UgcMeet as UgcMeetType,
  type UgcPayment as UgcPaymentType,
  type UgcUser as UgcUserType,
  type UgcVideo as UgcVideoType,
  type UgcVideoData as UgcVideoDataType,
} from "@proxus/shared/ugc-management"
import { and, asc, eq } from "drizzle-orm"
import type { EffectPgQueryEffectHKT, EffectPgQueryResultHKT } from "drizzle-orm/effect-pglite"
import type { PgEffectDatabase } from "drizzle-orm/pg-core/effect"
import { DateTime, Effect, Option, Schema } from "effect"
import {
  ugcCampaigns,
  ugcGroupMembers,
  ugcGroups,
  ugcMeets,
  ugcPayments,
  ugcUsers,
  ugcVideoData,
  ugcVideos,
  type UgcCampaignRow,
  type UgcGroupMemberRow,
  type UgcGroupRow,
  type UgcMeetRow,
  type UgcPaymentRow,
  type UgcUserRow,
  type UgcVideoDataRow,
  type UgcVideoRow,
} from "../../database/schema.js"

type Database = PgEffectDatabase<EffectPgQueryEffectHKT, EffectPgQueryResultHKT>
const repositoryError = (operation: string, cause: unknown) => new UgcRepositoryError({ operation, cause })
const fail = (operation: string) => Effect.mapError((cause: unknown) => repositoryError(operation, cause))
const failWrite = (operation: string) => Effect.mapError((cause: unknown) => cause instanceof UgcOptimisticConflict ? cause : repositoryError(operation, cause))
const iso = (value: Date) => value.toISOString()
const date = (value: string) => DateTime.toDateUtc(DateTime.makeUnsafe(value))

const decodeUser = (row: UgcUserRow) => Schema.decodeUnknownEffect(UgcUser)({ ...row, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) })
const decodeCampaign = (row: UgcCampaignRow) => Schema.decodeUnknownEffect(UgcCampaign)({ ...row, startsAt: iso(row.startsAt), submissionsCloseAt: iso(row.submissionsCloseAt), reconciliationEndsAt: iso(row.reconciliationEndsAt), createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) })
const decodeGroup = (row: UgcGroupRow) => Schema.decodeUnknownEffect(UgcGroup)({ ...row, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) })
const decodeMembership = (row: UgcGroupMemberRow) => Schema.decodeUnknownEffect(UgcGroupMember)({ ...row, joinedAt: iso(row.joinedAt), completedAt: row.completedAt === null ? null : iso(row.completedAt) })
const decodeMeet = (row: UgcMeetRow) => Schema.decodeUnknownEffect(UgcMeet)({ ...row, startsAt: iso(row.startsAt), createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) })
const decodeVideo = (row: UgcVideoRow) => Schema.decodeUnknownEffect(UgcVideo)({ ...row, submittedAt: iso(row.submittedAt), reviewedAt: row.reviewedAt === null ? null : iso(row.reviewedAt), createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) })
const decodeVideoData = (row: UgcVideoDataRow) => Schema.decodeUnknownEffect(UgcVideoData)({ ...row, capturedAt: iso(row.capturedAt) })
const decodePayment = (row: UgcPaymentRow) => Schema.decodeUnknownEffect(UgcPayment)({ ...row, paidAt: row.paidAt === null ? null : iso(row.paidAt), createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) })

const userValues = (value: UgcUserType): typeof ugcUsers.$inferInsert => ({ ...value, dataVersion: 1, createdAt: date(value.createdAt), updatedAt: date(value.updatedAt) })
const campaignValues = (value: UgcCampaignType): typeof ugcCampaigns.$inferInsert => ({ ...value, dataVersion: 1, startsAt: date(value.startsAt), submissionsCloseAt: date(value.submissionsCloseAt), reconciliationEndsAt: date(value.reconciliationEndsAt), createdAt: date(value.createdAt), updatedAt: date(value.updatedAt) })
const groupValues = (value: UgcGroupType): typeof ugcGroups.$inferInsert => ({ ...value, createdAt: date(value.createdAt), updatedAt: date(value.updatedAt) })
const membershipValues = (value: UgcGroupMemberType): typeof ugcGroupMembers.$inferInsert => ({ ...value, joinedAt: date(value.joinedAt), completedAt: value.completedAt === null ? null : date(value.completedAt) })
const meetValues = (value: UgcMeetType): typeof ugcMeets.$inferInsert => ({ ...value, startsAt: date(value.startsAt), createdAt: date(value.createdAt), updatedAt: date(value.updatedAt) })
const videoValues = (value: UgcVideoType): typeof ugcVideos.$inferInsert => ({ ...value, submittedAt: date(value.submittedAt), reviewedAt: value.reviewedAt === null ? null : date(value.reviewedAt), createdAt: date(value.createdAt), updatedAt: date(value.updatedAt) })
const videoDataValues = (value: UgcVideoDataType): typeof ugcVideoData.$inferInsert => ({ ...value, capturedAt: date(value.capturedAt) })
const paymentValues = (value: UgcPaymentType): typeof ugcPayments.$inferInsert => ({ ...value, paidAt: value.paidAt === null ? null : date(value.paidAt), createdAt: date(value.createdAt), updatedAt: date(value.updatedAt) })

export const makeUgcRepositoryDrizzle = (db: Database): UgcRepository["Service"] => UgcRepository.of({
  transaction: (use) => db.transaction((transaction) => use(makeUgcRepositoryDrizzle(transaction))).pipe(fail("transaction")),
  users: {
    list: () => db.select().from(ugcUsers).orderBy(asc(ugcUsers.createdAt), asc(ugcUsers.id)).pipe(Effect.flatMap((rows) => Effect.forEach(rows, decodeUser)), fail("users.list")),
    findById: (id) => db.select().from(ugcUsers).where(eq(ugcUsers.id, id)).limit(1).pipe(Effect.flatMap((rows) => Option.match(Option.fromIterable(rows), { onNone: () => Effect.succeed(Option.none()), onSome: (row) => decodeUser(row).pipe(Effect.map(Option.some)) })), fail("users.findById")),
    findByAuthUserId: (id) => db.select().from(ugcUsers).where(eq(ugcUsers.authUserId, id)).limit(1).pipe(Effect.flatMap((rows) => Option.match(Option.fromIterable(rows), { onNone: () => Effect.succeed(Option.none()), onSome: (row) => decodeUser(row).pipe(Effect.map(Option.some)) })), fail("users.findByAuthUserId")),
    findByEmail: (email) => db.select().from(ugcUsers).where(eq(ugcUsers.email, email.toLowerCase())).limit(1).pipe(Effect.flatMap((rows) => Option.match(Option.fromIterable(rows), { onNone: () => Effect.succeed(Option.none()), onSome: (row) => decodeUser(row).pipe(Effect.map(Option.some)) })), fail("users.findByEmail")),
    insert: (value) => db.insert(ugcUsers).values(userValues(value)).pipe(Effect.asVoid, fail("users.insert")),
    update: (value, expectedVersion) => db.update(ugcUsers).set(userValues(value)).where(and(eq(ugcUsers.id, value.id), eq(ugcUsers.version, expectedVersion))).returning({ id: ugcUsers.id }).pipe(Effect.flatMap((rows) => rows.length === 1 ? Effect.void : Effect.fail(new UgcOptimisticConflict({ entity: "ugc_user", id: value.id }))), failWrite("users.update")),
  },
  campaigns: {
    list: () => db.select().from(ugcCampaigns).orderBy(asc(ugcCampaigns.startsAt), asc(ugcCampaigns.id)).pipe(Effect.flatMap((rows) => Effect.forEach(rows, decodeCampaign)), fail("campaigns.list")),
    findById: (id) => db.select().from(ugcCampaigns).where(eq(ugcCampaigns.id, id)).limit(1).pipe(Effect.flatMap((rows) => Option.match(Option.fromIterable(rows), { onNone: () => Effect.succeed(Option.none()), onSome: (row) => decodeCampaign(row).pipe(Effect.map(Option.some)) })), fail("campaigns.findById")),
    insert: (value) => db.insert(ugcCampaigns).values(campaignValues(value)).pipe(Effect.asVoid, fail("campaigns.insert")),
    update: (value, expectedVersion) => db.update(ugcCampaigns).set(campaignValues(value)).where(and(eq(ugcCampaigns.id, value.id), eq(ugcCampaigns.version, expectedVersion))).returning({ id: ugcCampaigns.id }).pipe(Effect.flatMap((rows) => rows.length === 1 ? Effect.void : Effect.fail(new UgcOptimisticConflict({ entity: "campaign", id: value.id }))), failWrite("campaigns.update")),
  },
  groups: {
    list: () => db.select().from(ugcGroups).orderBy(asc(ugcGroups.name), asc(ugcGroups.id)).pipe(Effect.flatMap((rows) => Effect.forEach(rows, decodeGroup)), fail("groups.list")),
    findById: (id) => db.select().from(ugcGroups).where(eq(ugcGroups.id, id)).limit(1).pipe(Effect.flatMap((rows) => Option.match(Option.fromIterable(rows), { onNone: () => Effect.succeed(Option.none()), onSome: (row) => decodeGroup(row).pipe(Effect.map(Option.some)) })), fail("groups.findById")),
    insert: (value) => db.insert(ugcGroups).values(groupValues(value)).pipe(Effect.asVoid, fail("groups.insert")),
    update: (value) => db.update(ugcGroups).set(groupValues(value)).where(eq(ugcGroups.id, value.id)).pipe(Effect.asVoid, fail("groups.update")),
  },
  memberships: {
    list: () => db.select().from(ugcGroupMembers).orderBy(asc(ugcGroupMembers.joinedAt), asc(ugcGroupMembers.id)).pipe(Effect.flatMap((rows) => Effect.forEach(rows, decodeMembership)), fail("memberships.list")),
    insert: (value) => db.insert(ugcGroupMembers).values(membershipValues(value)).pipe(Effect.asVoid, fail("memberships.insert")),
    update: (value) => db.update(ugcGroupMembers).set(membershipValues(value)).where(eq(ugcGroupMembers.id, value.id)).pipe(Effect.asVoid, fail("memberships.update")),
  },
  meets: {
    list: () => db.select().from(ugcMeets).orderBy(asc(ugcMeets.startsAt), asc(ugcMeets.id)).pipe(Effect.flatMap((rows) => Effect.forEach(rows, decodeMeet)), fail("meets.list")),
    findById: (id) => db.select().from(ugcMeets).where(eq(ugcMeets.id, id)).limit(1).pipe(Effect.flatMap((rows) => Option.match(Option.fromIterable(rows), { onNone: () => Effect.succeed(Option.none()), onSome: (row) => decodeMeet(row).pipe(Effect.map(Option.some)) })), fail("meets.findById")),
    insert: (value) => db.insert(ugcMeets).values(meetValues(value)).pipe(Effect.asVoid, fail("meets.insert")),
    update: (value) => db.update(ugcMeets).set(meetValues(value)).where(eq(ugcMeets.id, value.id)).pipe(Effect.asVoid, fail("meets.update")),
  },
  videos: {
    list: () => db.select().from(ugcVideos).orderBy(asc(ugcVideos.submittedAt), asc(ugcVideos.id)).pipe(Effect.flatMap((rows) => Effect.forEach(rows, decodeVideo)), fail("videos.list")),
    findById: (id) => db.select().from(ugcVideos).where(eq(ugcVideos.id, id)).limit(1).pipe(Effect.flatMap((rows) => Option.match(Option.fromIterable(rows), { onNone: () => Effect.succeed(Option.none()), onSome: (row) => decodeVideo(row).pipe(Effect.map(Option.some)) })), fail("videos.findById")),
    insert: (value) => db.insert(ugcVideos).values(videoValues(value)).pipe(Effect.asVoid, fail("videos.insert")),
    update: (value) => db.update(ugcVideos).set(videoValues(value)).where(eq(ugcVideos.id, value.id)).pipe(Effect.asVoid, fail("videos.update")),
  },
  videoData: {
    list: () => db.select().from(ugcVideoData).orderBy(asc(ugcVideoData.capturedAt), asc(ugcVideoData.id)).pipe(Effect.flatMap((rows) => Effect.forEach(rows, decodeVideoData)), fail("videoData.list")),
    insert: (value) => db.insert(ugcVideoData).values(videoDataValues(value)).pipe(Effect.asVoid, fail("videoData.insert")),
  },
  payments: {
    list: () => db.select().from(ugcPayments).orderBy(asc(ugcPayments.createdAt), asc(ugcPayments.id)).pipe(Effect.flatMap((rows) => Effect.forEach(rows, decodePayment)), fail("payments.list")),
    findById: (id) => db.select().from(ugcPayments).where(eq(ugcPayments.id, id)).limit(1).pipe(Effect.flatMap((rows) => Option.match(Option.fromIterable(rows), { onNone: () => Effect.succeed(Option.none()), onSome: (row) => decodePayment(row).pipe(Effect.map(Option.some)) })), fail("payments.findById")),
    insert: (value) => db.insert(ugcPayments).values(paymentValues(value)).pipe(Effect.asVoid, fail("payments.insert")),
    update: (value) => db.update(ugcPayments).set(paymentValues(value)).where(eq(ugcPayments.id, value.id)).pipe(Effect.asVoid, fail("payments.update")),
  },
})
