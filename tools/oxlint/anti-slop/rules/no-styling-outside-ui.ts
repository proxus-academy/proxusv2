import { defineRule } from "@oxlint/plugins"
import type { ESTree } from "@oxlint/plugins"

const REACT_APP = /(?:^|\/)apps\/(?:admin|web)\/src\//u
const TEST_FILE = /[.](?:test|spec)[.](?:ts|tsx)$/u
const STYLING_IMPORT = /(?:^|\/)(?:radix-ui|class-variance-authority|tailwind-merge|clsx)$/u

const attributeName = (attribute: ESTree.JSXAttributeItem): string | undefined =>
  attribute.type === "JSXAttribute" && attribute.name.type === "JSXIdentifier" ? attribute.name.name : undefined

/** Prevent app modules from bypassing the visual interface exposed by @proxus/ui. */
export const noStylingOutsideUiRule = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Disallow styling implementation in React application modules." },
    messages: {
      styleAttribute: "`{{name}}` is a design-system implementation detail. Add a typed variant or layout primitive to @proxus/ui instead.",
      styleImport: "Application modules cannot import styling implementation `{{source}}`; encapsulate it in @proxus/ui.",
      stylesheetImport: "Application modules cannot own stylesheets; move the visual decision behind @proxus/ui."
    }
  },
  createOnce(context) {
    const isTarget = () => {
      const filename = context.filename.replaceAll("\\", "/")
      return REACT_APP.test(filename) && !TEST_FILE.test(filename)
    }
    return {
      JSXAttribute(node) {
        if (!isTarget()) return
        const name = attributeName(node)
        if (name === "className" || name === "style") {
          context.report({ node, messageId: "styleAttribute", data: { name } })
        }
      },
      ImportDeclaration(node) {
        if (!isTarget()) return
        const source = node.source.value
        if (typeof source !== "string") return
        if (source === "@proxus/ui/theme.css") return
        if (/[.](?:css|scss|sass|less)$/u.test(source)) {
          context.report({ node: node.source, messageId: "stylesheetImport" })
        } else if (STYLING_IMPORT.test(source)) {
          context.report({ node: node.source, messageId: "styleImport", data: { source } })
        }
      }
    }
  }
})
