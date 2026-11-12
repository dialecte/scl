import { groupLinkedUnits } from './group-linked-units'
import { primariesUnderScope } from './scope-content'

import { throwDialecteError } from '@dialecte/core'
import { widen } from '@dialecte/core/helpers'

import { TEMPLATE_NAME, TOPOLOGY_STRUCTURAL_TAGS } from '@/v2019C1/constants'
import { ROOT_ELEMENT } from '@/v2019C1/definition/constants.generated'
import { SCL_ERRORS } from '@/v2019C1/errors'
import { isTopologyLevel, readAttribute } from '@/v2019C1/helpers'
import { isTransparentElement } from '@/v2019C1/helpers/transparent-elements'
import { collectSubtreeIds } from '@/v2019C1/hooks/before-delete'

import type {
	ResolveSsdScopeParams,
	SsdScope,
	SsdScopeCandidate,
	SsdScopeParent,
	SsdScopeRead,
	SsdScopeUnit,
} from './resolve-ssd-scope.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type * as Core from '@dialecte/core'

/**
 * What an SSD operation acts on: {@link readSsdScope} read as the verbs need it, refusing what the read reports as
 * data. Several elements at the first named level are refused with `SSD_SCOPE_AMBIGUOUS`, listing one candidate per
 * element (a unit, with the units linked to it), so the consumer asks again naming one; an element named the file does
 * not hold is refused with `TEMPLATE_ROOT_NOT_FOUND`; a level holding several elements named `TEMPLATE` with
 * `SSD_TEMPLATE_NOT_UNIQUE`, naming the element holding them and each of them.
 *
 * Returns `undefined` when nothing is named and the file holds no substation.
 */
export async function resolveSsdScope(
	query: Core.Query<Config>,
	params: ResolveSsdScopeParams,
): Promise<SsdScope | undefined> {
	const read = await readSsdScope(query, params)
	if (read.kind === 'scope') return read.scope
	if (read.kind === 'ambiguous') return refuseAmbiguous({ candidates: read.candidates })
	if (read.kind === 'absent') return refuseAbsent({ ref: read.ref })
	if (read.kind === 'duplicate-templates')
		return refuseDuplicateTemplates({ parent: read.parent, duplicates: read.duplicates })
	return undefined
}

/**
 * What an SSD operation acts on, read as data and never refusing: the scope, the candidates when several elements
 * could be instantiated, nothing, the element named that the file does not hold, or a level of the scaffolding holding
 * several elements named `TEMPLATE`.
 *
 * The first level of the template holding a named element holds the units to instantiate. Units joined by a reference
 * (a terminal of one on a connectivity node of the other, an input of one fed by the other) are one element: they are
 * placed together, rooted at the `TEMPLATE` scaffolding holding them, which lands on the project's level of its kind.
 *
 * A named level the consumer names is the scope, with the units it is linked to (a unit of a linked group selects the
 * group). The `TEMPLATE` scaffolding — named, or the file's substations when nothing is named — is walked down
 * `Substation -> VoltageLevel -> Bay` to that first level: one element there is the scope; several are `ambiguous`,
 * one candidate per element. A scaffolding with no named element below it is its deepest `TEMPLATE` level. A level
 * of the scaffolding holding several `TEMPLATE` elements is read as such (`duplicate-templates`), whatever is named:
 * names are unique among siblings, and nothing tells which scaffolding goes on.
 *
 * @intent read the scope of an SSD template without refusing, which unit of an SSD template file is instantiated
 */
export async function readSsdScope(
	query: Core.Query<Config>,
	params: ResolveSsdScopeParams,
): Promise<SsdScopeRead> {
	const { ref } = params
	// a scaffolding with two TEMPLATE elements side by side is not a valid file, whatever is named
	const duplicate = await findDuplicateTemplates(query)
	if (duplicate) return duplicate

	const starts = ref ? await namedElements(query, { refs: [ref] }) : await substations(query)
	if (starts.length === 0 && ref) return { kind: 'absent', ref }
	if (starts.length === 0) return { kind: 'none' }

	const [named] = starts
	if (ref && named.name !== TEMPLATE_NAME) {
		return { kind: 'scope', scope: await scopeOfNamedUnit(query, { unit: named }) }
	}

	let level = starts
	let scaffolding: SsdScopeUnit | undefined
	while (true) {
		const units = level.filter((element) => element.name !== TEMPLATE_NAME)
		if (units.length === 1) return { kind: 'scope', scope: unitScope(units[0]) }
		if (units.length > 1) {
			// with no scaffolding above them (several named substations) units cannot be placed together
			if (!scaffolding) return ambiguous({ groups: units.map((unit) => [unit]) })
			const groups = await groupLinkedUnits(query, { units })
			if (groups.length > 1) return ambiguous({ groups })
			return { kind: 'scope', scope: await groupScope(query, { scaffolding, group: groups[0] }) }
		}

		// the one TEMPLATE element of the level (`findDuplicateTemplates`): the scaffolding goes on below it
		const [template] = level.filter(isTemplate)
		const children = await childLevels(query, { parent: template })
		if (children.length === 0) return { kind: 'scope', scope: unitScope(template) }
		scaffolding = template
		level = children
	}
}

