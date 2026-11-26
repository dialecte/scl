import { COPY_ROOT_TAG_BY_VERB } from './copy.constants'

import { throwDialecteError } from '@dialecte/core'
import { invariant } from '@dialecte/core/utils'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { SCL_ERRORS } from '@/v2019C1/errors'
import { findComposedFunctionRefs } from '@/v2019C1/extensions/lifecycle/instance/composed-functions'
import { placedFunctionTag } from '@/v2019C1/extensions/lifecycle/layers/function/placed-function-tag'
import { readSourceLevels } from '@/v2019C1/extensions/lifecycle/layers/topology/resolve-primary-placement'
import { throwRefusal } from '@/v2019C1/extensions/lifecycle/refusal'
import { isTopologyLevel } from '@/v2019C1/helpers'

import type { AssertCopyFitsParams } from './copy.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping/mapping.types'
import type * as Core from '@dialecte/core'

/**
 * Refuse, before anything is read beyond the documents and the copied root, a copy the report and the apply do not
 * offer, with `OPTION_NOT_AVAILABLE`: one read from another document than the one it is pasted into, or made with
 * another verb than `fsd` or `asd` (`meta: { option: 'scenario', value: 'copy' }`); a root other than a Function (fsd)
 * or an Application (asd) (`{ option: 'ref', value: <its tag> }`); an application merged onto the functions it
 * composes (`{ option: 'sharedFunctions', value: 'merge' }`).
 * A parent the definition does not let the copy sit under is refused with `INVALID_PARENT_CHILD`; a choice for a level
 * row the paste cannot honour as `assertLevelChoicesFit` says. Nothing for another scenario.
 */
export async function assertCopyFits(params: AssertCopyFitsParams): Promise<void> {
	const { query, target } = params
	if (target.scenario !== 'copy') return
	const operation = `lifecycle (${target.verb}, copy)`
	const notACopy = { option: 'scenario', value: 'copy' }
	if (target.verb !== 'fsd' && target.verb !== 'asd') {
		return throwRefusal({
			code: 'OPTION_NOT_AVAILABLE',
			reason: 'copy-not-offered',
			meta: notACopy,
			detail: `${operation}: a copy is offered for a Function (fsd) and an Application (asd) only`,
		})
	}
	const [{ id: document }, { id: source }] = await Promise.all([
		query.getDocumentInfo(),
		target.sourceQuery.getDocumentInfo(),
	])
	if (document !== source) {
		return throwRefusal({
			code: 'OPTION_NOT_AVAILABLE',
			reason: 'copy-not-offered',
			meta: notACopy,
			detail: `${operation}: a copy reads the document it is pasted into, not another one`,
		})
	}
	const rootTag = COPY_ROOT_TAG_BY_VERB[target.verb]
	if (target.ref.tagName !== rootTag) {
		return throwRefusal({
			code: 'OPTION_NOT_AVAILABLE',
			reason: 'copy-not-offered',
			meta: { option: 'ref', value: target.ref.tagName },
			detail: `${operation}: a ${target.ref.tagName} is no copy root, a ${rootTag} is`,
		})
	}
	assertParentAdmits({
		anchor: target.anchor,
		tagName: placedFunctionTag(target.anchor),
		operation,
	})
	if (target.verb !== 'asd') return
	// an application and the functions it composes are pasted under a level of the topology
	if (!isTopologyLevel(target.anchor.tagName)) {
		return throwDialecteError('INVALID_PARENT_CHILD', {
			meta: { parent: target.anchor.tagName, child: 'Application' },
			detail: `${operation}: an application and its functions are pasted under a Substation, a VoltageLevel or a Bay, not a ${target.anchor.tagName}`,
		})
	}
	if (target.resolution?.sharedFunctions === 'merge') {
		return throwRefusal({
			code: 'OPTION_NOT_AVAILABLE',
			reason: 'copy-not-offered',
			meta: { option: 'sharedFunctions', value: 'merge' },
			detail: `${operation}: a copy composes copies of its functions, it never stands on the originals`,
		})
	}
	await assertLevelChoicesFit({
		sourceQuery: target.sourceQuery,
		applicationRef: target.ref,
		anchor: target.anchor,
		mappings: target.resolution?.mappings,
		operation,
	})
}

