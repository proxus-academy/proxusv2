import * as Atom from "effect/unstable/reactivity/Atom"
import { browserDocumentNavigationLayer } from "../platform/routing/document-navigation.web.js"

export const navigationRuntime = Atom.runtime(browserDocumentNavigationLayer())
