import { asd as updateAsd } from './asd'
import { fsd as updateFsd } from './fsd'

import { throwDialecteError } from '@dialecte/core'
import { toRef } from '@dialecte/core/helpers'

import { acceptedRefIds, groupsForInstance } from '@/v2019C1/extensions/lifecycle/engine/decide'
import { deleteDropped } from '@/v2019C1/extensions/lifecycle/engine/removal-base'
import { repointAddedReferences } from '@/v2019C1/extensions/lifecycle/engine/repoint-added-references'
import {
	findDroppedPrimaries,
	resolvePrimaryParents,
	reconcileTopologyFrame,
	landGroundedTerminals,
} from '@/v2019C1/extensions/lifecycle/layers/topology'

import type { WrittenApplications } from './asd.types'
import type { UpdateProcessSectionParams, WritePrimaryMovesParams } from './process-section.types'
import type { Scl, Config } from '@/v2019C1/config'
import type {
	AppliedFunction,
	AppliedInstance,
} from '@/v2019C1/extensions/lifecycle/apply/apply.types'
import type * as Core from '@dialecte/core'

/**
 * Reconcile the instances of a process section (a substation scope and what it holds) the project already holds with
 * a newer revision of it: the topology frame's own content first (BayType, equipment, attributes), then the
 * applications and functions each instance holds that the revision dropped, then each Application through
 * `update.asd` (cascading to its composed Functions) and each standalone Function through `update.fsd`, a primary the
 * revision gained placed once per instance of the unit; last, the references the frame gained repointed and its
 * terminals on the predefined grounded node landed. `report` + `decisions` gate every write, partitioned per instance.
 * Records no provenance: the caller does.
 */
