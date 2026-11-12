/** What the IED part selection reads under the IED: what it may leave out, and the inputs it rewrites. */
export const IED_CONTENT_TAGS = [
	'LN',
	'IEDName',
	'ClientLN',
	'Association',
	'KDC',
	'Inputs',
	'ExtRef',
	'SupSubscription',
] as const

/** The classes of the logical nodes supervising GOOSE and sampled-value subscriptions: no part of an exported IED. */
export const SUPERVISION_LN_CLASSES: ReadonlySet<string> = new Set(['LGOS', 'LSVS'])

/** The maxima of the supervision capability: one above 0 declares that the IED holds a supervising logical node. */
export const SUPERVISION_CAPACITY_ATTRIBUTES = ['maxGo', 'maxSv'] as const
