import type { ESTree, SourceCode } from "@oxlint/plugins";

const marker = "ANTI-SLOP-BOUNDARY:";

/** Require a visible, site-local justification instead of a global rule escape. */
export function hasExplicitBoundary(sourceCode: SourceCode, node: ESTree.Node): boolean {
  let current: ESTree.Node | null = node;
  while (current !== null && current.type !== "Program") {
    if (sourceCode.getCommentsBefore(current).some((comment) => comment.value.includes(marker))) return true;
    current = current.parent;
  }
  return false;
}
