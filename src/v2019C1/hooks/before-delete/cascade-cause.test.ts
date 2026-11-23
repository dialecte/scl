import categoryAndVariableXml from '../before-commit/fixtures/a-category-and-a-variable-named-by-an-application.xml?raw'
import { outsideCascadeRemovals } from './cascade-cause'

import { toRawRecord } from '@dialecte/core/helpers'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { DeleteCascade } from './orphaned-refs.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

/**
 * The cascade of a prune as its caller reports it, read from the document: the category pruned, the reference naming
 * it from outside, and the record that reference named - which an earlier step of the commit deleted already, so the
 * caller takes it out of what this prune removes. Also everything the cascade read, the record taken out included.
 */
async function prunedCategory(tx: Scl.Transaction): Promise<{
	roots: Scl.RawRecord<Scl.ElementsOf>[]
	cascade: DeleteCascade
	everythingRead: Map<string, Scl.RawRecord<Scl.ElementsOf>>
}> {
	const category = await tx.getRecord({ tagName: 'FunctionCategory', id: 'c1' })
	const held = await tx.getRecord({ tagName: 'FunctionCatRef', id: 'cat-ref' })
	const outside = await tx.getRecord({ tagName: 'FunctionCategoryRef', id: 'cat-named' })
	if (!category || !held || !outside) throw new Error('the fixture lost a record')
	return {
		roots: [toRawRecord(category)] as Scl.RawRecord<Scl.ElementsOf>[],
		cascade: {
			gone: new Set([category.id, held.id, outside.id]),
			causeById: new Map([[outside.id, held.id]]),
			deleted: [outside] as Scl.TrackedRecord<Scl.ElementsOf>[],
			within: [],
			cleared: [],
		},
		everythingRead: new Map(
			[category, held, outside].map((record) => [
				record.id,
				toRawRecord(record) as Scl.RawRecord<Scl.ElementsOf>,
			]),
		),
	}
}

// Walked over the records the cascade still holds, the ancestry of a cause stops at the record the caller took out,
// and the removal is attributed to no container: the preview would not say what it goes with.
describe('outsideCascadeRemovals - over the records the cascade still holds', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		'the record the outside reference named taken out → the removal belongs to no container': {
			sourceXml: categoryAndVariableXml,
		},
	}

	async function act({ source }: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<void> {
		let found: string | undefined
		const prepared = await source.prepare(async function overTheCascadeAlone(tx) {
			const { roots, cascade } = await prunedCategory(tx)
			found = outsideCascadeRemovals({ roots, cascade })[0]?.rootId
		})
		prepared.discard()
		expect(found).toBeUndefined()
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// Walked over everything the cascade read, the record taken out is there, so the ancestry reaches the pruned
// container and the removal goes with it: what the commit's prune passes.
describe('outsideCascadeRemovals - over everything the cascade read', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		'the record the outside reference named still read → the removal goes with the category': {
			sourceXml: categoryAndVariableXml,
		},
	}

	async function act({ source }: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<void> {
		let found: string | undefined
		const prepared = await source.prepare(async function overEverythingRead(tx) {
			const { roots, cascade, everythingRead } = await prunedCategory(tx)
			found = outsideCascadeRemovals({ roots, cascade, read: everythingRead })[0]?.rootId
		})
		prepared.discard()
		expect(found).toBe('c1')
	}

	runSclTestCases.withoutExport({ testCases, act })
})
