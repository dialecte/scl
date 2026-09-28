import { widen } from '@dialecte/core/helpers'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

const IED_DESCENDANT_TRIGGERS = new Set<string>([
	'ReportControl',
	'LogControl',
	'GSEControl',
	'SampledValueControl',
	'SettingControl',
	'DataSet',
	'FCDA',
	'ExtRef',
	'DAI',
	'Val',
])

const COMMUNICATION_TRIGGERS = new Set<string>([
	'ConnectedAP',
	'Address',
	'P',
	'PhysConn',
	'GSE',
	'SMV',
])

export async function resolveOwningIed<GenericElement extends Scl.ElementsOf>(params: {
	record: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Ref<'IED'> | null> {
	const { record, query } = params
	const tagName = record.tagName as string

	if (COMMUNICATION_TRIGGERS.has(tagName)) return resolveViaConnectedAp({ record, query })
	if (IED_DESCENDANT_TRIGGERS.has(tagName)) return resolveViaAncestors({ record, query })
	return null
}

async function resolveViaAncestors<GenericElement extends Scl.ElementsOf>(params: {
	record: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Ref<'IED'> | null> {
	const { record, query } = params

	const ancestors = await query.findAncestors(widen(record), { stopAtTagName: 'IED' })
	const ied = ancestors.find((ancestor) => ancestor.tagName === 'IED')
	return ied ? { tagName: 'IED', id: ied.id } : null
}

async function resolveViaConnectedAp<GenericElement extends Scl.ElementsOf>(params: {
	record: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Ref<'IED'> | null> {
	const { record, query } = params

	const connectedAp =
		(record.tagName as string) === 'ConnectedAP'
			? widen(record)
			: (await query.findAncestors(widen(record), { stopAtTagName: 'ConnectedAP' })).find(
					(ancestor) => ancestor.tagName === 'ConnectedAP',
				)
	if (!connectedAp) return null

	const { iedName } = await query.getAttributes(connectedAp as Scl.Ref<'ConnectedAP'>)
	if (!iedName) return null

	const [ied] = await query.findByAttributes({ tagName: 'IED', attributes: { name: iedName } })
	return ied ? { tagName: 'IED', id: ied.id } : null
}
