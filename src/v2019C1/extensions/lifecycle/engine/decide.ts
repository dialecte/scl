import { collectIdentityCollisions } from './identity-collisions'

import { invariant } from '@dialecte/core/utils'

import { SCL_ERRORS } from '@/v2019C1/errors'
import { refuseIdentityCollision } from '@/v2019C1/extensions/lifecycle/constraints/find-identity-collision'

import type { AcceptedIds, CollisionOverrides } from './decide.types'
import type {
	DecisionGroup,
	DecisionMap,
	DiffNode,
	DiffReport,
	GroupDecision,
	NodeIdentityCollision,
	ReportInstance,
} from './diff.types'
import type { AnyRefOrRecord } from '@dialecte/core'

/** The decision groups scoped to one instance root (empty when the instance is absent/up-to-date). */
export function groupsForInstance(
	report: DiffReport | undefined,
	instanceId: string,
): DecisionGroup[] {
	return report?.instances.find((instance) => instance.rootRef?.id === instanceId)?.groups ?? []
}

/** The report instance anchored to an EXISTING instance root (reconcile path). */
export function reportInstanceById(
	report: DiffReport | undefined,
	instanceId: string,
): ReportInstance | undefined {
	return report?.instances.find((instance) => instance.rootRef?.id === instanceId)
}

/**
 * The report instances of a FIRST placement made for `placedFor`: those the report lists for it
 * when it lists the placement several times, else those it lists once.
 */
export function firstTimeReportInstances(
	report: DiffReport | undefined,
	params: { placedFor?: AnyRefOrRecord },
): ReportInstance[] {
	const firstTime = report?.instances.filter((instance) => !instance.rootRef) ?? []
	const placed = firstTime.filter(
		(instance) => instance.placedFor && instance.placedFor.id === params.placedFor?.id,
	)
	return placed.length > 0 ? placed : firstTime.filter((instance) => !instance.placedFor)
}

/**
 * The report instance for a FIRST-TIME instantiate: no `rootRef` yet, its diff tree rooted at the
 * source element `sourceRootId` — the one for `placedFor` when the placement is listed several times.
 * Lets a verb annotate the added instance's nodes after the write.
 */
export function firstTimeReportInstance(
	report: DiffReport | undefined,
	params: { sourceRootId: string; placedFor?: AnyRefOrRecord },
): ReportInstance | undefined {
	return firstTimeReportInstances(report, params).find(
		(instance) => instance.tree.sourceRef?.id === params.sourceRootId,
	)
}

/**
 * The groups that gate a FIRST placement made for `placedFor`: its own when the placement is listed
 * several times, else every group of the report.
 */
export function firstTimeGroups(
	report: DiffReport | undefined,
	params: { placedFor?: AnyRefOrRecord },
): DecisionGroup[] {
	const placed = firstTimeReportInstances(report, params).filter((instance) => instance.placedFor)
	if (placed.length > 0) return placed.flatMap((instance) => instance.groups)
	return report ? report.instances.flatMap((instance) => instance.groups) : []
}

/** The action of a decision (absent -> accept; string or object form). */
export function decisionAction(decision: GroupDecision | undefined): 'accept' | 'skip' {
	if (decision === undefined) return 'accept'
	if (typeof decision === 'string') return decision
	return decision.action
}

/** The user-edited values carried by a decision, if any. */
function decisionValues(decision: GroupDecision | undefined): Record<string, string> | undefined {
	return typeof decision === 'object' ? decision.values : undefined
}

/** The resolved action for a group: an explicit decision, else its `suggestedAction`. */
function resolvedAction(params: {
	group: DecisionGroup
	decisions: DecisionMap
}): 'accept' | 'skip' {
	const decision = params.decisions.get(params.group.id)
	if (decision === undefined) return params.group.suggestedAction
	return decisionAction(decision)
}

/** A group is accepted when its resolved action is not `skip`. */
function isAccepted(params: { group: DecisionGroup; decisions: DecisionMap }): boolean {
	return resolvedAction(params) !== 'skip'
}

