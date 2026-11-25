import { COPY_ROOT_TAG_BY_VERB } from './copy.constants'

import { throwDialecteError } from '@dialecte/core'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { findComposedFunctionRefs } from '@/v2019C1/extensions/lifecycle/instance/composed-functions'
import { placedFunctionTag } from '@/v2019C1/extensions/lifecycle/layers/function/placed-function-tag'
import { throwRefusal } from '@/v2019C1/extensions/lifecycle/refusal'
import { isTopologyLevel } from '@/v2019C1/helpers'

import type { AssertCopyFitsParams } from './copy.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Refuse, before anything is read beyond the documents and the copied root, a copy the report and the apply do not
 * offer, with `OPTION_NOT_AVAILABLE`: one read from another document than the one it is pasted into, or made with
 * another verb than `fsd` or `asd` (`meta: { option: 'scenario', value: 'copy' }`); a root other than a Function (fsd)
 * or an Application (asd) (`{ option: 'ref', value: <its tag> }`); an application merged onto the functions it
 * composes (`{ option: 'sharedFunctions', value: 'merge' }`); an application whose functions sit under several parents
 * (`{ option: 'scenario', value: 'copy', reason: 'functions-under-several-parents' }`). A parent the definition does not
 * let the copy sit under is refused with `INVALID_PARENT_CHILD`. Nothing for another scenario.
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
	await assertFunctionsUnderOneParent({
		sourceQuery: target.sourceQuery,
		applicationRef: target.ref,
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

/** Refuse an application whose functions sit under several parents: where each lands is not one choice yet. */
async function assertFunctionsUnderOneParent(params: {
	sourceQuery: Core.Query<Config>
	applicationRef: Scl.Ref<'Application'>
	operation: string
}): Promise<void> {
	const { sourceQuery, applicationRef, operation } = params
	const functionRefs = await findComposedFunctionRefs(sourceQuery, applicationRef)
	const functions = await sourceQuery.getRecords(functionRefs)
	const parents = new Set(
		functions.flatMap(function parentOf(record) {
			return record?.parent ? [record.parent.id] : []
		}),
	)
	if (parents.size <= 1) return
	throwRefusal({
		code: 'OPTION_NOT_AVAILABLE',
		reason: 'copy-not-offered',
		meta: { option: 'scenario', value: 'copy', reason: 'functions-under-several-parents' },
		detail: `${operation}: the functions the application composes sit under ${parents.size} parents: a copy lands them under one`,
	})
}