/** A named unit with the units of its level linked to it, when its level sits in the `TEMPLATE` scaffolding. */
async function scopeOfNamedUnit(
	query: Core.Query<Config>,
	params: { unit: SsdScopeUnit },
): Promise<SsdScope> {
	const { unit } = params
	const parent = await parentLevel(query, { unit })
	if (!parent || parent.name !== TEMPLATE_NAME) return unitScope(unit)
	const level = await childLevels(query, { parent })
	const units = level.filter((element) => element.name !== TEMPLATE_NAME)
	const groups = await groupLinkedUnits(query, { units })
	const group = groups.find((candidate) => candidate.some((member) => member.id === unit.id))
	if (!group || group.length === 1) return unitScope(unit)
	return groupScope(query, { scaffolding: parent, group })
}

/** One unit, rooted at itself. */
function unitScope(unit: SsdScopeUnit): SsdScope {
	return { root: toScope(unit), units: [unit], scaffolding: false, leftOut: new Set() }
}

/**
 * Linked units, rooted at the scaffolding holding them. Left out: the other elements of their level, and what the
 * scaffolding holds of its own — its equipment, description, logical nodes, the applications and functions below it —,
 * which no unit's scope holds either. Its wrappers stay: a category in one travels with the functions it classifies.
 */
async function groupScope(
	query: Core.Query<Config>,
	params: { scaffolding: SsdScopeUnit; group: SsdScopeUnit[] },
): Promise<SsdScope> {
	const { scaffolding, group } = params
	const root = toScope(scaffolding)
	const memberRecords: Scl.RawRecord<Scl.ElementsOf>[] = []
	for (const unit of group) {
		const record = await query.getRecord(toScope(unit))
		if (record) memberRecords.push(widen(record))
	}
	const inGroup = await collectSubtreeIds(query, { records: memberRecords })
	const others = (await scaffoldingContent(query, { scaffolding: root })).filter(
		(owned) => !inGroup.has(owned.id),
	)
	const leftOut = await collectSubtreeIds(query, { records: others })
	return { root, units: group, scaffolding: true, leftOut }
}

/**
 * What a scaffolding holds: every child but its wrappers (the units of its level, its equipment, its description...),
 * and the applications and functions below it.
 */
async function scaffoldingContent(
	query: Core.Query<Config>,
	params: { scaffolding: Scl.Ref<TopologyStructuralTag> },
): Promise<Scl.RawRecord<Scl.ElementsOf>[]> {
	const { scaffolding } = params
	const content: Scl.RawRecord<Scl.ElementsOf>[] = []
	const record = await query.getRecord(scaffolding)
	for (const childRef of record?.children ?? []) {
		if (isTransparentElement(childRef.tagName)) continue
		const child = await query.getRecord(childRef)
		if (child) content.push(widen(child))
	}
	const { applications, functions } = await primariesUnderScope(query, { scopeRef: scaffolding })
	const primaries = [...applications, ...functions]
	for (const primary of primaries) {
		const primaryRecord = await query.getRecord(primary)
		if (primaryRecord) content.push(widen(primaryRecord))
	}
	return content
}

/** The structural level holding a unit, if any. */
async function parentLevel(
	query: Core.Query<Config>,
	params: { unit: SsdScopeUnit },
): Promise<SsdScopeUnit | undefined> {
	const record = await query.any.getRecord(toScope(params.unit))
	const parent = record?.parent
	if (!parent || !isTopologyLevel(parent.tagName)) return undefined
	const [level] = await namedElements(query, {
		refs: [{ tagName: parent.tagName, id: parent.id }],
	})
	return level
}

