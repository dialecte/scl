export {
	assertMappingDecided,
	assertMappingsDecided,
	assertReportMappingsDecided,
} from './assert-mapping-decided'
export { assertMappingsCoherent } from './assert-mappings-coherent'
export { createReportPass, describeMapping } from './describe-mapping'
export { findMappingPolicy } from './mapping-policies'
export { resolveMapping } from './resolve-mapping'
export { resolveSatelliteMappings, toRedirectMappings } from './resolve-satellite-mappings'
export { resolveSatelliteRemovals } from './resolve-satellite-removals'
export type {
	DecisionMapping,
	DecisionMappings,
	MappingCandidate,
	MappingKind,
	MappingPolicy,
	MappingReason,
	ReportMapping,
	ReportPass,
	ResolvedMapping,
	ResolvedMappings,
	SatelliteRemoval,
} from './mapping.types'
