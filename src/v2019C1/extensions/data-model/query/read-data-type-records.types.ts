import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * The data types a resolve reaches, read level by level: each type looked up by tag then id (the record a lookup by
 * that id answers, `undefined` when none), and the member records of the types whose members were read, by ref id.
 * What is not in it was not read: the walk asks the query.
 */
export type DataTypeRecords = {
	typesByTag: ReadonlyMap<string, ReadonlyMap<string, AnyTrackedRecord | undefined>>
	membersOf: ReadonlySet<string>
	membersById: ReadonlyMap<string, AnyTrackedRecord | undefined>
}

/** The member records of a level, by ref id, and the types they were read for; none when the read was refused. */
export type MembersRead = {
	parentIds: readonly string[]
	answered: readonly (readonly [string, AnyTrackedRecord | undefined])[]
}