/**
 * Whether an instance follows the newer source after its update, so that it records the source file it now holds: it
 * does unless every change the source brings to it is declined. An instance the source changes nothing for follows it
 * (it holds that revision already); the elements the project added (`target-only`) are the project's, not a change
 * the source brings. Without decisions every change is written: it follows.
 */
export function followsSource(params: {
	groups: readonly DecisionGroup[]
	decisions: DecisionMap | undefined
}): boolean {
	const { groups, decisions } = params
	if (!decisions) return true
	const brought = groups.filter((group) => group.change !== 'target-only')
	return brought.length === 0 || brought.some((group) => isAccepted({ group, decisions }))
}

/**
 * The user-edited values for each accepted group, keyed by the primary's SOURCE id
 * (the placed element is matched by its source at instantiate time). Skipped groups
 * and groups with no edits are omitted.
 */
export function collisionOverrides(params: {
	groups: DecisionGroup[]
	decisions: DecisionMap
}): CollisionOverrides {
	const { groups, decisions } = params
	const out = new Map<string, Record<string, string>>()
	for (const group of groups) {
		const decision = decisions.get(group.id)
		if (resolvedAction({ group, decisions }) === 'skip') continue
		const values = decisionValues(decision)
		const sourceId = group.primary.sourceRef?.id
		if (values && sourceId) out.set(sourceId, values)
	}
	return out
}

/**
 * Reject, before any write, decisions the report does not hold, and a decision set the report's dependencies refuse:
 * a decision for a group the report does not list, a group depending on a group the report does not list, a group
 * accepted while a group it depends on is skipped.
 */
export function assertDecisionsCoherent(params: {
	groups: DecisionGroup[]
	decisions: DecisionMap
}): void {
	const { groups, decisions } = params
	const groupsById = new Map(groups.map((group) => [group.id, group]))
	for (const groupId of decisions.keys()) {
		invariant(groupsById.has(groupId), {
			key: SCL_ERRORS.DECISION_UNKNOWN,
			meta: { groupId },
			detail: `a decision is passed for group "${groupId}", which the report does not list`,
		})
	}
	for (const group of groups) {
		for (const dependencyId of group.dependsOn) {
			const dependency = groupsById.get(dependencyId)
			invariant(dependency, {
				key: SCL_ERRORS.DECISION_DEPENDENCY_UNKNOWN,
				meta: { groupId: group.id, dependencyId },
				detail: `group "${group.id}" depends on group "${dependencyId}", which the report does not list`,
			})
			if (!isAccepted({ group, decisions })) continue
			invariant(isAccepted({ group: dependency, decisions }), {
				key: SCL_ERRORS.DECISION_DEPENDENCY_SKIPPED,
				meta: { groupId: group.id, dependencyId },
				detail: `decision accepts group "${group.id}" but its dependency "${dependencyId}" is skipped`,
			})
		}
	}
}

/**
 * The project elements an accepted group writes for: the instance roots, and the elements a placement listed several
 * times is made for (`placedFor`), of every report instance holding an accepted group — by record id.
 */
export function writtenInstanceIds(params: {
	report: DiffReport
	decisions: DecisionMap
}): Set<string> {
	const { report, decisions } = params
	const written = new Set<string>()
	for (const instance of report.instances) {
		if (!instance.groups.some((group) => isAccepted({ group, decisions }))) continue
		for (const element of [instance.rootRef, instance.placedFor]) {
			if (element?.id) written.add(element.id)
		}
	}
	return written
}

/**
 * Refuse, before any write, a decision set accepting the addition of an element that collides with one the instance
 * holds on a key none of whose fields can be changed — unless an accepted group releases that element.
 */
export function assertNoAcceptedCollision(params: {
	groups: DecisionGroup[]
	decisions: DecisionMap
}): void {
	const [refused] = acceptedCollisions(params)
	if (!refused) return
	const { node, collision } = refused
	invariant(node.sourceRef, {
		detail: `an added <${node.tagName}> carries no source element`,
	})
	refuseIdentityCollision({ element: node.sourceRef, collision })
}

/**
 * The identity collisions of the accepted groups that no accepted group releases: an accepted group releases the
 * element collided with when it removes it, or when it changes one of the fields the collision compares on it.
 */
