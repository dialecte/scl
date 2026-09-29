import { getIdentityFields } from '@/v2019C1/extensions/lifecycle/constraints/identity-fields'

import type { ElementIdentity } from './resolve-identity.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

type Reader = Core.Query<Config> | Core.Transaction<Config>

/**
 * Resolve an element's identity from the schema (does it carry a `uuid`, else its `identityFields`),
 * reading its attributes through Dialecte's own `getAttributes`. A uuid-bearing tag (`Substation`,
 * `Bay`, `Function`, ...) resolves at the `uuid` branch whatever its `identityFields` say; a uuid-less
 * tag resolves by the fields its schema keys name (`id`/`lnClass`/`inst`/..., and `name` where the
 * schema makes it unique among siblings, e.g. `DA`/`SDO` in a type).
 */
export async function resolveIdentity(
	query: Reader,
	ref: Core.AnyRefOrRecord,
): Promise<ElementIdentity> {
	const { tagName } = ref

	// the definition where the element sits: a ref is resolved to its record first
	const definition = await query.any.getDefinition(ref)
	const carriesUuid = definition?.attributes.details.uuid !== undefined
	if (carriesUuid) {
		const { uuid } = await query.any.getAttributes(ref)
		return { kind: 'uuid', uuid: uuid || undefined }
	}

	const identityFields = getIdentityFields(tagName)
	if (identityFields.size > 0) {
		const attributes = await query.any.getAttributes(ref)
		const fields: Record<string, string> = {}
		for (const field of identityFields) fields[field] = attributes[field] ?? ''
		return { kind: 'fields', fields }
	}

	return { kind: 'positional' }
}

/**
 * Whether two identities denote the same element. `uuid` identities are equal only on a shared,
 * defined uuid; `fields` on identical field maps; `positional` is never equal (no intrinsic id).
 */
export function identityEquals(first: ElementIdentity, second: ElementIdentity): boolean {
	if (first.kind === 'uuid' && second.kind === 'uuid') {
		return first.uuid !== undefined && first.uuid === second.uuid
	}
	if (first.kind === 'fields' && second.kind === 'fields') {
		const fieldNames = Object.keys(first.fields)
		if (fieldNames.length !== Object.keys(second.fields).length) return false
		return fieldNames.every((fieldName) => first.fields[fieldName] === second.fields[fieldName])
	}
	return false
}
