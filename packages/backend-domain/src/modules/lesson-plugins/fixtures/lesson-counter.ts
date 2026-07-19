import {
  LessonPluginManifest,
  makeLessonTypeId,
} from "@proxus/shared/lesson-plugins"

/** Explicit composition-root fixture; importing it performs no registration. */
export const lessonCounterManifest = new LessonPluginManifest({
  manifestVersion: 1,
  lessonTypeId: makeLessonTypeId("com.proxus.lesson-counter"),
  pluginVersion: "1.0.0",
  minimumHostVersion: "1.0.0",
  capabilities: ["attempt-state", "completion-reporting"],
})
