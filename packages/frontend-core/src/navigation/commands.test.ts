import { Deferred, Effect, Schema } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it } from "vitest"
import { makeRetryableCommands } from "./commands.js"

class TestCommandError extends Schema.TaggedErrorClass<TestCommandError>()(
  "TestCommandError",
  { command: Schema.String },
) {}

describe("retryable commands", () => {
  it("retries the captured failure until that command succeeds", () => Effect.runPromise(Effect.gen(function*() {
    const commands = makeRetryableCommands()
    const registry = AtomRegistry.make()
    const executions: Array<string> = []
    let shouldFail = true
    const effect = Effect.suspend(() => {
      executions.push("command")
      return shouldFail
        ? Effect.fail(new TestCommandError({ command: "retry" }))
        : Effect.void
    })
    const runAtom = Atom.fn((_input: void, get) => commands.run(get, effect))

    registry.set(runAtom, undefined)
    yield* AtomRegistry.getResult(registry, runAtom, { suspendOnWaiting: true }).pipe(Effect.ignore)
    expect(registry.get(commands.failedAtom)).toBe(true)

    registry.set(commands.retryAtom, undefined)
    yield* AtomRegistry.getResult(registry, commands.retryAtom, { suspendOnWaiting: true })
    expect(registry.get(commands.failedAtom)).toBe(true)

    shouldFail = false
    registry.set(commands.retryAtom, undefined)
    yield* AtomRegistry.getResult(registry, commands.retryAtom, { suspendOnWaiting: true })

    expect(executions).toEqual(["command", "command", "command"])
    expect(registry.get(commands.failedAtom)).toBe(false)
  })))

  it("retains only the most recently failed command", () => Effect.runPromise(Effect.gen(function*() {
    const commands = makeRetryableCommands()
    const registry = AtomRegistry.make()
    const executions: Array<string> = []
    const failing = new Set(["first", "second"])
    const command = (name: string) => Effect.suspend(() => {
      executions.push(name)
      return failing.has(name)
        ? Effect.fail(new TestCommandError({ command: name }))
        : Effect.void
    })
    const firstAtom = Atom.fn((_input: void, get) => commands.run(get, command("first")))
    const secondAtom = Atom.fn((_input: void, get) => commands.run(get, command("second")))

    registry.set(firstAtom, undefined)
    yield* AtomRegistry.getResult(registry, firstAtom, { suspendOnWaiting: true }).pipe(Effect.ignore)
    registry.set(secondAtom, undefined)
    yield* AtomRegistry.getResult(registry, secondAtom, { suspendOnWaiting: true }).pipe(Effect.ignore)

    failing.delete("second")
    registry.set(commands.retryAtom, undefined)
    yield* AtomRegistry.getResult(registry, commands.retryAtom, { suspendOnWaiting: true })

    expect(executions).toEqual(["first", "second", "second"])
    expect(registry.get(commands.failedAtom)).toBe(false)
  })))

  it("retries the newer command when an older command fails later", () => Effect.runPromise(Effect.gen(function*() {
    const oldStarted = yield* Deferred.make<void>()
    const allowOldFailure = yield* Deferred.make<void>()
    const commands = makeRetryableCommands()
    const registry = AtomRegistry.make()
    const executions: Array<string> = []
    let newFails = true
    const oldAtom = Atom.fn((_input: void, get) => commands.run(get, Effect.gen(function*() {
      executions.push("old")
      yield* Deferred.succeed(oldStarted, undefined)
      yield* Deferred.await(allowOldFailure)
      return yield* new TestCommandError({ command: "old" })
    })))
    const newEffect = Effect.suspend(() => {
      executions.push("new")
      return newFails
        ? Effect.fail(new TestCommandError({ command: "new" }))
        : Effect.void
    })
    const newAtom = Atom.fn((_input: void, get) => commands.run(get, newEffect))

    registry.set(oldAtom, undefined)
    yield* Deferred.await(oldStarted)
    registry.set(newAtom, undefined)
    yield* AtomRegistry.getResult(registry, newAtom, { suspendOnWaiting: true }).pipe(Effect.ignore)

    yield* Deferred.succeed(allowOldFailure, undefined)
    yield* AtomRegistry.getResult(registry, oldAtom, { suspendOnWaiting: true }).pipe(Effect.ignore)
    expect(registry.get(commands.failedAtom)).toBe(true)

    newFails = false
    registry.set(commands.retryAtom, undefined)
    yield* AtomRegistry.getResult(registry, commands.retryAtom, { suspendOnWaiting: true })

    expect(executions).toEqual(["old", "new", "new"])
    expect(registry.get(commands.failedAtom)).toBe(false)
  })))

  it("clears an older failure when a newer command succeeds", () => Effect.runPromise(Effect.gen(function*() {
    const commands = makeRetryableCommands()
    const registry = AtomRegistry.make()
    const executions: Array<string> = []
    const firstAtom = Atom.fn((_input: void, get) => commands.run(
      get,
      Effect.sync(() => executions.push("first")).pipe(
        Effect.andThen(Effect.fail(new TestCommandError({ command: "first" }))),
      ),
    ))
    const secondAtom = Atom.fn((_input: void, get) => commands.run(
      get,
      Effect.sync(() => executions.push("second")),
    ))

    registry.set(firstAtom, undefined)
    yield* AtomRegistry.getResult(registry, firstAtom, { suspendOnWaiting: true }).pipe(Effect.ignore)
    expect(registry.get(commands.failedAtom)).toBe(true)

    registry.set(secondAtom, undefined)
    yield* AtomRegistry.getResult(registry, secondAtom, { suspendOnWaiting: true })
    expect(registry.get(commands.failedAtom)).toBe(false)

    registry.set(commands.retryAtom, undefined)
    yield* AtomRegistry.getResult(registry, commands.retryAtom, { suspendOnWaiting: true })
    expect(executions).toEqual(["first", "second"])
  })))

  it("does not let an older success clear a newer failure", () => Effect.runPromise(Effect.gen(function*() {
    const firstStarted = yield* Deferred.make<void>()
    const allowFirstSuccess = yield* Deferred.make<void>()
    const commands = makeRetryableCommands()
    const registry = AtomRegistry.make()
    let secondFails = true
    let secondExecutions = 0
    const firstAtom = Atom.fn((_input: void, get) => commands.run(get, Effect.gen(function*() {
      yield* Deferred.succeed(firstStarted, undefined)
      yield* Deferred.await(allowFirstSuccess)
    })))
    const secondEffect = Effect.suspend(() => {
      secondExecutions++
      return secondFails
        ? Effect.fail(new TestCommandError({ command: "newer" }))
        : Effect.void
    })
    const secondAtom = Atom.fn((_input: void, get) => commands.run(get, secondEffect))

    registry.set(firstAtom, undefined)
    yield* Deferred.await(firstStarted)
    registry.set(secondAtom, undefined)
    yield* AtomRegistry.getResult(registry, secondAtom, { suspendOnWaiting: true }).pipe(Effect.ignore)
    expect(registry.get(commands.failedAtom)).toBe(true)

    yield* Deferred.succeed(allowFirstSuccess, undefined)
    yield* AtomRegistry.getResult(registry, firstAtom, { suspendOnWaiting: true })
    expect(registry.get(commands.failedAtom)).toBe(true)

    secondFails = false
    registry.set(commands.retryAtom, undefined)
    yield* AtomRegistry.getResult(registry, commands.retryAtom, { suspendOnWaiting: true })
    expect(secondExecutions).toBe(2)
    expect(registry.get(commands.failedAtom)).toBe(false)
  })))
})