/** Refuse a parent the definition does not let an element of the tag sit under. */
function assertParentAdmits(params: {
	anchor: Scl.Ref<Scl.ElementsOf>
	tagName: Scl.ElementsOf
	operation: string
}): void {
	const { anchor, tagName, operation } = params
	const children: readonly string[] = SCL_DIALECTE_CONFIG.children[anchor.tagName] ?? []
	if (children.includes(tagName)) return
	throwDialecteError('INVALID_PARENT_CHILD', {
		meta: { parent: anchor.tagName, child: tagName },
		detail: `${operation}: a ${tagName} cannot sit under a ${anchor.tagName}`,
	})
}

/**
 * Refuse a choice the consumer made for a level row of the copy (a level its functions sit on in the source) that the
 * paste cannot honour: a level created (`OPTION_NOT_AVAILABLE`: a copy creates no level); an element the document does
 * not hold, or one outside the anchor (`MAPPING_CHOICE_NOT_A_CANDIDATE`: a paste lands under what was picked); one that
 * cannot hold a function (`INVALID_PARENT_CHILD`). A choice for anything else is not read here.
 */
async function assertLevelChoicesFit(params: {
	sourceQuery: Core.Query<Config>
	applicationRef: Scl.Ref<'Application'>
	anchor: Scl.Ref<Scl.ElementsOf>
	mappings: DecisionMappings | undefined
	operation: string
}): Promise<void> {
	const { sourceQuery, applicationRef, anchor, mappings, operation } = params
	if (!mappings || mappings.size === 0) return
	const functionRefs = await findComposedFunctionRefs(sourceQuery, applicationRef)
	// the rows: the levels the functions sit on, as the placement reads them, when they are several (one lands where
	// the copy is pasted)
	const sourceLevels = await readSourceLevels({ sourceQuery, primaryRefs: functionRefs })
	if (sourceLevels.length <= 1) return
	const levels = new Map(sourceLevels.map((level) => [level.sourceRef.id, level] as const))
	const chosen: {
		sourceId: string
		tagName: string
		primaryTags: ReadonlySet<string>
		existing: Scl.Ref<Scl.ElementsOf>
	}[] = []
	for (const [sourceId, decision] of mappings) {
		const level = levels.get(sourceId)
		if (!level) continue
		const { tagName } = level.sourceRef
		if (!('existing' in decision)) {
			return throwRefusal({
				code: 'OPTION_NOT_AVAILABLE',
				reason: 'copy-not-offered',
				meta: { option: 'decisionMappings', value: 'create' },
				detail: `${operation}: a copy places what the <${tagName}> "${sourceId}" holds under a level the document has, it creates none`,
			})
		}
		chosen.push({ sourceId, tagName, primaryTags: level.primaryTags, existing: decision.existing })
	}
	// the elements chosen and their ancestors, read once for every choice
	const records = await sourceQuery.getRecords(chosen.map(({ existing }) => existing))
	const held = records.flatMap((record) => (record ? [record] : []))
	const chosenAncestries = await sourceQuery.findAncestorsOfEach(held)
	const ancestorIdsOf = new Map(
		held.map((record, index) => [record.id, (chosenAncestries[index] ?? []).map(({ id }) => id)]),
	)
	chosen.forEach(function assertChoiceFits({ sourceId, tagName, primaryTags, existing }, index) {
		const record = records[index]
		const underAnchor =
			record !== undefined &&
			(record.id === anchor.id || (ancestorIdsOf.get(record.id) ?? []).includes(anchor.id ?? ''))
		invariant(underAnchor, {
			key: SCL_ERRORS.MAPPING_CHOICE_NOT_A_CANDIDATE,
			detail: `${operation}: the content of the <${tagName}> "${sourceId}" lands at or below the ${anchor.tagName} it is pasted under, <${existing.tagName}> "${existing.id}" is not there`,
			meta: { sourceId, tagName, chosen: { tagName: existing.tagName, id: existing.id } },
		})
		for (const primaryTag of primaryTags) {
			assertParentAdmits({ anchor: existing, tagName: primaryTag as Scl.ElementsOf, operation })
		}
	})
}
