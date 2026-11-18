import {
	CONTRIBUTED_SUBNETWORK_CHILDREN,
	SUBNETWORK_TAG,
} from './place-ied-communication.constants'
import { readIedCommunication } from './read-ied-communication'

import { toRef } from '@dialecte/core/helpers'

import { contribute, describeContribution } from '@/v2019C1/extensions/lifecycle/engine/contribute'
import { diff } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { deep } from '@/v2019C1/extensions/lifecycle/transplant/transaction'

import type {
	DescribeIedCommunicationParams,
	IedCommunicationParams,
	ReadCommunicationOfParams,
} from './place-ied-communication.types'
import type { IedCommunicationDescription } from './read-ied-communication.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { ContributeResult } from '@/v2019C1/extensions/lifecycle/engine/contribute.types'
import type { InstanceDiff } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/**
 * Pour the Communication part of a placed IED into the project's Communication (the source's copied when the project
 * has none): its access points' `ConnectedAP`s, each under the project's `SubNetwork` carrying its subnetwork's uuid as lineage,
 * else of its name, or under that subnetwork added. What the source holds for other IEDs is not written. What it adds
 * keeps the source's identity: the caller finalizes it with the IED, through the mappings returned.
 */
export async function placeIedCommunication(
	tx: Core.Transaction<Config>,
	params: IedCommunicationParams,
): Promise<ContributeResult> {
	const { sourceQuery, iedRef, anchor } = params
	const description = await readCommunicationOf(sourceQuery, { iedRef })
	const [communication] = description.satelliteRefs
	if (!communication) return { cloneMappings: [], redirectMappings: [] }
	const root = await tx.getRecord(anchor)
	const target = root?.children.find((child) => child.tagName === 'Communication')
	// a project with no Communication takes the source's, holding only what the IED is on
	if (!target) {
		const placed = await deep(tx, {
			sourceQuery,
			ref: communication,
			targetParent: anchor,
			withTypes: false,
			leaveOut: description.leaveOut,
		})
		return { cloneMappings: placed.cloneMappings, redirectMappings: [] }
	}
	return contribute(tx, {
		sourceQuery,
		source: communication,
		target: toRef(target) as Scl.Ref<'Communication'>,
		scope: description.scope,
		matchKey: params.matchKey,
		leftOut: description.leaveOut,
		contributedChildren: contributedChildrenOf(params),
		placeholderLineages: params.placeholderLineages,
		redirectMappings: params.redirectMappings,
	})
}

/**
 * What {@link placeIedCommunication} writes, as a report lists it: the source Communication compared with the
 * project's, only what it adds listed; all of it added when the project has none. Nothing for a source whose IED is on
 * no subnetwork.
 */
export async function describeIedCommunication(
	query: Core.Query<Config>,
	params: DescribeIedCommunicationParams,
): Promise<InstanceDiff | undefined> {
	const { sourceQuery, iedRef, anchor } = params
	const description = await readCommunicationOf(sourceQuery, { iedRef })
	const [communication] = description.satelliteRefs
	if (!communication) return undefined
	const root = await query.getRecord(anchor)
	const target = root?.children.find((child) => child.tagName === 'Communication')
	if (target) {
		return describeContribution(query, {
			sourceQuery,
			source: communication,
			target: toRef(target) as Scl.Ref<'Communication'>,
			scope: description.scope,
			matchKey: params.matchKey,
			leftOut: description.leaveOut,
			contributedChildren: contributedChildrenOf(params),
			placeholderLineages: params.placeholderLineages,
			redirectMappings: params.redirectMappings,
		})
	}
	return diff({
		sourceQuery,
		targetQuery: query,
		sourceRootRef: communication,
		diffPolicy: params.diffPolicy,
		notSelected: description.leaveOut,
		placeholderLineages: params.placeholderLineages,
		redirectMappings: params.redirectMappings,
	})
}

/**
 * What the IED contributes below a subnetwork the project holds, on an update (`keepsSubNetworkSettings`): its
 * connections only, the subnetwork's settings (its bit rate, its text, its private data) being shared by every IED on
 * it. A first placement brings what the source holds.
 */
function contributedChildrenOf(
	params: IedCommunicationParams,
): ReadonlyMap<string, ReadonlySet<string>> | undefined {
	if (!params.keepsSubNetworkSettings) return undefined
	return new Map([[SUBNETWORK_TAG, CONTRIBUTED_SUBNETWORK_CHILDREN]])
}

/** The Communication slice of the source IED, by its name. */
async function readCommunicationOf(
	sourceQuery: Core.Query<Config>,
	params: ReadCommunicationOfParams,
): Promise<IedCommunicationDescription> {
	const { name } = await sourceQuery.getAttributes(params.iedRef)
	return readIedCommunication(sourceQuery, { iedRef: params.iedRef, iedName: name ?? '' })
}
