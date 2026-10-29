export { resolveApplicationScope } from './application-scope'
export { cloneApplicationContent } from './clone-application'
export {
	resolveReferencedSatellites,
	resolveRoleSatellites,
	withoutHeldSatellites,
} from './referenced-satellites'
export type {
	ReferencedSatellite,
	RoleSatellites,
	StoodOnFunction,
} from './referenced-satellites.types'
export { resolveApplicationSatellites } from './satellites'
export { resolveComposedFunctions } from './resolve-composed-functions'
export { resolveSharedFunctions } from './resolve-shared-functions'
export { resolveInstanceHoldings } from './resolve-instance-holdings'
export type { ResolveComposedFunctionsParams } from './resolve-composed-functions.types'
export type {
	InstanceHoldings,
	ResolveInstanceHoldingsParams,
} from './resolve-instance-holdings.types'
export { findDroppedComposedFunctions } from './find-dropped-composed-functions'
export { readVariantSelection, readVariantTemplate, sharedSelection } from './variant-selection'
export type { VariantSelection, VariantTemplate } from './variant-selection.types'
export { NO_VARIANT_SELECTION } from './variant-selection.constants'
