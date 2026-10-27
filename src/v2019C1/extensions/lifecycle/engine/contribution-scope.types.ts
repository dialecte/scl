/**
 * The source elements a placement places or an instance holds, by uuid: what a reference it writes into an element
 * the project shares (a category, a role, a variable) may name. A reference naming any other element is
 * not written: it would name nothing in the project, or what another placement placed.
 */
export type ContributionScope = ReadonlySet<string>
