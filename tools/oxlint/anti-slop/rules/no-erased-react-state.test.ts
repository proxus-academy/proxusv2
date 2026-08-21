import { RuleTester } from "oxlint/plugins-dev";

import { noErasedReactStateRule } from "./no-erased-react-state.ts";

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "tsx" } } });
const error = { messageId: "erasedState" };

tester.run("anti-slop/no-erased-react-state", noErasedReactStateRule, {
	valid: [
		"const [value] = useState('known');",
		"const [value] = useState<string | null>(null);",
		"const value = decode<unknown>(input);",
	],
	invalid: [
		{ code: "const [value] = useState<any>(null);", errors: [error] },
		{ code: "const [value] = useState<unknown>(null);", errors: [error] },
		{ code: "const [value] = React.useState<string | unknown>(null);", errors: [error] },
	],
});
