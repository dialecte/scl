import type { Scl } from '@/v2019C1/config'

/** The SCD file an IED's entry must reference: the `Header` identity and version. */
export type ScdFileReference = Required<
	Pick<
		Scl.AttributesValueObjectOf<'MinRequestedSCDFile'>,
		'fileType' | 'fileUuid' | 'version' | 'revision'
	>
>
