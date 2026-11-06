import type { Scl, Config } from '@/v2019C1/config'
import type { FileStart } from '@/v2019C1/extensions/history/transaction/start-file.types'
import type * as Core from '@dialecte/core'

/** Parameters of the in-progress selected IED instance copy, not yet a complete ISD export. */
export type IedExtractParams = {
	/** Source type follows its registered extension; .xml or no extension uses SCD, ignoring Header fileType. */
	sourceQuery: Core.Query<Config>
	/** The selected source IED, not necessarily the first IED in the source. */
	iedRef: Scl.Ref<'IED'>
	/** Initializes an ISD Header with a fresh file UUID and initial history. */
	fileType: 'ISD'
	/** Explicit 'instance' required for now; no default is implemented. */
	kind?: 'instance'
	/** Explicit 'none' required for now; omitted/default and later-binding conversion are unavailable. */
	inputs?: 'none' | 'later-binding'
	/** Manufacturer written on the output IED; the source manufacturer is unchanged. */
	issuer: NonNullable<Scl.AttributesValueObjectOf<'IED'>['manufacturer']>
	/** Tool recorded on the output Header. */
	tool: Scl.AttributesValueObjectOf<'Header'>['toolID']
	/** Author of the initial output history item. */
	who: Scl.AttributesValueObjectOf<'Hitem'>['who']
	/** Optional name structure passed to file initialization. */
	nameStructure?: Scl.AttributesValueObjectOf<'Header'>['nameStructure']
	/** Defaults to 'new'; 'revision' is refused with OPTION_NOT_AVAILABLE before writes. */
	as?: FileStart
}
