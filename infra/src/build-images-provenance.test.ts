// @effect-diagnostics nodeBuiltinImport:off
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const script = readFileSync(resolve(import.meta.dirname, "../scripts/build-images.sh"), "utf8")
const cloudbuild = readFileSync(resolve(import.meta.dirname, "../cloudbuild/images.yaml"), "utf8")
const production = readFileSync(resolve(import.meta.dirname, "../../.github/workflows/deploy-production.yml"), "utf8")
const provenanceFilter = resolve(import.meta.dirname, "../scripts/validate-build-provenance.jq")
const provenanceContract = readFileSync(provenanceFilter, "utf8")
const realManualBuild = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "fixtures/build-images/build-7e226605.json"), "utf8"),
) as Record<string, unknown>
const manualArgs = [
  "-e",
  "--arg", "mode", "storage",
  "--arg", "project", "proxus-v2",
  "--arg", "sha", "c269cec287856a166f7dac8befc357800d84ccf8",
  "--arg", "url", "",
  "--arg", "storage_uri", "gs://proxus-v2_cloudbuild/manual/context.tar.gz",
  "--arg", "source_hash", "78b2mnMVuXzB2gS_88Y9sWBraJ9wnTtDTHyVG1j90FU=",
  "--arg", "prefix", "europe-southwest1-docker.pkg.dev/proxus-v2/proxus",
  "--arg", "tag", "sha-c269cec287856a166f7dac8befc357800d84ccf8-dirty-20260815T033232Z",
  "--arg", "context", "efc6f69a7315b97cc1da04bff3c63db1606b689f709d3b434c7c951b58fdd055",
  "-f", provenanceFilter,
]

const accepted = (build: unknown) => {
  try {
    execFileSync("jq", manualArgs, { input: JSON.stringify(build), stdio: ["pipe", "ignore", "pipe"] })
    return true
  } catch {
    return false
  }
}

const changed = (change: (build: any) => void) => {
  const build = structuredClone(realManualBuild)
  change(build)
  return build
}

describe("Cloud Build image provenance contract", () => {
  it("attests the canonical Git source and every immutable substitution", () => {
    expect(provenanceContract).toContain(".sourceProvenance.resolvedGitSource.revision == $sha")
    expect(provenanceContract).toContain(".sourceProvenance.resolvedGitSource.url == $url")
    for (const key of ["_SOURCE_SHA", "_SOURCE_CONTEXT_SHA256", "_IMAGE_PREFIX", "_IMAGE_TAG"]) {
      expect(provenanceContract).toContain(`.substitutions.${key}`)
    }
    expect(provenanceContract).not.toContain("resolvedRepoSource.commitSha")
  })

  it("uses one exact tar and its provenance hash for manual builds", () => {
    expect(script).toContain('sha256sum "$manual_context_tar"')
    expect(script).toContain('gcloud storage cp --no-clobber "$manual_context_tar" "$manual_context_uri"')
    expect(script).toContain('builds submit "$source_argument"')
    expect(script).toContain('tar -xOzf "$manual_context_tar" infra/cloudbuild/images.yaml')
    expect(script).toContain('openssl dgst -sha256 -binary "$manual_context_tar"')
    expect(script).toContain('tr \'+/\' \'-_\'')
    expect(script).toContain("validate-build-provenance.jq")
  })

  it("accepts the real 7e226 manual build despite its distinct resolved staging object", () => {
    expect((realManualBuild as any).sourceProvenance.resolvedStorageSource.object).not.toBe("manual/context.tar.gz")
    expect(accepted(realManualBuild)).toBe(true)
  })

  it.each([
    ["non-success status", (build: any) => { build.status = "FAILURE" }],
    ["other project", (build: any) => { build.projectId = "other-project" }],
    ["other bucket", (build: any) => { build.sourceProvenance.resolvedStorageSource.bucket = "other-bucket" }],
    ["missing generation", (build: any) => { delete build.sourceProvenance.resolvedStorageSource.generation }],
    ["mutable generation", (build: any) => { build.sourceProvenance.resolvedStorageSource.generation = "latest" }],
    ["missing resolved hash key", (build: any) => { build.sourceProvenance.fileHashes = {} }],
    ["wrong SHA256", (build: any) => { build.sourceProvenance.fileHashes[Object.keys(build.sourceProvenance.fileHashes)[0]!].fileHash[1].value = "wrong" }],
    ["wrong substitution", (build: any) => { build.substitutions._SOURCE_CONTEXT_SHA256 = "0".repeat(64) }],
    ["missing image", (build: any) => { build.results.images.pop() }],
    ["extra image", (build: any) => { build.results.images.push(structuredClone(build.results.images[0])) }],
    ["invalid digest", (build: any) => { build.results.images[0].digest = "sha256:nope" }],
  ])("rejects %s", (_name, mutate) => {
    expect(accepted(changed(mutate))).toBe(false)
  })

  it("returns only the four exact result names as digest references", () => {
    expect(script).toContain("[.results.images[]? | select(.name == $image) | .digest]")
    expect(script).toContain('^sha256:[a-f0-9]{64}$')
    expect(script).toContain('value="${image_prefix}/${image}@${digest}"')
    expect(script).not.toMatch(/(?:output|value)=.*(?:latest|:\$\{tag\})/)
  })

  it("binds the context attestation into every built image", () => {
    expect(cloudbuild.match(/--label=dev\.proxus\.source-context-sha256=\$\{_SOURCE_CONTEXT_SHA256\}/g)).toHaveLength(4)
  })

  it("builds production from the exact trusted checkout SHA", () => {
    expect(production).toContain('test "$(git rev-parse HEAD)" = "$SOURCE_SHA"')
    expect(production).toContain("SOURCE_REVISION: ${{ needs.authorize.outputs.sha }}")
    expect(production).toContain("run: infra/scripts/build-images.sh")
  })
})
