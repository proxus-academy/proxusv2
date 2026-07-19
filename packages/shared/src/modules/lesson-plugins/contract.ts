import { Schema } from "effect"

/** Stable identifier used by persisted lesson content and plugin manifests. */
export const LessonTypeId = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)),
  Schema.brand("LessonTypeId"),
)
export type LessonTypeId = typeof LessonTypeId.Type
export const makeLessonTypeId = Schema.decodeUnknownSync(LessonTypeId)

/** Portable semantic version. Pre-release/build versions are intentionally excluded in v1. */
export const LessonPluginVersion = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/)),
)
export type LessonPluginVersion = typeof LessonPluginVersion.Type

export const LessonPluginManifestVersion = Schema.Literal(1)
export type LessonPluginManifestVersion = typeof LessonPluginManifestVersion.Type

/** Host facilities a lesson implementation may explicitly require. */
export const LessonPluginCapability = Schema.Literals([
  "attempt-state",
  "completion-reporting",
])
export type LessonPluginCapability = typeof LessonPluginCapability.Type

/**
 * Wire contract exchanged across the host/plugin boundary. It describes a
 * lesson implementation; executable code and runtime configuration are not wire.
 */
export class LessonPluginManifest extends Schema.Class<LessonPluginManifest>(
  "LessonPluginManifest",
)({
  manifestVersion: LessonPluginManifestVersion,
  lessonTypeId: LessonTypeId,
  pluginVersion: LessonPluginVersion,
  minimumHostVersion: LessonPluginVersion,
  capabilities: Schema.Array(LessonPluginCapability),
}) {}
