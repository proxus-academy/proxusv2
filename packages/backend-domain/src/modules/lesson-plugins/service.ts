import type {
  LessonPluginCapability,
  LessonPluginManifest,
  LessonPluginVersion,
  LessonTypeId,
} from "@proxus/shared/lesson-plugins"
import { Context, Effect, Option, Schema } from "effect"

export class LessonPluginManifestInvalid extends Schema.TaggedErrorClass<LessonPluginManifestInvalid>()(
  "LessonPluginManifestInvalid",
  { manifestIndex: Schema.Number },
) {}

export class DuplicateLessonTypeId extends Schema.TaggedErrorClass<DuplicateLessonTypeId>()(
  "DuplicateLessonTypeId",
  { lessonTypeId: Schema.String },
) {}

export class IncompatibleLessonPluginVersion extends Schema.TaggedErrorClass<IncompatibleLessonPluginVersion>()(
  "IncompatibleLessonPluginVersion",
  {
    lessonTypeId: Schema.String,
    hostVersion: Schema.String,
    minimumHostVersion: Schema.String,
  },
) {}

export class UnsupportedLessonPluginCapability extends Schema.TaggedErrorClass<UnsupportedLessonPluginCapability>()(
  "UnsupportedLessonPluginCapability",
  { lessonTypeId: Schema.String, capability: Schema.String },
) {}

export interface LessonPluginHostContract {
  readonly version: LessonPluginVersion
  readonly capabilities: ReadonlySet<LessonPluginCapability>
}

export class LessonPluginRegistry extends Context.Service<LessonPluginRegistry, {
  readonly lookup: (lessonTypeId: LessonTypeId) => Effect.Effect<Option.Option<LessonPluginManifest>>
  readonly manifests: () => Effect.Effect<ReadonlyArray<LessonPluginManifest>>
}>()("@proxus/backend-domain/modules/lesson-plugins/service/LessonPluginRegistry") {}
