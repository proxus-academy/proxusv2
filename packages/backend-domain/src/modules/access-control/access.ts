import { defineAccess } from "./engine/index.js"

/**
 * The single canonical access-control matrix. Persistence and transports must
 * derive their accepted permissions, roles and scope types from this instance.
 */
export const Access = defineAccess({
  permissions: {
    studyCatalog: ["createNode", "connect"],
    studyNode: ["rename", "archive"],
    studyEdge: ["disconnect"]
  },
  roles: {
    admin: [
      "studyCatalog:createNode",
      "studyCatalog:connect",
      "studyNode:rename",
      "studyNode:archive",
      "studyEdge:disconnect"
    ],
    "catalog-editor": [
      "studyCatalog:createNode",
      "studyCatalog:connect",
      "studyNode:rename",
      "studyNode:archive",
      "studyEdge:disconnect"
    ],
    student: []
  }
} as const)

export type AccessPermission = typeof Access.permissions.all extends ReadonlySet<infer Permission> ? Permission : never
export type AccessRole = typeof Access.roles.all extends ReadonlySet<infer Role> ? Role : never
export type AccessScopeType = keyof typeof Access.definition.permissions
