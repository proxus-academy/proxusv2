import * as Atom from "effect/unstable/reactivity/Atom"
import { makeAdminStudyCatalogClientLayer } from "./api.js"

export const studyCatalogRuntime = Atom.runtime(
  makeAdminStudyCatalogClientLayer("/admin-api"),
)
