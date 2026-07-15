import { Schema } from "effect"

const StudyNodeUuid = Schema.String.pipe(
  Schema.check(Schema.isUUID(4)),
  Schema.brand("StudyNodeId"),
)

export const StudyNodeId = StudyNodeUuid
export type StudyNodeId = typeof StudyNodeId.Type
export const makeStudyNodeId = Schema.decodeUnknownSync(StudyNodeId)

export const CountryNodeId = StudyNodeUuid.pipe(
  Schema.brand("CountryNodeId"),
)
export type CountryNodeId = typeof CountryNodeId.Type
export const makeCountryNodeId = Schema.decodeUnknownSync(CountryNodeId)

export const StudyTypeNodeId = StudyNodeUuid.pipe(
  Schema.brand("StudyTypeNodeId"),
)
export type StudyTypeNodeId = typeof StudyTypeNodeId.Type
export const makeStudyTypeNodeId = Schema.decodeUnknownSync(StudyTypeNodeId)

export const UniversityNodeId = StudyNodeUuid.pipe(
  Schema.brand("UniversityNodeId"),
)
export type UniversityNodeId = typeof UniversityNodeId.Type
export const makeUniversityNodeId = Schema.decodeUnknownSync(UniversityNodeId)

export const DegreeNodeId = StudyNodeUuid.pipe(
  Schema.brand("DegreeNodeId"),
)
export type DegreeNodeId = typeof DegreeNodeId.Type
export const makeDegreeNodeId = Schema.decodeUnknownSync(DegreeNodeId)

export type AnyStudyNodeId =
  | CountryNodeId
  | StudyTypeNodeId
  | UniversityNodeId
  | DegreeNodeId

export const StudyNodeKind = Schema.Literals([
  "country",
  "type",
  "university",
  "degree",
])
export type StudyNodeKind = typeof StudyNodeKind.Type

export const StudyNodeStatus = Schema.Literals([
  "draft",
  "published",
  "archived",
])
export type StudyNodeStatus = typeof StudyNodeStatus.Type

export const NonNegativeInt = Schema.Number.pipe(
  Schema.check(Schema.isInt()),
  Schema.check(Schema.isGreaterThanOrEqualTo(0)),
)

const StudyNodeFields = {
  name: Schema.NonEmptyString,
  status: StudyNodeStatus,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}

export class CountryNode extends Schema.Class<CountryNode>("CountryNode")({
  ...StudyNodeFields,
  id: CountryNodeId,
  kind: Schema.Literal("country"),
}) {}

export class StudyTypeNode extends Schema.Class<StudyTypeNode>(
  "StudyTypeNode",
)({
  ...StudyNodeFields,
  id: StudyTypeNodeId,
  kind: Schema.Literal("type"),
}) {}

export class UniversityNode extends Schema.Class<UniversityNode>(
  "UniversityNode",
)({
  ...StudyNodeFields,
  id: UniversityNodeId,
  kind: Schema.Literal("university"),
}) {}

export class DegreeNode extends Schema.Class<DegreeNode>("DegreeNode")({
  ...StudyNodeFields,
  id: DegreeNodeId,
  kind: Schema.Literal("degree"),
}) {}

export const StudyNode = Schema.Union([
  CountryNode,
  StudyTypeNode,
  UniversityNode,
  DegreeNode,
])
export type StudyNode = typeof StudyNode.Type

export type StudyNodeOfId<Id> = Extract<
  StudyNode,
  { readonly id: Id }
>

export const StudyEdgeId = Schema.String.pipe(
  Schema.check(Schema.isUUID(4)),
  Schema.brand("StudyEdgeId"),
)
export type StudyEdgeId = typeof StudyEdgeId.Type
export const makeStudyEdgeId = Schema.decodeUnknownSync(StudyEdgeId)

const StudyEdgeFields = {
  id: StudyEdgeId,
  position: NonNegativeInt,
}

export class CountryTypeEdge extends Schema.TaggedClass<CountryTypeEdge>()(
  "CountryTypeEdge",
  {
    ...StudyEdgeFields,
    from: CountryNodeId,
    to: StudyTypeNodeId,
  },
) {}