/**
 * The first level of the `TEMPLATE` scaffolding holding several elements named `TEMPLATE`, walked down from the file's
 * substations, with the element holding them (the file's root for substations); none when each level holds one at
 * most. One read per level.
 */
async function findDuplicateTemplates(
	query: Core.Query<Config>,
): Promise<Extract<SsdScopeRead, { kind: 'duplicate-templates' }> | undefined> {
	let parent: SsdScopeParent = await fileRoot(query)
	let level = await substations(query)
	while (true) {
		const templates = level.filter(isTemplate)
		if (templates.length > 1) return { kind: 'duplicate-templates', parent, duplicates: templates }
		const [template] = templates
		if (!template) return undefined
		parent = template
		level = await childLevels(query, { parent: template })
	}
}

function isTemplate(element: SsdScopeUnit): boolean {
	return element.name === TEMPLATE_NAME
}

/** The file's root: what holds its substations. */
async function fileRoot(query: Core.Query<Config>): Promise<SsdScopeParent> {
	const root = await query.getRoot()
	return { tagName: ROOT_ELEMENT, id: root.id }
}

/** The file's substations, in document order, each with its name. */
async function substations(query: Core.Query<Config>): Promise<SsdScopeUnit[]> {
	const records = await query.getChildren({ tagName: ROOT_ELEMENT }, 'Substation')
	const refs = records.map((record) => ({ tagName: 'Substation', id: record.id }) as const)
	return namedElements(query, { refs })
}

/** The structural elements one level below `parent`. */
async function childLevels(
	query: Core.Query<Config>,
	params: { parent: SsdScopeUnit },
): Promise<SsdScopeUnit[]> {
	const { parent } = params
	const childTag = TOPOLOGY_STRUCTURAL_TAGS[TOPOLOGY_STRUCTURAL_TAGS.indexOf(parent.tagName) + 1]
	if (!childTag) return []
	const children = await query.any.getChildren(toScope(parent), childTag)
	const refs = children.map((child) => ({ tagName: childTag, id: child.id }))
	return namedElements(query, { refs })
}

/** The elements of `refs` the file holds, each with its name. */
async function namedElements(
	query: Core.Query<Config>,
	params: { refs: readonly Scl.Ref<TopologyStructuralTag>[] },
): Promise<SsdScopeUnit[]> {
	const elements: SsdScopeUnit[] = []
	for (const ref of params.refs) {
		const record = await query.any.getRecord(ref)
		if (!record) continue
		const name = readAttribute({ record, name: 'name', defaults: 'none' }) ?? ''
		elements.push({ tagName: ref.tagName, id: record.id, name })
	}
	return elements
}

function toScope(element: SsdScopeUnit): Scl.Ref<TopologyStructuralTag> {
	return { tagName: element.tagName, id: element.id }
}

function ambiguous(params: { groups: readonly SsdScopeUnit[][] }): SsdScopeRead {
	const candidates: SsdScopeCandidate[] = params.groups.map(([unit, ...linked]) => ({
		...unit,
		linked,
	}))
	return { kind: 'ambiguous', candidates }
}

function refuseAmbiguous(params: { candidates: readonly SsdScopeCandidate[] }): never {
	const { candidates } = params
	return throwDialecteError(SCL_ERRORS.SSD_SCOPE_AMBIGUOUS, {
		meta: { candidates },
		detail: `the template holds ${candidates.length} elements to instantiate at its first named level (${candidates
			.map((candidate) => `<${candidate.tagName}> "${candidate.name}"`)
			.join(', ')}): name one of them as ref`,
	})
}

function refuseDuplicateTemplates(params: {
	parent: SsdScopeParent
	duplicates: readonly SsdScopeUnit[]
}): never {
	const { parent, duplicates } = params
	const holder = parent.name ? `<${parent.tagName}> "${parent.name}"` : 'the file'
	return throwDialecteError(SCL_ERRORS.SSD_TEMPLATE_NOT_UNIQUE, {
		meta: { parent, duplicates },
		detail: `${holder} holds ${duplicates.length} <${duplicates[0].tagName}> named "${TEMPLATE_NAME}": a name is unique among siblings, keep one`,
	})
}

function refuseAbsent(params: { ref: Scl.Ref<TopologyStructuralTag> }): never {
	const { ref } = params
	return throwDialecteError(SCL_ERRORS.TEMPLATE_ROOT_NOT_FOUND, {
		detail: `the template holds no <${ref.tagName}> "${ref.id}"`,
	})
}
