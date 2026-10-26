import { throwDialecteError } from '@dialecte/core'

import { TEMPLATE_NAME, TOPOLOGY_STRUCTURAL_TAGS } from '@/v2019C1/constants'
import { SCL_ERRORS } from '@/v2019C1/errors'

import type { ResolveSsdScopeParams, SsdScopeCandidate } from './resolve-ssd-scope.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type * as Core from '@dialecte/core'

/**
 * The element of an SSD an operation acts on.
 *
 * A named level the consumer names is the scope (a chosen Bay, VoltageLevel or Substation). The `TEMPLATE`
 * scaffolding — named, or the file's substations when nothing is named — is walked down
 * `Substation -> VoltageLevel -> Bay` to the first level holding a named element: the reusable unit. Several
 * named units there and none chosen: refused with `SSD_SCOPE_AMBIGUOUS`, listing them, so the consumer asks again
 * naming one. A scaffolding with no named element below it is its deepest `TEMPLATE` level.
 *
 * Returns `undefined` when the file holds no substation, or not the element named.
 */
export async function resolveSsdScope(
	query: Core.Query<Config>,
	params: ResolveSsdScopeParams,
): Promise<Scl.Ref<TopologyStructuralTag> | undefined> {
	const { ref } = params
	const starts = ref ? await namedElements(query, { refs: [ref] }) : await substations(query)
	if (starts.length === 0) return undefined

	let level = starts
	while (true) {
		const named = level.filter((element) => element.name !== TEMPLATE_NAME)
		if (named.length === 1) return toScope(named[0])
		if (named.length > 1) refuseAmbiguous({ candidates: named })

		// a level holds at most one TEMPLATE element: the scaffolding goes on below it
		const [scaffolding] = level
		const children = await childLevels(query, { parent: scaffolding })
		if (children.length === 0) return toScope(scaffolding)
		level = children
	}
}

/** The file's substations, each with its name. */
async function substations(query: Core.Query<Config>): Promise<SsdScopeCandidate[]> {
	const records = await query.getRecordsByTagName('Substation')
	const refs = records.map((record) => ({ tagName: 'Substation', id: record.id }) as const)
	return namedElements(query, { refs })
}

/** The structural elements one level below `parent`. */
async function childLevels(
	query: Core.Query<Config>,
	params: { parent: SsdScopeCandidate },
): Promise<SsdScopeCandidate[]> {
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
): Promise<SsdScopeCandidate[]> {
	const elements: SsdScopeCandidate[] = []
	for (const ref of params.refs) {
		const record = await query.any.getRecord(ref)
		if (!record) continue
		const name = (await query.getAttribute(ref, { name: 'name' })) ?? ''
		elements.push({ tagName: ref.tagName, id: record.id, name })
	}
	return elements
}

function toScope(element: SsdScopeCandidate): Scl.Ref<TopologyStructuralTag> {
	return { tagName: element.tagName, id: element.id }
}

function refuseAmbiguous(params: { candidates: readonly SsdScopeCandidate[] }): never {
	const { candidates } = params
	return throwDialecteError(SCL_ERRORS.SSD_SCOPE_AMBIGUOUS, {
		meta: { candidates },
		detail: `the template holds ${candidates.length} units at its first named level (${candidates
			.map((candidate) => `<${candidate.tagName}> "${candidate.name}"`)
			.join(', ')}): name one of them as ref`,
	})
}
