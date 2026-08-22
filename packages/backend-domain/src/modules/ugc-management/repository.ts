import type {
  UgcCampaign,
  UgcCampaignId,
  UgcGroup,
  UgcGroupId,
  UgcGroupMember,
  UgcMeet,
  UgcMeetId,
  UgcPayment,
  UgcPaymentId,
  UgcUser,
  UgcProgramConfiguration,
  UgcUserId,
  UgcVideo,
  UgcVideoData,
  UgcVideoId,
} from "@proxus/shared/ugc-management"
import { Context, Data, Effect, Exit, Layer, Option, Ref } from "effect"

export class UgcRepositoryError extends Data.TaggedError("UgcRepositoryError")<{
  readonly operation: string
  readonly cause?: unknown
}> {}

export class UgcOptimisticConflict extends Data.TaggedError("UgcOptimisticConflict")<{
  readonly entity: string
  readonly id: string
}> {}

type WriteError = UgcRepositoryError | UgcOptimisticConflict

export interface UgcRepositoryContract {
  readonly transaction: <A, E, R>(use: (repository: UgcRepositoryContract) => Effect.Effect<A, E, R>) => Effect.Effect<A, E | UgcRepositoryError, R>
  readonly users: {
    readonly list: () => Effect.Effect<ReadonlyArray<UgcUser>, UgcRepositoryError>
    readonly findById: (id: UgcUserId) => Effect.Effect<Option.Option<UgcUser>, UgcRepositoryError>
    readonly findByAuthUserId: (id: string) => Effect.Effect<Option.Option<UgcUser>, UgcRepositoryError>
    readonly findByEmail: (email: string) => Effect.Effect<Option.Option<UgcUser>, UgcRepositoryError>
    readonly insert: (user: UgcUser) => Effect.Effect<void, UgcRepositoryError>
    readonly update: (user: UgcUser, expectedVersion: number) => Effect.Effect<void, WriteError>
  }
  readonly campaigns: {
    readonly list: () => Effect.Effect<ReadonlyArray<UgcCampaign>, UgcRepositoryError>
    readonly findById: (id: UgcCampaignId) => Effect.Effect<Option.Option<UgcCampaign>, UgcRepositoryError>
    readonly insert: (campaign: UgcCampaign) => Effect.Effect<void, UgcRepositoryError>
    readonly update: (campaign: UgcCampaign, expectedVersion: number) => Effect.Effect<void, WriteError>
  }
  readonly groups: {
    readonly list: () => Effect.Effect<ReadonlyArray<UgcGroup>, UgcRepositoryError>
    readonly findById: (id: UgcGroupId) => Effect.Effect<Option.Option<UgcGroup>, UgcRepositoryError>
    readonly insert: (group: UgcGroup) => Effect.Effect<void, UgcRepositoryError>
    readonly update: (group: UgcGroup) => Effect.Effect<void, UgcRepositoryError>
  }
  readonly memberships: {
    readonly list: () => Effect.Effect<ReadonlyArray<UgcGroupMember>, UgcRepositoryError>
    readonly insert: (membership: UgcGroupMember) => Effect.Effect<void, UgcRepositoryError>
    readonly update: (membership: UgcGroupMember) => Effect.Effect<void, UgcRepositoryError>
  }
  readonly meets: {
    readonly list: () => Effect.Effect<ReadonlyArray<UgcMeet>, UgcRepositoryError>
    readonly findById: (id: UgcMeetId) => Effect.Effect<Option.Option<UgcMeet>, UgcRepositoryError>
    readonly insert: (meet: UgcMeet) => Effect.Effect<void, UgcRepositoryError>
    readonly update: (meet: UgcMeet) => Effect.Effect<void, UgcRepositoryError>
  }
  readonly videos: {
    readonly list: () => Effect.Effect<ReadonlyArray<UgcVideo>, UgcRepositoryError>
    readonly findById: (id: UgcVideoId) => Effect.Effect<Option.Option<UgcVideo>, UgcRepositoryError>
    readonly insert: (video: UgcVideo) => Effect.Effect<void, UgcRepositoryError>
    readonly update: (video: UgcVideo) => Effect.Effect<void, UgcRepositoryError>
  }
  readonly videoData: {
    readonly list: () => Effect.Effect<ReadonlyArray<UgcVideoData>, UgcRepositoryError>
    readonly insert: (data: UgcVideoData) => Effect.Effect<void, UgcRepositoryError>
  }
  readonly payments: {
    readonly list: () => Effect.Effect<ReadonlyArray<UgcPayment>, UgcRepositoryError>
    readonly findById: (id: UgcPaymentId) => Effect.Effect<Option.Option<UgcPayment>, UgcRepositoryError>
    readonly insert: (payment: UgcPayment) => Effect.Effect<void, UgcRepositoryError>
    readonly update: (payment: UgcPayment) => Effect.Effect<void, UgcRepositoryError>
  }
  readonly programConfigurations: {
    readonly list: () => Effect.Effect<ReadonlyArray<UgcProgramConfiguration>, UgcRepositoryError>
    readonly findByMarket: (market: string) => Effect.Effect<Option.Option<UgcProgramConfiguration>, UgcRepositoryError>
    readonly insert: (configuration: UgcProgramConfiguration) => Effect.Effect<void, UgcRepositoryError>
    readonly update: (configuration: UgcProgramConfiguration, expectedVersion: number) => Effect.Effect<void, WriteError>
  }
}

