import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

function isErasedType(type: ESTree.TSType): boolean {
	if (type.type === "TSAnyKeyword" || type.type === "TSUnknownKeyword") return true;
	if (type.type === "TSParenthesizedType") return isErasedType(type.typeAnnotation);
	if (type.type === "TSUnionType" || type.type === "TSIntersectionType")
		return type.types.some(isErasedType);
	return false;
}

function isUseStateCallee(callee: ESTree.Expression): boolean {
	if (callee.type === "Identifier") return callee.name === "useState";
	return callee.type === "MemberExpression" &&
		!callee.computed &&
		callee.property.type === "Identifier" &&
		callee.property.name === "useState";
}

/** Preserve React state contracts instead of erasing them behind top types. */
export const noErasedReactStateRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description: "Disallow any and unknown in explicit React useState type arguments.",
		},
		messages: {
			erasedState: "React state cannot contain `any` or `unknown`; keep inference or use the owning domain/API type.",
		},
	},
	createOnce(context) {
		return {
			CallExpression(node) {
				if (!isUseStateCallee(node.callee)) return;
				if (node.typeArguments?.params.some(isErasedType) !== true) return;
				context.report({ node, messageId: "erasedState" });
			},
		};
	},
});
