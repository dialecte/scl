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
