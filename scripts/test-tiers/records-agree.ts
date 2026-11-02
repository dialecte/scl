import type { RecordsByFile } from './test-tiers.types'

/**
 * The legacy records (`scripts/mutants/equivalent-mutants.json`) the migrated records file does not carry as they are,
 * as `<file>#<key>`: absent, or with another reason, line or mutation, no line hash, or a family the cli does not know.
 * The migrated file may hold more records than the legacy one (the cli records new survivors there only).
 */
export function legacyRecordsMissing(params: {
	legacy: RecordsByFile
	migrated: RecordsByFile
	families: readonly string[]
}): string[] {
	const { legacy, migrated, families } = params
	return Object.entries(legacy).flatMap(function missingOfFile([file, mutants]) {
		return Object.entries(mutants)
			.filter(function isMissing([key, record]) {
				return !carries({ record, migrated: migrated[file]?.[key], families })
			})
			.map(function named([key]) {
				return `${file}#${key}`
			})
	})
}

/** Whether a migrated record carries a legacy one: same reason, line and mutation, a line hash, a known family. */
function carries(params: {
	record: Readonly<Record<string, unknown>>
	migrated: Readonly<Record<string, unknown>> | undefined
	families: readonly string[]
}): boolean {
	const { record, migrated, families } = params
	return (
		migrated !== undefined &&
		migrated.reason === record.equivalent &&
		migrated.line === record.line &&
		migrated.mutation === record.mutation &&
		typeof migrated.lineHash === 'string' &&
		migrated.lineHash !== '' &&
		families.includes(String(migrated.family))
	)
}
