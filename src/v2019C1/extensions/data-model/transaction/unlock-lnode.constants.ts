/** The data an LNode specifies, in the order an unlock reads it. */
export const MAPPED_DATA_TAGS = ['DOS', 'SDS', 'DAS'] as const

/** The data an IED instantiates in an LN. */
export const DATA_INSTANCE_TAGS: ReadonlySet<string> = new Set(['DOI', 'SDI', 'DAI'])
