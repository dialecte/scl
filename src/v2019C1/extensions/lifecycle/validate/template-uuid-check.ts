import type { TemplateUuidWarning } from './template-uuid-check.types'
import type { Config } from '@/v2019C1/config'
import type { AnyRefOrRecord, AnyTreeRecord } from '@dialecte/core'
import type * as Core from '@dialecte/core'

type Bearers = { tagNames: Set<string>; refs: AnyRefOrRecord[] }
type Owner = { tagName: string; ref: AnyRefOrRecord }

/**
 * `query.lifecycle.checkTemplateUuids` — a generic, read-only SCL identity-integrity check across
 * the whole document. Every rule is a DEFINITIVE SCL identity invariant, not a heuristic:
 *  - `cross-type-template-uuid`: one `templateUuid` on elements of ≥2 element TYPES — impossible, a
 *    `templateUuid` identifies a single template element (one type);
 *  - `duplicate-instance-uuid`: a `uuid` used by ≥2 elements — "every instance UUID shall be unique";
 *  - `template-uuid-type-mismatch`: a `templateUuid` that resolves IN-FILE to an element of a
 *    different type than the bearer — an instance cannot derive from a template of another type.
 * Legit same-type `templateUuid` sharing (multi-instance) and unique values are never reported.
 */
export async function checkTemplateUuids(
	query: Core.Query<Config>,
): Promise<TemplateUuidWarning[]> {
	const root = await query.any.getSnapshot({ as: 'tree' })

	// One pass: elements bearing each `templateUuid`, and the owner(s) of each `uuid`.
	const byTemplateUuid = new Map<string, Bearers>()
	const byUuid = new Map<string, Owner[]>()
	await collect(query, root, byTemplateUuid, byUuid)

	const warnings: TemplateUuidWarning[] = []

	// cross-type-template-uuid: bearers of one templateUuid span ≥2 element types.
	const crossType = new Set<string>()
	for (const [value, { tagNames, refs }] of byTemplateUuid) {
		if (tagNames.size < 2) continue
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
		const types = [...new Set(owners.map((o) => o.tagName))].sort()
		warnings.push({
			code: 'duplicate-instance-uuid',
			level: 'warning',
			value,
			tagNames: types,
			refs: owners.map((o) => o.ref),
			count: owners.length,
			message:
				`uuid "${value}" is used by ${owners.length} elements (${types.join(', ')}); every ` +
				`instance UUID in an SCL shall be unique.`,
		})
	}

	// template-uuid-type-mismatch: a templateUuid resolves IN-FILE to an element of a different type.
	// (Skip values already flagged cross-type — that diagnostic already covers them.)
	for (const [value, { tagNames, refs }] of byTemplateUuid) {
		if (crossType.has(value)) continue
		const owners = byUuid.get(value)
		if (!owners || owners.length === 0) continue // dangling or imported target — not verifiable
		const bearerType = [...tagNames][0]
		const targetTypes = new Set(owners.map((o) => o.tagName))
		if (targetTypes.has(bearerType)) continue // resolves to the same type — legit lineage
		const types = [...new Set([bearerType, ...targetTypes])].sort()
		warnings.push({
			code: 'template-uuid-type-mismatch',
			level: 'warning',
			value,
			tagNames: types,
			refs: [...refs, ...owners.map((o) => o.ref)],
			count: refs.length + owners.length,
			message:
				`templateUuid "${value}" on ${bearerType} resolves in-file to an element of type ` +
				`${[...targetTypes].sort().join(', ')}; an instance cannot derive from a template of a ` +
				`different type.`,
		})
	}

	return warnings
}

async function collect(
	query: Core.Query<Config>,
	node: AnyTreeRecord,
	byTemplateUuid: Map<string, Bearers>,
	byUuid: Map<string, Owner[]>,
): Promise<void> {
	const ref: AnyRefOrRecord = { tagName: node.tagName, id: node.id }

	const templateUuid = await query.any.getAttribute(node, { name: 'templateUuid' })
	if (templateUuid) {
		const entry = byTemplateUuid.get(templateUuid) ?? { tagNames: new Set<string>(), refs: [] }
		entry.tagNames.add(node.tagName)
		entry.refs.push(ref)
		byTemplateUuid.set(templateUuid, entry)
	}

	const uuid = await query.any.getAttribute(node, { name: 'uuid' })
	if (uuid) {
		const owners = byUuid.get(uuid) ?? []
		owners.push({ tagName: node.tagName, ref })
		byUuid.set(uuid, owners)
	}

	for (const child of node.tree) await collect(query, child, byTemplateUuid, byUuid)
}
