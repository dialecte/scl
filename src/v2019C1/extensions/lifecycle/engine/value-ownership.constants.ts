/** The kind of value the system tool may set, whatever the IED's import flag says. */
export const SETTABLE_VALUE_KIND = 'Set'

/** The import flag letting the system tool set a value of another kind: an XML boolean's two spellings of true. */
export const VALUE_IMPORTED: ReadonlySet<string> = new Set(['true', '1'])

/** The basic type of a data attribute whose value is one of the values of an enumeration type. */
export const ENUMERATED_BASIC_TYPE = 'Enum'

/** What a value of an IED is read under: the element holding it, the data attribute it is given for, the value. */
export const VALUE_TAGS = {
	value: 'Val',
	attribute: 'DAI',
	object: 'DOI',
	subInstance: 'SDI',
} as const

/** The type of the values an enumeration allows, and each value of it. */
export const ENUMERATION_TAGS = { type: 'EnumType', value: 'EnumVal' } as const

/** The attribute of a data attribute (and of a data set entry naming it) giving its functional constraint. */
export const FUNCTIONAL_CONSTRAINT_ATTRIBUTE = 'fc'
