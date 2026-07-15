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

export const SubjectNodeId = StudyNodeUuid.pipe(
  Schema.brand("SubjectNodeId"),
)
export type SubjectNodeId = typeof SubjectNodeId.Type
export const makeSubjectNodeId = Schema.decodeUnknownSync(SubjectNodeId)

export type AnyStudyNodeId =
  | CountryNodeId
  | StudyTypeNodeId
  | UniversityNodeId
  | DegreeNodeId
  | SubjectNodeId

export const StudyNodeKind = Schema.Literals([
  "country",
  "type",
  "university",
  "degree",
  "subject",
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

export class SubjectNode extends Schema.Class<SubjectNode>("SubjectNode")({
  ...StudyNodeFields,
  id: SubjectNodeId,
  kind: Schema.Literal("subject"),
}) {}

export const StudyNode = Schema.Union([
  CountryNode,
  StudyTypeNode,
  UniversityNode,
  DegreeNode,
  SubjectNode,
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

export class UniversitySubjectEdge extends Schema.TaggedClass<UniversitySubjectEdge>()(
  "UniversitySubjectEdge",
  {
    ...StudyEdgeFields,
    from: UniversityNodeId,
    to: SubjectNodeId,
  },
) {}

export class DegreeSubjectEdge extends Schema.TaggedClass<DegreeSubjectEdge>()(
  "DegreeSubjectEdge",
  {
    ...StudyEdgeFields,
    from: DegreeNodeId,
    to: SubjectNodeId,
  },
) {}

export const StudyEdge = Schema.Union([
  CountryTypeEdge,
  TypeUniversityEdge,
  UniversityDegreeEdge,
  UniversitySubjectEdge,
  DegreeSubjectEdge,
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

export class CreateSubjectInput extends Schema.TaggedClass<CreateSubjectInput>()(
  "CreateSubject",
  { name: Schema.NonEmptyString },
) {}

export const CreateStudyNodeInput = Schema.Union([
  CreateCountryInput,
  CreateStudyTypeInput,
  CreateUniversityInput,
  CreateDegreeInput,
  CreateSubjectInput,
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
          : Input extends CreateSubjectInput
            ? SubjectNode
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

export class CreateUniversitySubjectEdgeInput extends Schema.TaggedClass<CreateUniversitySubjectEdgeInput>()(
  "UniversitySubjectEdge",
  {
    from: UniversityNodeId,
    to: SubjectNodeId,
    position: Schema.optional(NonNegativeInt),
  },
) {}

export class CreateDegreeSubjectEdgeInput extends Schema.TaggedClass<CreateDegreeSubjectEdgeInput>()(
  "DegreeSubjectEdge",
  {
    from: DegreeNodeId,
    to: SubjectNodeId,
    position: Schema.optional(NonNegativeInt),
  },
) {}

export const CreateStudyEdgeInput = Schema.Union([
  CreateCountryTypeEdgeInput,
  CreateTypeUniversityEdgeInput,
  CreateUniversityDegreeEdgeInput,
  CreateUniversitySubjectEdgeInput,
  CreateDegreeSubjectEdgeInput,
])
export type CreateStudyEdgeInput = typeof CreateStudyEdgeInput.Type

export type CreatedStudyEdge<Input extends CreateStudyEdgeInput> = Extract<
  StudyEdge,
  { readonly _tag: Input["_tag"] }
>
