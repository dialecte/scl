// Transplant engine — direction-agnostic clone primitives shared by the
// `extraction` (project → template) and `instantiation` (template → project)
// domains. Registered as the `transplant` extension: `deep` is exposed as
// `tx.transplant.deep`; the remaining building blocks are consumed by sibling
// recipes via this barrel.

export { deep } from './deep'
export type { ImportDeepParams, ImportDeepResult } from './deep.types'

export * from './primitives/clone-tree'
export * from './primitives/clone-referenced'
export { addChildrenTo } from './primitives/add-children-to'
export { mergeChildrenInto } from './primitives/merge-children-into'

export { resolveStructureRef, createAncestryResolver } from './resolve-structure-ref'
export type { TemplateStructure, TargetStructure } from './structure.types'
