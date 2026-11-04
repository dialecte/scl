import { INSTANCE_TAG_FAMILIES } from './template-uuid-check.constants'

import { readAttribute } from '@/v2019C1/helpers'

import type {
	TemplateUuidBearers,
	TemplateUuidWarning,
	UuidOwner,
} from './template-uuid-check.types'
import type { Config } from '@/v2019C1/config'
import type { AnyRefOrRecord, AnyTreeRecord } from '@dialecte/core'
import type * as Core from '@dialecte/core'

/**
 * List the uuid integrity problems of the whole document: a `uuid` held by two or more elements, and
 * a `templateUuid` shared across element types or naming an element of another type.
 *
 * `query.lifecycle.checkTemplateUuids` is generic and read-only. Every rule is a definitive SCL
 * identity invariant, not a heuristic:
 *  - `cross-type-template-uuid`: one `templateUuid` on elements of ≥2 element TYPES — impossible, a
 *    `templateUuid` identifies a single template element (one type; the function, subfunction,
 *    equipment function, equipment subfunction and their templates are one type);
 *  - `duplicate-instance-uuid`: a `uuid` held by two or more elements — an instance uuid identifies
 *    one element only;
 *  - `template-uuid-type-mismatch`: a `templateUuid` that resolves IN-FILE to an element of a
 *    different type than the bearer — an instance cannot derive from a template of another type
 *    (the function forms are one type).
 * Legit same-type `templateUuid` sharing (multi-instance) and unique values are never reported.
 *
 * @intent check uuid integrity of a document, find duplicate uuids, find a templateUuid shared across element types or pointing at the wrong type
 */
export async function checkTemplateUuids(
	query: Core.Query<Config>,
): Promise<TemplateUuidWarning[]> {
	const root = await query.any.getSnapshot({ as: 'tree' })

	// One pass: elements bearing each `templateUuid`, and the owner(s) of each `uuid`.
	const byTemplateUuid = new Map<string, TemplateUuidBearers>()
	const byUuid = new Map<string, UuidOwner[]>()
	collect({ node: root, byTemplateUuid, byUuid })

	const warnings: TemplateUuidWarning[] = []

	// cross-type-template-uuid: bearers of one templateUuid span ≥2 element types.
	const crossType = new Set<string>()
	for (const [value, { tagNames, families, refs }] of byTemplateUuid) {
		if (families.size < 2) continue
		crossType.add(value)
		const types = [...tagNames].sort()
		warnings.push({
			code: 'cross-type-template-uuid',
			level: 'warning',
			value,
			tagNames: types,
			refs,
			count: refs.length,
			message:
				`templateUuid "${value}" is shared by ${refs.length} elements of ${types.length} ` +
				`different types (${types.join(', ')}); a templateUuid must identify a single template ` +
				`element. It is likely a placeholder and cannot be used to recognise template lineage.`,
		})
	}

	// duplicate-instance-uuid: a uuid on ≥2 elements (instance uuids shall be unique).
	for (const [value, owners] of byUuid) {
		if (owners.length < 2) continue
		const types = [...new Set(owners.map((owner) => owner.tagName))].sort()
		warnings.push({
			code: 'duplicate-instance-uuid',
			level: 'warning',
			value,
			tagNames: types,
			refs: owners.map((owner) => owner.ref),
			count: owners.length,
			message:
				`uuid "${value}" is used by ${owners.length} elements (${types.join(', ')}); every ` +
				`instance UUID in an SCL shall be unique.`,
		})
	}

	// template-uuid-type-mismatch: a templateUuid resolves IN-FILE to an element of a different type.
	// (Skip values already flagged cross-type — that diagnostic already covers them.)
	for (const [value, { tagNames, families, refs }] of byTemplateUuid) {
		if (crossType.has(value)) continue
		const owners = byUuid.get(value)
		if (!owners || owners.length === 0) continue // dangling or imported target — not verifiable
		const [bearerFamily] = families
		const targetTypes = new Set(owners.map((owner) => owner.tagName))
		if ([...targetTypes].some((tagName) => familyOf(tagName) === bearerFamily)) continue // resolves to the same type — legit lineage
		const bearerType = [...tagNames].sort().join(', ')
		const types = [...new Set([...tagNames, ...targetTypes])].sort()
		warnings.push({
			code: 'template-uuid-type-mismatch',
			level: 'warning',
			value,
			tagNames: types,
			refs: [...refs, ...owners.map((owner) => owner.ref)],
			count: refs.length + owners.length,
			message:
				`templateUuid "${value}" on ${bearerType} resolves in-file to an element of type ` +
				`${[...targetTypes].sort().join(', ')}; an instance cannot derive from a template of a ` +
				`different type.`,
		})
	}

	return warnings
}

/** The type an element counts as: the tag of its family, or its own tag when it belongs to none. */
function familyOf(tagName: string): string {
	return INSTANCE_TAG_FAMILIES.get(tagName) ?? tagName
}

function collect(params: {
	node: AnyTreeRecord
	byTemplateUuid: Map<string, TemplateUuidBearers>
	byUuid: Map<string, UuidOwner[]>
}): void {
	const { node, byTemplateUuid, byUuid } = params
	const ref: AnyRefOrRecord = { tagName: node.tagName, id: node.id }

	const templateUuid = readAttribute({ record: node, name: 'templateUuid' })
	if (templateUuid) {
		const entry = byTemplateUuid.get(templateUuid) ?? {
			tagNames: new Set<string>(),
			families: new Set<string>(),
			refs: [],
		}
		entry.tagNames.add(node.tagName)
		entry.families.add(familyOf(node.tagName))
		entry.refs.push(ref)
		byTemplateUuid.set(templateUuid, entry)
	}

	const uuid = readAttribute({ record: node, name: 'uuid' })
	if (uuid) {
		const owners = byUuid.get(uuid) ?? []
		owners.push({ tagName: node.tagName, ref })
		byUuid.set(uuid, owners)
	}

	for (const child of node.tree) collect({ node: child, byTemplateUuid, byUuid })
}
