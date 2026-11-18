import { STRUCTURAL_IDENTITY_FIELDS } from '@/v2019C1/extensions/identity/constants/structural-identity.constants'
import { getIdentityFields } from '@/v2019C1/extensions/lifecycle/constraints/identity-fields'

/**
 * The attributes identifying a uuid-less element among its siblings of one tag: the schema's `identityFields`, else
 * the supplement for a tag the schema gives none (`STRUCTURAL_IDENTITY_FIELDS`). Empty for a tag with neither: such an
 * element has no key of its own.
 *
 * @intent key of an element without uuid, which attributes identify an element among its siblings, identity fields with supplements
 */
export function keyFieldsOf(tagName: string): readonly string[] {
	const fields = getIdentityFields(tagName)
	if (fields.size > 0) return [...fields]
	return STRUCTURAL_IDENTITY_FIELDS.get(tagName) ?? []
}
