import { RuleTester } from "oxlint/plugins-dev"
import { noVisualDomOutsideUiRule } from "./no-visual-dom-outside-ui.ts"

const tester = new RuleTester()

tester.run("anti-slop/no-visual-dom-outside-ui", noVisualDomOutsideUiRule, {
  valid: [
    { code: "const view = <Stack><Button>Save</Button></Stack>", filename: "apps/web/src/view.tsx" },
    { code: "const group = <div>{children}</div>", filename: "apps/admin/src/group.tsx" },
    { code: "const internal = <button className='x'>Save</button>", filename: "packages/ui/src/button.tsx" }
  ],
  invalid: [
    { code: "const view = <main />", filename: "apps/web/src/view.tsx", errors: [{ messageId: "hostElement" }] },
    { code: "const view = <div className='grid' />", filename: "apps/admin/src/view.tsx", errors: [{ messageId: "visualDiv" }] }
  ]
})
