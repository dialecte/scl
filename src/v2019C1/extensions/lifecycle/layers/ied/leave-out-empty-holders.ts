import { FUNCTION_REFERENCE_HOLDER_TAGS, LNODE_SCOPE_TAGS } from './ied-process.constants'
import { keptProcessIds } from './kept-process-ids'

import { resolveDefinition } from '@dialecte/core/utils'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { requiredChildTags } from '@/v2019C1/helpers/requires-child-element'

import type { ProcessScope } from './ied-process.types'

/**
 * What the process part leaves out once its references are decided: an application, a function role or an allocation
 * role naming no function it writes, then, until nothing changes, an element left without every kind of child it must
 * hold and held in the source (a variable without its applications, an empty set of relations or resources).
 */
export function leaveOutEmptyHolders(scope: ProcessScope): ReadonlySet<string> {
	const leaveOut = new Set([...scope.leaveOut, ...functionlessHolders(scope)])
	for (;;) {
		const emptied = emptiedElements({ ...scope, leaveOut })
		if (emptied.length === 0) return leaveOut
		for (const id of emptied) leaveOut.add(id)
	}
}

/** The written holders of function references (applications and roles) none of whose references is written. */
function functionlessHolders(scope: ProcessScope): string[] {
	const kept = keptProcessIds(scope)
	const naming = new Set<string>()
	for (const { record, ancestry } of scope.index.nodes) {
		if (record.tagName !== 'FunctionRef' || !kept.has(record.id)) continue
		for (const ancestor of ancestry) naming.add(ancestor.id)
	}
	return scope.index.nodes
		.filter(function namesNoFunction({ record }) {
			return (
				FUNCTION_REFERENCE_HOLDER_TAGS.has(record.tagName) &&
				kept.has(record.id) &&
				!naming.has(record.id)
			)
		})
		.map(function idOf({ record }) {
			return record.id
		})
}

/**
 * The written elements outside the frame that must hold a child of a kind, had one in the source, and have none
 * written. An element of the frame is not one: the frame gives it what it must hold.
 */
function emptiedElements(scope: ProcessScope): string[] {
	const { index } = scope
	const kept = keptProcessIds(scope)
	const emptied: string[] = []
	for (const id of kept) {
		const node = index.byId.get(id)
		if (!node || LNODE_SCOPE_TAGS.has(node.record.tagName)) continue
		const children = index.childrenOf.get(id) ?? []
		const definition = resolveDefinition({
			dialecteConfig: SCL_DIALECTE_CONFIG,
			record: node.record,
		})
		const missing = [...requiredChildTags(definition?.contentModel)].some(function lacks(tagName) {
			const ofKind = children.filter((child) => child.record.tagName === tagName)
			return ofKind.length > 0 && !ofKind.some((child) => kept.has(child.record.id))
		})
		if (missing) emptied.push(id)
	}
	return emptied
}
