import type { SclFileType } from '@/v2019C1/extensions/reference/transaction'

/** The name the IED of a template ISD carries: an ISD whose IED has another name is an instance file. */
export const TEMPLATE_ISD_IED_NAME = 'SPECIFICATION'

/** The files an IED is read from with the identity it has in a project (an IID, an SCD): not placed as a new IED. */
export const IDENTITY_KEEPING_FILE_TYPES: ReadonlySet<SclFileType> = new Set<SclFileType>([
	'IID',
	'SCD',
])

/** The elements of a source file whose uuid is the file's own identity, never an element placed: its `Header`. */
export const FILE_IDENTITY_TAGS: ReadonlySet<string> = new Set(['Header'])

/**
 * The elements of a source file an IED placement lands on the project's element of the same kind (by lineage, by name,
 * or as the same element by its uuid) rather than writing them beside it: its `SubNetwork`s. A project element of that
 * kind holding the uuid is that element, no clash; one of another kind is.
 */
export const LANDED_ON_TAGS: ReadonlySet<string> = new Set(['SubNetwork'])

/** The order a refusal names a held element in: the IED, then the levels from the top, then any other element. */
export const HELD_ELEMENT_RANK: readonly string[] = ['IED', 'Substation', 'VoltageLevel', 'Bay']