export async function updateProcessSection(
	tx: Core.Transaction<Config>,
	params: UpdateProcessSectionParams,
): Promise<WrittenApplications> {
	const {
		sourceQuery,
		targetParent,
		scenario,
		report,
		decisions,
		keepNameTypesFrom,
		targetInstance,
		scope,
		policy,
		removalBase,
	} = params
	const { root } = scope
	const { applications: applicationRefs, standaloneFunctions } = params.reconcilables
	const { matchKey, identityMode, bumpsCollisions, namesFollow } = policy

	const applications: AppliedInstance<'Application'>[] = []
	const functions: AppliedFunction[] = []

	// reconcile the topology frame's OWN content (BayType/equipment/attrs) before the fn/app
	// cascade; the fn/app tags are a boundary, so the cascade below owns them. Each frame
	// instance is gated by ONLY its own decision groups (from report.ssd) in the full track.
	const { additions: frameAdditions, instanceLevelsList } = await reconcileTopologyFrame(tx, {
		sourceQuery,
		scopeRef: root,
		matchKey,
		identityMode,
		bumpsCollisions,
		removalBase,
		namesFollow,
		placeholderLineages: params.placeholderLineages,
		report,
		decisions,
		targetInstance,
		decisionMappings: params.decisionMappings,
		leftOut: scope.leftOut,
		// a held primary the revision puts on another level moves there once the frame added what it lands in, before
		// the frame's removals: a removed level never takes it
		beforeRemovals: async function movePrimaries({ instanceRootRef, instanceLevels, added }) {
			for (const primaryRef of [...applicationRefs, ...standaloneFunctions]) {
				const placement = await resolvePrimaryParents(tx, {
					sourceQuery,
					primaryRef,
					anchor: targetParent,
					unitId: root.id,
					instanceLevelsList: [instanceLevels],
					matchKey,
					primaryTargets: params.primaryTargets,
					gainedIn: params.gainedIn,
				})
				await writePrimaryMoves(tx, {
					moves: placement.moves,
					report,
					decisions,
					frameAdditions: [{ instanceRootRef, cloneMappings: [...added] }],
				})
			}
		},
	})

	// the applications and functions each instance holds that the newer template no longer does: the update
	// replaces the unit's applications, so a dropped one goes — gated on the removal its report announced
	for (const { instanceRootRef } of frameAdditions) {
		const dropped = await findDroppedPrimaries(tx, {
			sourceQuery,
			scopeRef: root,
			frameInstance: instanceRootRef,
			matchKey,
			removalBase,
			leftOut: scope.leftOut,
			primaryTargets: params.primaryTargets,
		})
		const accepted = decisions
			? acceptedRefIds({ groups: groupsForInstance(report, instanceRootRef.id ?? ''), decisions })
			: undefined
		await deleteDropped(tx, { dropped, accepted })
	}

	for (const applicationRef of applicationRefs) {
		const placement = await resolvePrimaryParents(tx, {
			sourceQuery,
			primaryRef: applicationRef,
			anchor: targetParent,
			unitId: root.id,
			instanceLevelsList,
			matchKey,
			primaryTargets: params.primaryTargets,
			gainedIn: params.gainedIn,
		})
		for (const { parent, placedFor } of placement.places) {
			// its level was left out: so is it (the report made it depend on that level)
			if (!parent) continue
			const result = await updateAsd(tx, {
				sourceQuery,
				applicationRef,
				targetParent: parent,
				placedFor,
				// a gained application is a fresh one in each instance, whatever another instance holds
				scenario,
				placesFresh: placement.gained,
				removalBase,
				placeholderLineages: params.placeholderLineages,
				// placed as part of the substation template: its provenance is the document's
				partOfTemplate: true,
				report,
				decisions,
				keepNameTypesFrom,
				targetInstance: params.primaryTargets ?? targetInstance,
				redirectMappings: params.redirectMappings,
				decisionMappings: params.decisionMappings,
			})
			applications.push(...result.applications)
			functions.push(...result.functions)
		}
	}

	for (const functionRef of standaloneFunctions) {
		const placement = await resolvePrimaryParents(tx, {
			sourceQuery,
			primaryRef: functionRef,
			anchor: targetParent,
			unitId: root.id,
			instanceLevelsList,
			matchKey,
			primaryTargets: params.primaryTargets,
			gainedIn: params.gainedIn,
		})
		for (const { parent, placedFor } of placement.places) {
			if (!parent) continue
			const updated = await updateFsd(tx, {
				sourceQuery,
				functionRef,
				targetParent: parent,
				placedFor,
				scenario,
				placesFresh: placement.gained,
				removalBase,
				placeholderLineages: params.placeholderLineages,
				partOfTemplate: true,
				report,
				decisions,
				keepNameTypesFrom,
				targetInstance: params.primaryTargets ?? targetInstance,
				redirectMappings: params.redirectMappings,
				decisionMappings: params.decisionMappings,
			})
			functions.push(...updated)
		}
	}

	// the references the frame gained can point at anything the cascade placed above; a terminal it gained on the
	// predefined grounded node names the grounded node of its level in that instance
	for (const [index, { instanceRootRef, cloneMappings }] of frameAdditions.entries()) {
		await repointAddedReferences(tx, { cloneMappings, instanceRootRef, matchKey })
		const placedLevels = new Map([
			...(instanceLevelsList[index] ?? []),
			[root.id, toRef(instanceRootRef) as Scl.Ref<Scl.ElementsOf>],
		])
		await landGroundedTerminals(tx, { sourceQuery, cloneMappings, placedLevels })
	}

	return { applications, functions }
}

/**
 * Move each accepted held instance of a primary to the level the revision puts it on (the level of the project, or the
 * one the frame just added for a gained level), the same record: the commit's steps make what names it follow and wrap
 * an application in the level's Private. Without decisions every move is written; a skipped one writes nothing.
 */
async function writePrimaryMoves(
	tx: Core.Transaction<Config>,
	params: WritePrimaryMovesParams,
): Promise<void> {
	const { moves, report, decisions, frameAdditions } = params
	for (const move of moves) {
		const instanceId = move.instance.id ?? ''
		// the move is the root's group of the primary's report instance: its decision, else its suggested action
		const group = report
			? groupsForInstance(report, instanceId).find((candidate) => candidate.change === 'moved')
			: undefined
		const accepted =
			!decisions || !group || (decisions.get(group.id) ?? group.suggestedAction) === 'accept'
		if (!accepted) continue
		const added = frameAdditions
			.find((addition) => addition.instanceRootRef.id === move.placedFor.id)
			?.cloneMappings.find((mapping) => mapping.source.id === move.toSource.id)?.target
		const parent = move.to ?? added
		// the move into a gained level depends on its addition: the decisions are checked before anything is written
		if (!parent) {
			return throwDialecteError('ASSERTION_FAILED', {
				detail: `the move of ${move.instance.tagName} "${instanceId}" found no level ${move.toSource.tagName} "${move.toSource.id}" to move into`,
			})
		}
		await tx.any.move(move.instance, { parent: parent as Scl.Ref<Scl.ElementsOf> })
	}
}
