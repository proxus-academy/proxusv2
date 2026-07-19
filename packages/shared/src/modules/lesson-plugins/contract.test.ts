import { Schema } from "effect"
import { describe, expect, test } from "vitest"
import { LessonPluginManifest, makeLessonTypeId } from "./contract.js"

describe("LessonPluginManifest", () => {
  test("decodes the v1 wire contract and brands its lesson type", () => {
    const manifest = Schema.decodeUnknownSync(LessonPluginManifest)({
      manifestVersion: 1,
      lessonTypeId: "com.proxus.lesson-counter",
      pluginVersion: "1.0.0",
      minimumHostVersion: "1.0.0",
      capabilities: ["attempt-state", "completion-reporting"],
    })

    expect(manifest.lessonTypeId).toBe(makeLessonTypeId("com.proxus.lesson-counter"))
  })

  test.each(["Lesson Counter", "lesson_counter", "lesson-"])(
    "rejects invalid lesson type id %s",
    (lessonTypeId) => {
      expect(() => makeLessonTypeId(lessonTypeId)).toThrow()
    },
  )

  test("rejects unsupported manifest shapes", () => {
    expect(() => Schema.decodeUnknownSync(LessonPluginManifest)({
      manifestVersion: 2,
      lessonTypeId: "com.proxus.lesson-counter",
      pluginVersion: "latest",
      minimumHostVersion: "1.0.0",
      capabilities: [],
    })).toThrow()
  })
})
