import { LessonPluginManifest } from "@proxus/shared/lesson-plugins"
import { Effect, Layer, Option, Schema } from "effect"
import {
  DuplicateLessonTypeId,
  IncompatibleLessonPluginVersion,
  LessonPluginManifestInvalid,
  LessonPluginRegistry,
  type LessonPluginHostContract,
  UnsupportedLessonPluginCapability,
} from "./service.js"

const versionParts = (version: string): readonly [number, number, number] => {
  const [major = Number.NaN, minor = Number.NaN, patch = Number.NaN] = version
    .split(".")
    .map(Number)
  return [major, minor, patch]
}

const isHostCompatible = (hostVersion: string, minimumHostVersion: string): boolean => {
  const host = versionParts(hostVersion)
  const minimum = versionParts(minimumHostVersion)
  if (host[0] !== minimum[0]) return false
  return host[1] > minimum[1] ||
    (host[1] === minimum[1] && host[2] >= minimum[2])
}

/**
 * Builds one immutable registry from an explicit plugin list. Validation occurs
 * while the Layer is constructed, before the service can be used.
 */
export const staticLessonPluginRegistryLayer = (
  host: LessonPluginHostContract,
  candidates: ReadonlyArray<unknown>,
) => Layer.effect(
  LessonPluginRegistry,
  Effect.gen(function*() {
    const registry = new Map<string, LessonPluginManifest>()

    for (const [manifestIndex, candidate] of candidates.entries()) {
      const manifest = yield* Schema.decodeUnknownEffect(LessonPluginManifest)(candidate).pipe(
        Effect.mapError(() => new LessonPluginManifestInvalid({ manifestIndex })),
      )

      if (registry.has(manifest.lessonTypeId)) {
        return yield* new DuplicateLessonTypeId({ lessonTypeId: manifest.lessonTypeId })
      }
      if (!isHostCompatible(host.version, manifest.minimumHostVersion)) {
        return yield* new IncompatibleLessonPluginVersion({
          lessonTypeId: manifest.lessonTypeId,
          hostVersion: host.version,
          minimumHostVersion: manifest.minimumHostVersion,
        })
      }
      for (const capability of manifest.capabilities) {
        if (!host.capabilities.has(capability)) {
          return yield* new UnsupportedLessonPluginCapability({
            lessonTypeId: manifest.lessonTypeId,
            capability,
          })
        }
      }
      registry.set(manifest.lessonTypeId, manifest)
    }

    return LessonPluginRegistry.of({
      lookup: Effect.fn("LessonPluginRegistry.lookup")((lessonTypeId) =>
        Effect.succeed(Option.fromUndefinedOr(registry.get(lessonTypeId)))),
      manifests: Effect.fn("LessonPluginRegistry.manifests")(() =>
        Effect.succeed(Array.from(registry.values()))),
    })
  }),
)
