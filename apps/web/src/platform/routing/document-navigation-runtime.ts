import * as Atom from "effect/unstable/reactivity/Atom"
import { browserDocumentNavigationLayer } from "./document-navigation.web.js"

export const documentNavigationRuntime = Atom.runtime(browserDocumentNavigationLayer())
