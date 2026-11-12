import type { AnyRefOrRecord } from '@dialecte/core'

/**
 * The source elements a placement places or an instance holds, by uuid: what a reference it writes into an element
 * the project shares (a category, a role, a variable) may name. A reference naming any other element is
 * not written: it would name nothing in the project, or what another placement placed.
 */
export type ContributionScope = ReadonlySet<string>

/**
 * A reference of the source naming an element outside a placement's scope: the attribute naming it (its path, else
 * its uuid) and the path written, when one is.
 */
export type ReferenceOutsideScope = {
	reference: AnyRefOrRecord & { id: string }
	attribute: string
	path?: string
}