export function acceptedCollisions(params: {
	groups: DecisionGroup[]
	decisions: DecisionMap
}): NodeIdentityCollision[] {
	const { groups, decisions } = params
	const accepted = groups.filter((group) => isAccepted({ group, decisions }))
	const { instanceIds: removed } = acceptedRefIds({ groups, decisions })
	const changed = changedAttributesByInstance(accepted)
	return accepted
		.flatMap((group) => collectIdentityCollisions([group.primary, ...group.companions]))
		.filter(({ collision }) => {
			const { id } = collision.collidesWith
			const changedOnIt = changed.get(id)
			return !removed.has(id) && !collision.fields.some((field) => changedOnIt?.has(field))
		})
}

/** The attributes the given groups change, by the record id of the instance element they change them on. */
function changedAttributesByInstance(groups: readonly DecisionGroup[]): Map<string, Set<string>> {
	const changed = new Map<string, Set<string>>()
	for (const group of groups) {
		for (const node of [group.primary, ...group.companions]) collectChanges({ node, changed })
	}
	return changed
}

function collectChanges(params: { node: DiffNode; changed: Map<string, Set<string>> }): void {
	const { node, changed } = params
	const id = node.instanceRef?.id
	if (id && node.attributeChanges) {
		const names = changed.get(id) ?? new Set<string>()
		for (const { name } of node.attributeChanges) names.add(name)
		changed.set(id, names)
	}
	for (const child of node.children) collectChanges({ node: child, changed })
}

/**
 * Collect the record ids reconcile may write, from every accepted group's
 * primary + companions. Added/modified nodes contribute their `sourceRef`
 * (reconcile matches/adds by source); removed nodes contribute `instanceRef`.
 *
 * A companion can be a STRUCTURED subtree (a satellite folded onto an existing
 * container: an unchanged container carrying a changed descendant), so recurse each
 * node and skip unchanged context — otherwise a nested accepted change is never
 * written.
 */
export function acceptedRefIds(params: {
	groups: DecisionGroup[]
	decisions: DecisionMap
}): AcceptedIds {
	const { groups, decisions } = params
	return collectGroupIds(groups.filter((group) => isAccepted({ group, decisions })))
}

/**
 * The record ids of what the consumer left out: those of every skipped group's primary and
 * companions, as {@link acceptedRefIds} reads them. A first placement writes everything else —
 * including what the report does not list.
 */
export function leftOutRefIds(params: {
	groups: DecisionGroup[]
	decisions: DecisionMap
}): AcceptedIds {
	const { groups, decisions } = params
	return collectGroupIds(groups.filter((group) => !isAccepted({ group, decisions })))
}

function collectGroupIds(groups: readonly DecisionGroup[]): AcceptedIds {
	const sourceIds = new Set<string>()
	const instanceIds = new Set<string>()
	for (const group of groups) {
		// what the project added below a change of the template is a group of its own: not this one's
		const ownOnly = group.change === 'target-only'
		for (const node of [group.primary, ...group.companions]) {
			collectNodeIds({ node, sourceIds, instanceIds, ownOnly })
		}
	}
	return { sourceIds, instanceIds }
}

/**
 * Collect the ids of a node and every descendant (structured companions carry nesting) — but those of an element the
 * project added, unless the group is that element's (`ownOnly`).
 */
function collectNodeIds(params: {
	node: DiffNode
	sourceIds: Set<string>
	instanceIds: Set<string>
	ownOnly: boolean
}): void {
	const { node, sourceIds, instanceIds, ownOnly } = params
	collectNodeId({ node, sourceIds, instanceIds })
	for (const child of node.children) {
		if (!ownOnly && child.change === 'target-only') continue
		collectNodeIds({ node: child, sourceIds, instanceIds, ownOnly })
	}
}

function collectNodeId(params: {
	node: DiffNode
	sourceIds: Set<string>
	instanceIds: Set<string>
}): void {
	const { node, sourceIds, instanceIds } = params
	if (node.change === 'unchanged') return
	if (node.change === 'removed' || node.change === 'target-only') {
		if (node.instanceRef?.id) instanceIds.add(node.instanceRef.id)
	} else if (node.sourceRef?.id) {
		sourceIds.add(node.sourceRef.id)
	}
}
