import { SPECIFIED_IED_NAME_ATTRIBUTE } from '@/v2019C1/constants'
import { planReleases } from '@/v2019C1/extensions/data-model/naming/release-plan'
import { readSpecificationRelease } from '@/v2019C1/extensions/data-model/query/specification-release'
import { readSpecNamingsById } from '@/v2019C1/extensions/reference/query/build/spec-namings'
import { readAttributes } from '@/v2019C1/helpers'

import type { LNodeReleasePlan, PlanLNodeReleasesParams } from './plan-lnode-releases.types'
import type { Config } from '@/v2019C1/config'
import type { ReleasedLNode } from '@/v2019C1/extensions/data-model/naming/release-plan.types'
import type * as Core from '@dialecte/core'

/**
 * What releasing the LNodes given writes on each, by LNode id, read once whatever their number: each goes back to the
 * specification its `LNodeSpecNaming` keeps (see `releaseLNodeBindings`, which writes it). Their namings and the
 * specification IEDs those name are read once; the plan itself is `planReleases`.
 */
export async function planLNodeReleases(
	query: Core.Query<Config>,
	params: PlanLNodeReleasesParams,
): Promise<LNodeReleasePlan> {
	const { lnodes: records } = params
	if (records.length === 0) return new Map()
	const namings = await readSpecNamingsById(query, { records })
	const lnodes: ReleasedLNode[] = records.map((record) => {
		const naming = namings.get(record.id)
		return {
			id: record.id,
			lnodeAttributes: readAttributes({ record, defaults: 'none' }),
			specifiedAttributes: naming && readAttributes({ record: naming, defaults: 'none' }),
		}
	})
	const iedNames = new Set(
		lnodes.flatMap((lnode) => lnode.specifiedAttributes?.[SPECIFIED_IED_NAME_ATTRIBUTE] ?? []),
	)
	const release = await readSpecificationRelease(query, { iedNames })
	return planReleases({ lnodes, release })
}
