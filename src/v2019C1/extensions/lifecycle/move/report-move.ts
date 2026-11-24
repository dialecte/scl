import { judgeMovedName } from './move-name'
import { FOLLOWING_STEPS, MOVE_ANCHOR_REFUSAL_KEYS } from './move.constants'

import { ERROR_CATALOG, throwDialecteError, toDialecteError } from '@dialecte/core'
import { toRef } from '@dialecte/core/helpers'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { editableAttributes } from '@/v2019C1/extensions/lifecycle/constraints/classify-attribute'
import { REFERENCE_ATTRIBUTES_BY_TAG } from '@/v2019C1/extensions/reference/constants/reference-uuids.constants'
import { planCommit } from '@/v2019C1/hooks/before-commit/before-commit'
import { hasAttributeChange } from '@/v2019C1/hooks/shared/record-ops'

import type { MovedElement, MoveRefusal, MoveReport, ReportMoveParams } from './move.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { IdentityCollision } from '@/v2019C1/extensions/lifecycle/constraints/find-identity-collision.types'
import type {
	DecisionGroup,
	DiffNode,
	DiffSummary,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { PlannedCommit } from '@/v2019C1/hooks/before-commit/commit-plan.types'
import type * as Core from '@dialecte/core'

/**
 * Report a move of an element within its document for a merge review, before it is written: the element, where from
 * and where to, how many records it carries and how many references follow it, a name taken at its new parent with
 * the name the engine proposes, and every refusal up front (core's refusal of the anchors, a move the commit does not
 * follow, an all-identity key the element shares there). The commit's side effects are not in it: the preview after
 * `applyMove` lists them.
 *
 * The instance's `title` is the element's name (its tag when it has none: no description is read), and `upToDate` holds
 * only when there is nothing to move.
 *
 * It stages the move in the transaction it is given, which must hold nothing staged (`ASSERTION_FAILED` otherwise):
 * the caller discards that transaction (core keeps no savepoint) and writes the move with `applyMove` in another.
 *
 * @intent review a cut and paste before it is written, report a move of an element to another parent
 */
export async function reportMove(
	tx: Core.Transaction<Config>,
	params: ReportMoveParams,
): Promise<MoveReport> {
	const { ref, parent, before } = params
	if (tx.getStagedOperations().length > 0) {
		return throwDialecteError('ASSERTION_FAILED', {
			detail:
				'reportMove: the transaction holds staged writes; report a move in a transaction of its own, then discard it',
		})
	}
	const missing = await missingAnchor(tx, { refs: [ref, parent] })
	if (missing) return refusedReport({ refusals: [missing] })

	const anchorRefusal = await tx.any
		.move(ref, { parent, ...(before ? { before } : {}) })
		.then(() => undefined, anchorRefusalOf)
	if (anchorRefusal) return refusedReport({ refusals: [anchorRefusal] })

	const operations = tx.getStagedOperations()
	if (operations.length === 0) return nothingToMoveReport()
	// a reorder among the children of the same parent stages that parent only
	const movedOperation = operations.find(
		(operation) => operation.status === 'updated' && operation.newRecord.id === ref.id,
	)
	const moved = movedOperation?.status === 'updated' ? movedOperation : undefined

	const planned = await planCommit({ operations, query: tx, collect: true })
	const judged = await judgeMovedName(tx, { ref })
	const from = toRef(moved?.oldRecord.parent ?? parent) as Scl.Ref<Scl.ElementsOf>
	const to = toRef(moved?.newRecord.parent ?? parent) as Scl.Ref<Scl.ElementsOf>
	const reordered = from.id === to.id
	const move: MovedElement = {
		element: elementOf(ref),
		from: elementOf(from),
		to: elementOf(to),
		subtreeSize: reordered ? 1 : planned.carried,
		followingReferences: reordered ? 0 : followingReferencesOf({ planned }),
		...(reordered ? { reordered: true } : {}),
		...(judged.nameTaken ? { nameTaken: judged.nameTaken } : {}),
	}
	const refusals: MoveRefusal[] = [
		...planned.refusals,
		...(judged.identityCollision
			? [identityCollisionRefusal({ ref, collision: judged.identityCollision })]
			: []),
	]
	const name = await tx.getAttribute(ref, { name: 'name', defaults: 'none' })
	return movedReport({ ref, from, to, move, refusals, title: name || ref.tagName })
}

/**
 * Core's refusal of a move's anchors, as a refusal of the report; any other error thrown again. An element the
 * document does not hold is a refusal only for the element and its parent, read before the move: thrown again here.
 */
function anchorRefusalOf(error: unknown): MoveRefusal {
	const refused = toDialecteError(error)
	const key = MOVE_ANCHOR_REFUSAL_KEYS.find((anchorKey) => anchorKey === refused?.key)
	if (!refused || !key) throw error
	return { key, code: refused.code, meta: refused.meta, detail: refused.detail }
}

/** The first of the refs the document does not hold, as the refusal core gives an element it does not find. */
async function missingAnchor(
	tx: Core.Transaction<Config>,
	params: { refs: readonly Scl.Ref<Scl.ElementsOf>[] },
): Promise<MoveRefusal | undefined> {
	const records = await tx.getRecords([...params.refs])
	const index = records.findIndex((record) => !record)
	const missing = params.refs[index]
	if (index < 0 || !missing) return undefined
	return {
		key: 'ELEMENT_NOT_FOUND',
		code: ERROR_CATALOG.ELEMENT_NOT_FOUND.code,
		meta: { element: { tagName: missing.tagName, id: missing.id } },
		detail: `reportMove: the document holds no ${missing.tagName} "${missing.id}"`,
	}
}

/**
 * The references the commit rewrites to follow the move: the distinct records whose reference attributes (their uuid,
 * path or names) the steps following references change, those the move removes or clears left out. A reference the
 * commit only carries elsewhere (an address following its control block), or whose children change, is not counted.
 */
function followingReferencesOf(params: { planned: PlannedCommit }): number {
	const { planned } = params
	const removed = new Set(planned.moveRemovals.map((removal) => removal.element.id))
	const following = new Set<string>()
	for (const step of FOLLOWING_STEPS) {
		for (const operation of planned.stagedBy.get(step) ?? []) {
			if (operation.status !== 'updated' || removed.has(operation.newRecord.id)) continue
			const names = REFERENCE_ATTRIBUTES_BY_TAG.get(operation.newRecord.tagName)
			if (names && hasAttributeChange({ ...operation, names: [...names] })) {
				following.add(operation.newRecord.id)
			}
		}
	}
	return following.size
}

/** The refusal of an element sharing at its new parent a key none of whose fields can be changed. */
function identityCollisionRefusal(params: {
	ref: Scl.Ref<Scl.ElementsOf>
	collision: IdentityCollision
}): MoveRefusal {
	const { ref, collision } = params
	const { constraint, fields, collidesWith } = collision
	return {
		key: 'IDENTITY_COLLISION',
		code: SCL_ERRORS.IDENTITY_COLLISION.code,
		meta: {
			constraint,
			fields,
			element: { tagName: ref.tagName, id: ref.id },
			collidesWith: { tagName: collidesWith.tagName, id: collidesWith.id },
		},
		detail: `<${ref.tagName}> "${ref.id}" shares with <${collidesWith.tagName}> "${collidesWith.id}" every field of ${constraint} (${fields.join(', ')}): none can be changed`,
	}
}

/** The report of a move staged: its moved node and its group, with what it refuses. */
function movedReport(params: {
	ref: Scl.Ref<Scl.ElementsOf>
	from: Scl.Ref<Scl.ElementsOf>
	to: Scl.Ref<Scl.ElementsOf>
	move: MovedElement
	refusals: MoveRefusal[]
	title: string
}): MoveReport {
	const { ref, from, to, move, refusals, title } = params
	// a move keeps the element's ids: it is its own source, instance and applied element
	const node: DiffNode = {
		change: 'moved',
		tagName: ref.tagName,
		sourceRef: ref,
		instanceRef: ref,
		appliedRef: ref,
		movedFrom: from,
		movedTo: to,
		children: [],
	}
	const group: DecisionGroup = {
		id: elementOf(ref).id,
		change: 'moved',
		title: `moved ${ref.tagName}`,
		primary: node,
		companions: [],
		dependsOn: [],
		suggestedAction: 'accept',
		editableAttributes: editableAttributes(ref.tagName),
	}
	return {
		instances: [
			{
				rootRef: ref,
				title,
				linked: false,
				upToDate: false,
				tree: node,
				groups: [group],
				mappings: [],
			},
		],
		needsDecisions: move.nameTaken !== undefined,
		summary: { ...emptySummary(), moved: 1 },
		mappings: [],
		templateInstances: [],
		move,
		refusals,
	}
}

/** The report of a move core refused: nothing staged, nothing to review but the refusals. */
function refusedReport(params: { refusals: MoveRefusal[] }): MoveReport {
	return { ...emptyReport(), refusals: params.refusals }
}

/** The report of a move to where the element already is. */
function nothingToMoveReport(): MoveReport {
	return { ...emptyReport(), refusals: [], nothingToMove: true }
}

/** A report with nothing in it. */
function emptyReport(): Omit<MoveReport, 'refusals'> {
	return {
		instances: [],
		needsDecisions: false,
		summary: emptySummary(),
		mappings: [],
		templateInstances: [],
	}
}

/** An element a report names, by its tag and record id. */
function elementOf(ref: Scl.Ref<Scl.ElementsOf>): { tagName: string; id: string } {
	return { tagName: ref.tagName, id: ref.id ?? '' }
}

/** A summary counting nothing. */
function emptySummary(): DiffSummary {
	return { added: 0, removed: 0, modified: 0, moved: 0, kept: 0 }
}
