/** Why a registration of an ended subscription is kept. */
export const KEPT_REGISTRATION_REASONS = [
	'indexed-position',
	'buffered-preconfigured',
	'eng-right-fix',
] as const

/** The engineering right that blocks every change of an IED. */
export const FIXED_ENGINEERING_RIGHT = 'fix'

/** The attribute of an IED holding its engineering right. */
export const ENGINEERING_RIGHT_ATTRIBUTE = 'engRight'

/** The attribute of a report control block telling it is buffered. */
export const BUFFERED_ATTRIBUTE = 'buffered'

/** The attribute of a report control block telling its client positions are its instance numbers. */
export const INDEXED_ATTRIBUTE = 'indexed'

/** The control block whose clients are logical nodes (`ClientLN`), not IEDs. */
export const REPORT_CONTROL_TAG = 'ReportControl'

/** The tag of a registration naming a client logical node of a report control block. */
export const CLIENT_LN_TAG = 'ClientLN'

/** The lexical forms of an `xs:boolean` true and false. */
export const BOOLEAN_TRUE_VALUES: ReadonlySet<string> = new Set(['true', '1'])
export const BOOLEAN_FALSE_VALUES: ReadonlySet<string> = new Set(['false', '0'])
