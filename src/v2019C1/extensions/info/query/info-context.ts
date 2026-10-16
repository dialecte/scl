import { classifyIeds } from '@/v2019C1/extensions/lifecycle/ied/classify-ieds'
import { readAttribute } from '@/v2019C1/helpers'

import type { InfoContext } from './info-context.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { IedKind } from '@/v2019C1/extensions/lifecycle/ied/classify-ieds.types'
import type * as Core from '@dialecte/core'

/** A context whose facts are read on first use and kept for the rest of the call. */
export function createInfoContext(query: Core.Query<Config>): InfoContext {
	let iedKinds: Promise<ReadonlyMap<string, IedKind>> | undefined
	let lns: Promise<ReadonlyMap<string, Scl.Ref<'LN' | 'LN0'>>> | undefined

	return {
		iedKindById() {
			iedKinds ??= readIedKinds(query)
			return iedKinds
		},
		lnByUuid() {
			lns ??= readLnsByUuid(query)
			return lns
		},
	}
}

async function readIedKinds(query: Core.Query<Config>): Promise<ReadonlyMap<string, IedKind>> {
	const classifications = await classifyIeds(query)
	return new Map(classifications.map(({ ied, kind }) => [ied.id, kind]))
}

async function readLnsByUuid(
	query: Core.Query<Config>,
): Promise<ReadonlyMap<string, Scl.Ref<'LN' | 'LN0'>>> {
	const byUuid = new Map<string, Scl.Ref<'LN' | 'LN0'>>()
	for (const tagName of ['LN', 'LN0'] as const) {
		for (const record of await query.getRecordsByTagName(tagName)) {
			const uuid = readAttribute({ record, name: 'uuid' })
			if (uuid) byUuid.set(uuid, { tagName, id: record.id })
		}
	}
	return byUuid
}