export class UgcRepository extends Context.Service<UgcRepository, UgcRepositoryContract>()(
  "@proxus/backend-domain/modules/ugc-management/repository/UgcRepository",
) {}

export interface UgcMemoryState {
  readonly users: ReadonlyArray<UgcUser>
  readonly campaigns: ReadonlyArray<UgcCampaign>
  readonly groups: ReadonlyArray<UgcGroup>
  readonly memberships: ReadonlyArray<UgcGroupMember>
  readonly meets: ReadonlyArray<UgcMeet>
  readonly videos: ReadonlyArray<UgcVideo>
  readonly videoData: ReadonlyArray<UgcVideoData>
  readonly payments: ReadonlyArray<UgcPayment>
  readonly programConfigurations: ReadonlyArray<UgcProgramConfiguration>
}

export const emptyUgcMemoryState: UgcMemoryState = {
  users: [], campaigns: [], groups: [], memberships: [], meets: [], videos: [], videoData: [], payments: [], programConfigurations: [],
}

const replaceById = <A extends { readonly id: string }>(items: ReadonlyArray<A>, value: A) =>
  items.map((item) => item.id === value.id ? value : item)

export const makeMemoryUgcRepository = (initial: UgcMemoryState = emptyUgcMemoryState) =>
  Layer.effect(UgcRepository, Effect.gen(function*() {
    const state = yield* Ref.make(initial)
    const list = <K extends keyof UgcMemoryState>(key: K) => Ref.get(state).pipe(Effect.map((all) => all[key]))
    const insert = <K extends keyof UgcMemoryState>(key: K, value: UgcMemoryState[K][number]) =>
      Ref.update(state, (all) => ({ ...all, [key]: [...all[key], value] }))
    const update = <A extends { readonly id: string }>(
      select: (all: UgcMemoryState) => ReadonlyArray<A>,
      replace: (all: UgcMemoryState, values: ReadonlyArray<A>) => UgcMemoryState,
      value: A,
    ) => Ref.update(state, (all) => replace(all, replaceById(select(all), value)))
    const findIn = <A extends { readonly id: string }>(items: ReadonlyArray<A>, id: string): Option.Option<A> =>
      Option.fromNullishOr(items.find((item) => item.id === id))

    const repository: UgcRepositoryContract = {
      transaction: (use) => Ref.get(state).pipe(Effect.flatMap((snapshot) =>
        Effect.suspend(() => use(repository)).pipe(
          Effect.onExit((exit) => Exit.isSuccess(exit) ? Effect.void : Ref.set(state, snapshot)),
        )),
      ),
      users: {
        list: () => list("users"),
        findById: (id) => list("users").pipe(Effect.map((items) => findIn(items, id))),
        findByAuthUserId: (id) => list("users").pipe(Effect.map((items) => Option.fromNullishOr(items.find((item) => item.authUserId === id)))),
        findByEmail: (email) => list("users").pipe(Effect.map((items) => Option.fromNullishOr(items.find((item) => item.email.toLowerCase() === email.toLowerCase())))),
        insert: (value) => insert("users", value),
        update: (value, expectedVersion) => Ref.get(state).pipe(Effect.flatMap((all) => {
          const current = all.users.find((item) => item.id === value.id)
          return current?.version === expectedVersion
            ? update((state) => state.users, (state, users) => ({ ...state, users }), value)
            : Effect.fail(new UgcOptimisticConflict({ entity: "ugc_user", id: value.id }))
        })),
      },
      campaigns: {
        list: () => list("campaigns"),
        findById: (id) => list("campaigns").pipe(Effect.map((items) => findIn(items, id))),
        insert: (value) => insert("campaigns", value),
        update: (value, expectedVersion) => Ref.get(state).pipe(Effect.flatMap((all) => {
          const current = all.campaigns.find((item) => item.id === value.id)
          return current?.version === expectedVersion
            ? update((state) => state.campaigns, (state, campaigns) => ({ ...state, campaigns }), value)
            : Effect.fail(new UgcOptimisticConflict({ entity: "campaign", id: value.id }))
        })),
      },
      groups: { list: () => list("groups"), findById: (id) => list("groups").pipe(Effect.map((items) => findIn(items, id))), insert: (value) => insert("groups", value), update: (value) => update((state) => state.groups, (state, groups) => ({ ...state, groups }), value) },
      memberships: { list: () => list("memberships"), insert: (value) => insert("memberships", value), update: (value) => update((state) => state.memberships, (state, memberships) => ({ ...state, memberships }), value) },
      meets: { list: () => list("meets"), findById: (id) => list("meets").pipe(Effect.map((items) => findIn(items, id))), insert: (value) => insert("meets", value), update: (value) => update((state) => state.meets, (state, meets) => ({ ...state, meets }), value) },
      videos: { list: () => list("videos"), findById: (id) => list("videos").pipe(Effect.map((items) => findIn(items, id))), insert: (value) => insert("videos", value), update: (value) => update((state) => state.videos, (state, videos) => ({ ...state, videos }), value) },
      videoData: { list: () => list("videoData"), insert: (value) => insert("videoData", value) },
      payments: { list: () => list("payments"), findById: (id) => list("payments").pipe(Effect.map((items) => findIn(items, id))), insert: (value) => insert("payments", value), update: (value) => update((state) => state.payments, (state, payments) => ({ ...state, payments }), value) },
      programConfigurations: {
        list: () => list("programConfigurations"),
        findByMarket: (market) => list("programConfigurations").pipe(Effect.map((items) => Option.fromNullishOr(items.find((item) => item.market === market)))),
        insert: (value) => insert("programConfigurations", value),
        update: (value, expectedVersion) => Ref.get(state).pipe(Effect.flatMap((all) => {
          const current = all.programConfigurations.find((item) => item.market === value.market)
          return current?.version === expectedVersion
            ? Ref.update(state, (currentState) => ({
              ...currentState,
              programConfigurations: currentState.programConfigurations.map((item) => item.market === value.market ? value : item),
            }))
            : Effect.fail(new UgcOptimisticConflict({ entity: "ugc_program_configuration", id: value.market }))
        })),
      },
    }
    return UgcRepository.of(repository)
  }))
