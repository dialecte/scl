import { importTypes } from '@/v2019C1/extensions/data-model/transaction/import-types'
import { ofEach } from '@/v2019C1/extensions/info/query/of-each'
import { HOOKS, createSclImportSession } from '@/v2019C1/hooks'

import type { Benchmark, InfoBenchmark } from './run-scl-benchmarks.types'

export const DEFAULT_SIZES_MB = [5, 10, 50]
export const DEFAULT_INFO_SCALES = [1, 4]

/** The store reads an `info` row reports, as counted by the core perf helper. */
export const STORE_READ_COUNTERS = [
	'core::store::get',
	'core::store::getMany',
	'core::store::getByTagName',
	'core::store::getByDocumentId',
]

/** The `importTypes` spans a stress run prints beside its rows. */
export const IMPORT_TYPES_SPANS = [
	'scl::importTypes',
	'scl::importTypes::sourceLoop',
	'scl::importTypes::preExistingIndex',
]

export const EMPTY_SCL = `<SCL xmlns="http://www.iec.ch/61850/2003/SCL" __id="scl-target"></SCL>`
export const SCL_HOOKS = { createImportSession: createSclImportSession, ...HOOKS }

export const BENCHMARKS: Benchmark[] = [
	{
		name: 'importTypes(all LNodes → empty target)',
		instruments: ['scl::importTypes', 'scl::importTypes::sourceLoop'],
		run: async ({ project, sourceDoc, lnodes }) => {
			const target = await project.importFile(
				new File([EMPTY_SCL], 't.scd', { type: 'text/xml' }),
				{ useCustomRecordsIds: true },
			)
			const targetDoc = project.openDocument(target.documentId)
			await targetDoc.transaction(async (tx) => {
				await importTypes(tx, { sourceQuery: sourceDoc.query, records: lnodes })
			})
		},
	},
]

export const INFO_BENCHMARKS: InfoBenchmark[] = [
	{
		name: 'info.ofEach(every element under the Substation)',
		instruments: ['core::store::get'],
		run: ({ sourceDoc, refs }) => ofEach(sourceDoc.query, refs),
	},
]
