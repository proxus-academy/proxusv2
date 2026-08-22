import { RegistryProvider } from "@effect/atom-react"
import { ugcWorkspaceQuery } from "@proxus/frontend-core/ugc-management"
import { cleanup, render, screen } from "@testing-library/react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { afterEach, describe, expect, test } from "vitest"
import { creatorWorkspaceFor } from "./creator-app.fixtures.js"
import { VideosScreen } from "./videos-screen.js"

afterEach(cleanup)

describe("VideosScreen", () => {
  test("links every delivery to its TikTok and Instagram publications", () => {
    render(<RegistryProvider initialValues={[[ugcWorkspaceQuery, AsyncResult.success(creatorWorkspaceFor("videos"))]]}><VideosScreen /></RegistryProvider>)

    expect(screen.getAllByRole("link", { name: "Ver en TikTok" })).toHaveLength(3)
    const instagram = screen.getAllByRole("link", { name: "Ver en Instagram" })
    expect(instagram).toHaveLength(3)
    expect(instagram[0]?.getAttribute("href")).toContain("instagram.com/reel/")
  })
})
