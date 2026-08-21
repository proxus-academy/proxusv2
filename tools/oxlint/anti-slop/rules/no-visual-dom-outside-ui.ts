import { defineRule } from "@oxlint/plugins"
import type { ESTree } from "@oxlint/plugins"

const REACT_APP = /(?:^|\/)apps\/(?:admin|web)\/src\/.*[.]tsx$/u
const TEST_FILE = /[.](?:test|spec)[.]tsx$/u

const elementName = (node: ESTree.JSXTagNameExpression): string | undefined =>
  node.type === "JSXIdentifier" ? node.name : undefined

/** Keep host markup behind @proxus/ui so new visual needs deepen the design system first. */
export const noVisualDomOutsideUiRule = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Disallow visual host elements in React applications; compose @proxus/ui instead." },
    messages: {
      hostElement: "Raw <{{name}}> is not allowed in application modules. Compose @proxus/ui; use Box with `as` when host semantics are required.",
      visualDiv: "A raw <div> may only be a neutral grouping node. Remove its props or replace it with Box, Stack, Inline, Grid, or a deeper @proxus/ui module."
    }
  },
  createOnce(context) {
    return {
      JSXOpeningElement(node) {
        const filename = context.filename.replaceAll("\\", "/")
        if (!REACT_APP.test(filename) || TEST_FILE.test(filename)) return
        const name = elementName(node.name)
        if (name === undefined || /^[A-Z]/u.test(name)) return
        if (name !== "div") {
          context.report({ node: node.name, messageId: "hostElement", data: { name } })
          return
        }
        if (node.attributes.length > 0) context.report({ node, messageId: "visualDiv" })
      }
    }
  }
})
