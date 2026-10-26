export { classifyAttribute, editableAttributes, isEditableMode } from './classify-attribute'
export { EDITABLE_MODES, LINEAGE } from './classify-attribute.constants'
export { getIdentityFields } from './identity-fields'
export {
	constraintsSelecting,
	findConstraintViolation,
	findViolationInScope,
} from './find-constraint-violation'
export { findConstraintViolations } from './find-constraint-violations'
export { resolveUniqueValue } from './resolve-unique-value'
export { findConstraintParent, resolvePlacementCollision } from './resolve-placement-collision'
export {
	assertNoIdentityCollision,
	findIdentityCollision,
	identityCollisionInScope,
	refuseIdentityCollision,
} from './find-identity-collision'
export { placeUniquely } from './place-uniquely'
export { makeUnique } from './make-unique'
export { numberRenames } from './number-renames'

export type { AttributeEditability, EditableAttribute } from './classify-attribute.types'
export type { ConstraintScope, ConstraintViolation } from './find-constraint-violation.types'
export type {
	PlacementCollisionParams,
	PlacementResolution,
} from './resolve-placement-collision.types'
export type { IdentityCollision } from './find-identity-collision.types'
export type { MakeUniqueParams } from './make-unique.types'
export type { Rename } from './number-renames.types'
