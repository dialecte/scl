import { BOOLEAN_TRUE_VALUES } from './plan-subscription-bookkeeping.constants'

import { readAttribute } from '@/v2019C1/helpers'

import type {
	DataCleanupCapability,
	DataCleanupCapabilityParams,
} from './data-cleanup-capability.types'
import type { IedNode } from './ied-section.types'

/** Whether an IED's capabilities allow cleanup of a data set entry, data set or control block. */
export function dataCleanupCapability(params: DataCleanupCapabilityParams): DataCleanupCapability {
	const { node, services } = params
	const engineeringRight = readAttribute({
		record: node.ancestry.find((record) => record.tagName === 'IED') ?? node.record,
		name: 'engRight',
		defaults: 'none',
	})
	if (engineeringRight === 'fix') return 'engright'
	if (node.record.tagName === 'FCDA' || node.record.tagName === 'DataSet') {
		const capability = dataSetCapability({
			node: node as IedNode<'FCDA' | 'DataSet'>,
			services,
		})
		if (capability !== 'modifiable' || node.record.tagName === 'FCDA') return capability
		for (const sender of params.senders ?? []) {
			const senderCapability = dataSetReferenceCapability({ node: sender, services })
			if (senderCapability === 'fixed') return 'fixed'
			if (senderCapability !== 'modifiable') return senderCapability
		}
		return 'modifiable'
	}
	return controlBlockCapability({
		node: node as IedNode<'GSEControl' | 'SampledValueControl' | 'ReportControl'>,
		services,
	})
}

function dataSetCapability(params: {
	node: IedNode<'FCDA' | 'DataSet'>
	services: DataCleanupCapabilityParams['services']
}): DataCleanupCapability {
	const service = serviceOf({
		node: params.node,
		services: params.services,
		tagName: 'ConfDataSet',
	})
	if (!service) return 'not-modifiable'
	const modify = readAttribute({ record: service.record, name: 'modify', defaults: 'none' })
	return BOOLEAN_TRUE_VALUES.has(modify) ? 'modifiable' : 'not-modifiable'
}

function controlBlockCapability(params: {
	node: IedNode<'GSEControl' | 'SampledValueControl' | 'ReportControl'>
	services: DataCleanupCapabilityParams['services']
}): DataCleanupCapability {
	const tagName = settingTagOf(
		params.node.record.tagName as 'GSEControl' | 'SampledValueControl' | 'ReportControl',
	)
	const service = serviceOf({ node: params.node, services: params.services, tagName })
	if (!service) return 'not-modifiable'
	return configuredControlBlockCapability({ service })
}

function dataSetReferenceCapability(params: {
	node: IedNode<'GSEControl' | 'SampledValueControl' | 'ReportControl'>
	services: DataCleanupCapabilityParams['services']
}): DataCleanupCapability {
	const service = serviceOf({
		node: params.node,
		services: params.services,
		tagName: settingTagOf(
			params.node.record.tagName as 'GSEControl' | 'SampledValueControl' | 'ReportControl',
		),
	})
	if (!service) return 'not-modifiable'
	const datSet = readAttribute({ record: service.record, name: 'datSet', defaults: 'none' })
	if (datSet === 'Fix') return 'fixed'
	return datSet === 'Conf' || datSet === 'Dyn' ? 'modifiable' : 'not-modifiable'
}

function configuredControlBlockCapability(params: {
	service: DataCleanupCapabilityParams['services'][number]
}): DataCleanupCapability {
	const cbName = readAttribute({ record: params.service.record, name: 'cbName', defaults: 'none' })
	if (cbName === 'Fix') return 'fixed'
	return cbName === 'Conf' ? 'modifiable' : 'not-modifiable'
}

function settingTagOf(
	controlBlockTag: 'GSEControl' | 'SampledValueControl' | 'ReportControl',
): 'GSESettings' | 'SMVSettings' | 'ReportSettings' {
	if (controlBlockTag === 'GSEControl') return 'GSESettings'
	if (controlBlockTag === 'SampledValueControl') return 'SMVSettings'
	return 'ReportSettings'
}

function serviceOf(params: {
	node: IedNode
	services: DataCleanupCapabilityParams['services']
	tagName: DataCleanupCapabilityParams['services'][number]['record']['tagName']
}): DataCleanupCapabilityParams['services'][number] | undefined {
	const accessPoint = params.node.ancestry.find((record) => record.tagName === 'AccessPoint')
	const sameIed = params.services.filter(
		(service) => service.record.tagName === params.tagName && service.ied.id === params.node.ied.id,
	)
	const atAccessPoint = sameIed.find((service) =>
		service.ancestry.some((record) => record.id === accessPoint?.id),
	)
	return (
		atAccessPoint ??
		sameIed.find(function atIed(service) {
			return !service.ancestry.some((record) => record.tagName === 'AccessPoint')
		})
	)
}
