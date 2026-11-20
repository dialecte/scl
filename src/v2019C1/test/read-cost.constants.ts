/** The dev perf tallies of the store calls that move records: their counts add up to the records moved. */
export const RECORDS_MOVED_TALLIES = [
	'core::store::records.get',
	'core::store::records.getMany',
	'core::store::records.getByTagName',
	'core::store::records.getByAttributes',
	'core::store::records.getByDocumentId',
] as const

/** The dev perf tallies of the store calls themselves, one count per call. */
export const STORE_CALL_TALLIES = [
	'core::store::get',
	'core::store::getMany',
	'core::store::getByTagName',
	'core::store::getByAttributes',
	'core::store::getByDocumentId',
] as const

/** The query methods that read a record in hand without the store (its attributes): left out of the calls. */
export const RECORD_READERS: ReadonlySet<string> = new Set(['getAttributes', 'getAttribute'])
