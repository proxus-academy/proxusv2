import { RuleTester } from "oxlint/plugins-dev"
import { noStylingOutsideUiRule } from "./no-styling-outside-ui.ts"

const tester = new RuleTester()

tester.run("anti-slop/no-styling-outside-ui", noStylingOutsideUiRule, {
  valid: [
    { code: "const view = <Stack gap='lg' />", filename: "apps/web/src/view.tsx" },
    { code: "import '@proxus/ui/theme.css'", filename: "apps/web/src/main.tsx" },
    { code: "const internal = <div className='grid' />", filename: "packages/ui/src/layout.tsx" }
  ],
  invalid: [
    { code: "const view = <Stack className='grid' />", filename: "apps/web/src/view.tsx", errors: [{ messageId: "styleAttribute" }] },
    { code: "import './app.css'", filename: "apps/admin/src/main.tsx", errors: [{ messageId: "stylesheetImport" }] },
    { code: "import { cva } from 'class-variance-authority'", filename: "apps/admin/src/view.tsx", errors: [{ messageId: "styleImport" }] }
  ]
})
