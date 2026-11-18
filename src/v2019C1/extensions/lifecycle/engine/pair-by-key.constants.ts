import type { Scl } from '@/v2019C1/config'

/** The roots below which an element whose lineage names nothing the template holds may pair by its key: an IED. */
export const KEY_PAIRING_ROOT_TAGS: ReadonlySet<string> = new Set(['IED'])

/**
 * The keys an element of a tag the schema gives no key is paired by when its lineage misses, the first that applies:
 * an input offered for later binding by its internal address and what it expects (other tools may not change them),
 * else an external reference by its source and the service bringing it. A key applies when the source element writes
 * its first field.
 */
export const KEY_ALTERNATIVES_ON_LINEAGE_MISS: ReadonlyMap<string, readonly (readonly string[])[]> =
	new Map([
		[
			'ExtRef',
			[
				['intAddr', 'pServT', 'pLN', 'pDO', 'pDA'] satisfies Scl.AttributesOf<'ExtRef'>[],
				[
					'iedName',
					'ldInst',
					'prefix',
					'lnClass',
					'lnInst',
					'doName',
					'daName',
					'serviceType',
					'srcCBName',
				] satisfies Scl.AttributesOf<'ExtRef'>[],
			],
		],
	])
