import { toRef } from '@dialecte/core/helpers'

import type { FileCommunications, ReadFileCommunicationsParams } from './file-communication.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The Communication of both versions of the file, when the update keeps the file's identity (a fork on an open ISD:
 * the Communication section is the file's own, so it follows the other version as a whole) and both hold one.
 * `undefined` otherwise: an IED update describes only the connections it adds (a template update, or an open ISD
 * without a Communication, which takes the other version's through the placement of the IED's connections).
 */
export async function readFileCommunications(
	reader: Core.Query<Config> | Core.Transaction<Config>,
	params: ReadFileCommunicationsParams,
): Promise<FileCommunications | undefined> {
	if (params.policy.placementIdentity !== 'keep') return undefined
	const [sourceRoot, targetRoot] = await Promise.all([
		params.sourceQuery.getRoot(),
		reader.getRecord(params.anchor),
	])
	const source = sourceRoot?.children.find((child) => child.tagName === 'Communication')
	const target = targetRoot?.children.find((child) => child.tagName === 'Communication')
	if (!source || !target) return undefined
	return {
		source: toRef(source) as Scl.Ref<'Communication'>,
		target: toRef(target) as Scl.Ref<'Communication'>,
	}
}
