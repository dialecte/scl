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
	'TrgOps',
	'OptFields',
	'RptEnabled',
	'ClientLN',
	'SmvOpts',
	'IEDName',
	'Protocol',
])

const COMMUNICATION_TRIGGERS = new Set<string>([
	'ConnectedAP',
	'Address',
	'P',
	'PhysConn',
	'GSE',
	'SMV',
	'MinTime',
	'MaxTime',
])

const CHILD_TRIGGER_PARENTS: Record<string, string[]> = {
	Val: ['DAI'],
	TrgOps: ['ReportControl', 'LogControl'],
	OptFields: ['ReportControl'],
	RptEnabled: ['ReportControl'],
	ClientLN: ['RptEnabled'],
	SmvOpts: ['SampledValueControl'],
	IEDName: ['GSEControl', 'SampledValueControl'],
	Protocol: ['GSEControl', 'SampledValueControl'],
	MinTime: ['GSE'],
	MaxTime: ['GSE'],
	BitRate: ['SubNetwork'],
}

export async function resolveAffectedIeds<GenericElement extends Scl.ElementsOf>(params: {
	record: Scl.RawRecord<GenericElement>
	query: Core.Query<Config>
}): Promise<Scl.Ref<'IED'>[]> {
	const { record, query } = params
	const tagName = record.tagName as string
	const allowedParents = CHILD_TRIGGER_PARENTS[tagName]
	if (allowedParents && !allowedParents.includes(record.parent?.tagName ?? '')) return []

	if (tagName === 'SubNetwork') return resolveSubNetworkIeds({ id: record.id, query })
	if (tagName === 'BitRate') {
		return record.parent ? resolveSubNetworkIeds({ id: record.parent.id, query }) : []
	}

	const owner = COMMUNICATION_TRIGGERS.has(tagName)
		? await resolveViaConnectedAp({ record, query })
		: IED_DESCENDANT_TRIGGERS.has(tagName)
			? await resolveViaAncestors({ record, query })
			: null
	return owner ? [owner] : []
}

async function resolveSubNetworkIeds(params: {
	id: string
	query: Core.Query<Config>
}): Promise<Scl.Ref<'IED'>[]> {
	const { id, query } = params
	const connectedAps = await query.getChildren({ tagName: 'SubNetwork', id }, 'ConnectedAP')
	const owners = new Map<string, Scl.Ref<'IED'>>()
	for (const connectedAp of connectedAps) {
		const { iedName } = await query.getAttributes(connectedAp)
		const owner = await resolveIedByName({ iedName, query })
		if (owner) owners.set(owner.id, owner)
	}
	return [...owners.values()]
}

export async function resolveIedByName(params: {
	iedName: string | undefined
	query: Core.Query<Config>
}): Promise<Scl.Ref<'IED'> | null> {
	const { iedName, query } = params
	if (!iedName) return null

	const [ied] = await query.findByAttributes({ tagName: 'IED', attributes: { name: iedName } })
	return ied ? { tagName: 'IED', id: ied.id } : null
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
	return resolveIedByName({ iedName, query })
}
