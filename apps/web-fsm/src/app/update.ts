import type { AppModel, AppRoute, PersistedSnapshot, RegistrationDraft, RegistrationErrors, StudySummary } from "./model.js"
import { editingRegistration, emptyRegistrationDraft } from "./model.js"
import { routeOf, routesEqual } from "./route.js"

export type AppMessage =
  | { readonly _tag: "Started" }
  | { readonly _tag: "SnapshotLoaded"; readonly snapshot: PersistedSnapshot }
  | { readonly _tag: "RouteChanged"; readonly route: AppRoute }
  | { readonly _tag: "EmailChanged"; readonly value: string }
  | { readonly _tag: "DisplayNameChanged"; readonly value: string }
  | { readonly _tag: "RegistrationSubmitted" }
  | { readonly _tag: "RegistrationSucceeded" }
  | { readonly _tag: "RegistrationFailed"; readonly error: string }
  | { readonly _tag: "StudiesInvalidated" }
  | { readonly _tag: "StudiesLoaded"; readonly studies: ReadonlyArray<StudySummary> }
  | { readonly _tag: "StudiesLoadFailed"; readonly error: string }
  | { readonly _tag: "LoggedOut" }

export type AppCommand =
  | { readonly _tag: "LoadSnapshot" }
  | { readonly _tag: "SaveSnapshot"; readonly snapshot: PersistedSnapshot }
  | { readonly _tag: "Register"; readonly draft: RegistrationDraft }
  | { readonly _tag: "LoadStudies" }
  | { readonly _tag: "PushRoute"; readonly route: AppRoute }
  | { readonly _tag: "ReplaceRoute"; readonly route: AppRoute }

export type UpdateResult = readonly [AppModel, ReadonlyArray<AppCommand>]

const validateRegistration = (draft: RegistrationDraft): RegistrationErrors => {
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())
    ? undefined
    : "Introduce un email válido."
  const displayName = draft.displayName.trim().length >= 2
    ? undefined
    : "El nombre debe tener al menos dos caracteres."
  return {
    ...(email === undefined ? {} : { email }),
    ...(displayName === undefined ? {} : { displayName }),
  }
}

const resolveRoute = (route: AppRoute, snapshot: PersistedSnapshot): UpdateResult => {
  let model: Exclude<AppModel, { readonly _tag: "Booting" }>
  if (route._tag === "NotFound") {
    model = { _tag: "NotFound", path: route.path }
  } else if (snapshot.user !== undefined) {
    model = { _tag: "Dashboard", user: snapshot.user, studies: { _tag: "Loading" } }
  } else {
    model = {
      _tag: "Onboarding",
      registration: editingRegistration(snapshot.registrationDraft ?? emptyRegistrationDraft),
    }
  }
  const canonical = routeOf(model)
  const commands: Array<AppCommand> = []
  if (model._tag === "Dashboard") commands.push({ _tag: "LoadStudies" })
  if (!routesEqual(route, canonical)) commands.push({ _tag: "ReplaceRoute", route: canonical })
  return [model, commands]
}

const currentSnapshot = (model: AppModel): PersistedSnapshot => {
  if (model._tag === "Dashboard") return { user: model.user }
  if (model._tag !== "Onboarding") return {}
  return { registrationDraft: model.registration.draft }
}

export const initialAppModel = (requestedRoute: AppRoute): AppModel => ({ _tag: "Booting", requestedRoute })

export const updateApp = (model: AppModel, message: AppMessage): UpdateResult => {
  switch (message._tag) {
    case "Started":
      return model._tag === "Booting" ? [model, [{ _tag: "LoadSnapshot" }]] : [model, []]
    case "SnapshotLoaded":
      return model._tag === "Booting" ? resolveRoute(model.requestedRoute, message.snapshot) : [model, []]
    case "RouteChanged":
      return resolveRoute(message.route, currentSnapshot(model))
    case "EmailChanged":
    case "DisplayNameChanged": {
      if (model._tag !== "Onboarding" || model.registration._tag === "Submitting") return [model, []]
      const field = message._tag === "EmailChanged" ? "email" : "displayName"
      const draft = { ...model.registration.draft, [field]: message.value }
      const touched = new Set(model.registration._tag === "Editing" ? model.registration.touched : [])
      touched.add(field)
      const errors = validateRegistration(draft)
      return [{
        _tag: "Onboarding",
        registration: { _tag: "Editing", draft, touched, errors },
      }, [{ _tag: "SaveSnapshot", snapshot: { registrationDraft: draft } }]]
    }
    case "RegistrationSubmitted": {
      if (model._tag !== "Onboarding" || model.registration._tag === "Submitting") return [model, []]
      const errors = validateRegistration(model.registration.draft)
      if (Object.keys(errors).length > 0) {
        return [{
          _tag: "Onboarding",
          registration: {
            _tag: "Editing",
            draft: model.registration.draft,
            touched: new Set(["email", "displayName"]),
            errors,
          },
        }, []]
      }
      return [{
        _tag: "Onboarding",
        registration: { _tag: "Submitting", draft: model.registration.draft },
      }, [{ _tag: "Register", draft: model.registration.draft }]]
    }
    case "RegistrationSucceeded": {
      if (model._tag !== "Onboarding" || model.registration._tag !== "Submitting") return [model, []]
      const user = {
        displayName: model.registration.draft.displayName.trim(),
        email: model.registration.draft.email.trim(),
      }
      return [{ _tag: "Dashboard", user, studies: { _tag: "Loading" } }, [
        { _tag: "SaveSnapshot", snapshot: { user } },
        { _tag: "PushRoute", route: { _tag: "Dashboard" } },
        { _tag: "LoadStudies" },
      ]]
    }
    case "RegistrationFailed":
      return model._tag === "Onboarding" && model.registration._tag === "Submitting"
        ? [{
            _tag: "Onboarding",
            registration: { _tag: "Failed", draft: model.registration.draft, error: message.error },
          }, []]
        : [model, []]
    case "StudiesInvalidated": {
      if (model._tag !== "Dashboard" || model.studies._tag === "Loading" || model.studies._tag === "Refreshing") return [model, []]
      const previous = model.studies._tag === "Success" ? model.studies.studies : model.studies.previous
      return [{
        ...model,
        studies: previous === undefined ? { _tag: "Loading" } : { _tag: "Refreshing", studies: previous },
      }, [{ _tag: "LoadStudies" }]]
    }
    case "StudiesLoaded":
      return model._tag === "Dashboard"
        ? [{ ...model, studies: { _tag: "Success", studies: message.studies } }, []]
        : [model, []]
    case "StudiesLoadFailed": {
      if (model._tag !== "Dashboard") return [model, []]
      const previous = model.studies._tag === "Refreshing" ? model.studies.studies : undefined
      return [{
        ...model,
        studies: { _tag: "Failure", error: message.error, ...(previous === undefined ? {} : { previous }) },
      }, []]
    }
    case "LoggedOut": {
      const next: AppModel = { _tag: "Onboarding", registration: editingRegistration() }
      return [next, [
        { _tag: "SaveSnapshot", snapshot: {} },
        { _tag: "PushRoute", route: { _tag: "Registration" } },
      ]]
    }
  }
}
