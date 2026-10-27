import { leaveOutOfScope } from './contribution-scope'
import { diff } from './diff'
import { reconcile } from './reconcile'

import type { ContributeResult, ContributionParams } from './contribute.types'
import type { InstanceDiff } from './diff.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Pour a source element the project shares into the element of the project it lands on — the one rule a first
 * placement writes (a category or a role mapped onto the project's, a level's own content), its report reads
 * ({@link describeContribution}) and a copy writes:
 *  - a container lands on the child the project holds for it — carrying its uuid as lineage, else of its name —, and
 *    nothing the project holds is rewritten;
 *  - a reference is the placement's own: added, unless the child it lands beside already names the very element it
 *    names (one a source element was mapped onto); one naming what the placement does not place (outside `scope`) is
 *    not written, nor what the consumer left out.
 * What it adds keeps the source's identity: the caller finalizes it with the rest of the placement, through the clone
 * mappings and the redirect mappings returned.
 */
export async function contribute(
	tx: Core.Transaction<Config>,
	params: ContributionParams,
): Promise<ContributeResult> {
	const { sourceQuery, source, target } = params
	const notSelected = await leaveOutOfScope(sourceQuery, {
		root: source,
		scope: params.scope,
		leftOut: params.leftOut,
		omit: params.omit,
	})
	const { cloneMappings, landedOn } = await reconcile(tx, {
		sourceQuery,
		sourceRootRef: source,
		instanceRootRef: target,
		contributeOnly: true,
		matchKey: params.matchKey,
		// a container of a child's name is the project's own and is contributed to: nothing added is numbered
		bumpsCollisions: false,
		// nothing the project holds is removed nor renamed
		removalBase: { kind: 'none' },
		namesFollow: 'project',
		redirectMappings: params.redirectMappings,
		notSelected,
		omit: params.omit,
		placeholderLineages: params.placeholderLineages,
		sourceIsProject: params.sourceIsProject,
	})
	const sourceUuid = await sourceQuery.any.getAttribute(source, { name: 'uuid' })
	const rootLanding = sourceUuid ? [{ sourceUuid, target }] : []
	return { cloneMappings, redirectMappings: [...rootLanding, ...landedOn] }
}

/**
 * What {@link contribute} writes, as the report lists it: the source element compared with the element of the project
 * it lands on, only what it adds listed.
 */
export async function describeContribution(
	query: Core.Query<Config>,
	params: ContributionParams,
): Promise<InstanceDiff> {
	const { sourceQuery, source, target } = params
	const notSelected = await leaveOutOfScope(sourceQuery, {
		root: source,
		scope: params.scope,
		leftOut: params.leftOut,
		omit: params.omit,
	})
	return diff({
		sourceQuery,
		targetQuery: query,
		sourceRootRef: source,
		instanceRootRef: target,
		instanceRootIsProjectOwned: true,
		contributeOnly: true,
		refsAlwaysAdded: true,
		keepLeftoverRefs: true,
		matchKey: params.matchKey,
		removalBase: { kind: 'none' },
		namesFollow: 'project',
		redirectMappings: params.redirectMappings,
		notSelected,
		omit: params.omit,
		placeholderLineages: params.placeholderLineages,
		sourceIsProject: params.sourceIsProject,
	})
}