export class TypeUniversityEdge extends Schema.TaggedClass<TypeUniversityEdge>()(
  "TypeUniversityEdge",
  {
    ...StudyEdgeFields,
    from: StudyTypeNodeId,
    to: UniversityNodeId,
  },
) {}

export class UniversityDegreeEdge extends Schema.TaggedClass<UniversityDegreeEdge>()(
  "UniversityDegreeEdge",
  {
    ...StudyEdgeFields,
    from: UniversityNodeId,
    to: DegreeNodeId,
  },
) {}

export const StudyEdge = Schema.Union([
  CountryTypeEdge,
  TypeUniversityEdge,
  UniversityDegreeEdge,
])
export type StudyEdge = typeof StudyEdge.Type

export type StudyEdgesFromId<Id> = Extract<
  StudyEdge,
  { readonly from: Id }
>

export type StudyEdgesToId<Id> = Extract<
  StudyEdge,
  { readonly to: Id }
>

export type StudyNodeTargetsOfId<Id> = StudyNodeOfId<
  StudyEdgesFromId<Id>["to"]
>

export type StudyNodeSourcesOfId<Id> = StudyNodeOfId<
  StudyEdgesToId<Id>["from"]
>

export class CreateCountryInput extends Schema.TaggedClass<CreateCountryInput>()(
  "CreateCountry",
  { name: Schema.NonEmptyString },
) {}

export class CreateStudyTypeInput extends Schema.TaggedClass<CreateStudyTypeInput>()(
  "CreateStudyType",
  { name: Schema.NonEmptyString },
) {}

export class CreateUniversityInput extends Schema.TaggedClass<CreateUniversityInput>()(
  "CreateUniversity",
  { name: Schema.NonEmptyString },
) {}

export class CreateDegreeInput extends Schema.TaggedClass<CreateDegreeInput>()(
  "CreateDegree",
  { name: Schema.NonEmptyString },
) {}

export const CreateStudyNodeInput = Schema.Union([
  CreateCountryInput,
  CreateStudyTypeInput,
  CreateUniversityInput,
  CreateDegreeInput,
])
export type CreateStudyNodeInput = typeof CreateStudyNodeInput.Type

export type CreatedStudyNode<Input extends CreateStudyNodeInput> =
  Input extends CreateCountryInput
    ? CountryNode
    : Input extends CreateStudyTypeInput
      ? StudyTypeNode
      : Input extends CreateUniversityInput
        ? UniversityNode
        : Input extends CreateDegreeInput
          ? DegreeNode
          : never

export class CreateCountryTypeEdgeInput extends Schema.TaggedClass<CreateCountryTypeEdgeInput>()(
  "CountryTypeEdge",
  {
    from: CountryNodeId,
    to: StudyTypeNodeId,
    position: Schema.optional(NonNegativeInt),
  },
) {}

export class CreateTypeUniversityEdgeInput extends Schema.TaggedClass<CreateTypeUniversityEdgeInput>()(
  "TypeUniversityEdge",
  {
    from: StudyTypeNodeId,
    to: UniversityNodeId,
    position: Schema.optional(NonNegativeInt),
  },
) {}

export class CreateUniversityDegreeEdgeInput extends Schema.TaggedClass<CreateUniversityDegreeEdgeInput>()(
  "UniversityDegreeEdge",
  {
    from: UniversityNodeId,
    to: DegreeNodeId,
    position: Schema.optional(NonNegativeInt),
  },
) {}

export const CreateStudyEdgeInput = Schema.Union([
  CreateCountryTypeEdgeInput,
  CreateTypeUniversityEdgeInput,
  CreateUniversityDegreeEdgeInput,
])
export type CreateStudyEdgeInput = typeof CreateStudyEdgeInput.Type

export type CreatedStudyEdge<Input extends CreateStudyEdgeInput> = Extract<
  StudyEdge,
  { readonly _tag: Input["_tag"] }
>
