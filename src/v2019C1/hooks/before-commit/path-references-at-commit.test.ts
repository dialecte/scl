import functionsAndACategory from './fixtures/functions-and-a-category.xml?raw'
import { writePathReferencesAtCommit } from './path-references'

import { toDialecteError } from '@dialecte/core'
import { toRawRecord } from '@dialecte/core/helpers'
import { describe, expect } from 'vitest'

import { withAttributeValues } from '@/v2019C1/hooks/shared/record-ops'
import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type { AnyRawRecord } from '@dialecte/core'

const CATEGORY = { tagName: 'FunctionCategory', id: 'c1' } as Scl.Ref<Scl.ElementsOf>
const BAY = { tagName: 'Bay', id: 'b1' } as Scl.Ref<Scl.ElementsOf>
const REFERENCE = { tagName: 'FunctionCatRef', id: 'ref1' } as Scl.Ref<Scl.ElementsOf>

describe('the commit gives a path reference created by its path the uuid its path names', () => {
	type TestCase = SclTest.BaseXmlTestCase & { path: string }

	const testCases: SclTest.TestCases<TestCase> = {
		// functions-and-a-category.xml: the bay holds F2
		'a function reference created by the path of F2 → its functionUuid written': {
			sourceXml: functionsAndACategory,
			path: 'S1/VL1/B1/F2',
			expectedQueries: ['//v2019C1:FunctionCatRef[@function="S1/VL1/B1/F2"][@functionUuid="f2"]'],
		},
		// the bay holds no F9
		'a function reference created by a path naming nothing → no uuid written': {
			sourceXml: functionsAndACategory,
			path: 'S1/VL1/B1/F9',
			expectedQueries: ['//v2019C1:FunctionCatRef[@function="S1/VL1/B1/F9"]'],
			unexpectedQueries: ['//v2019C1:FunctionCatRef[@function="S1/VL1/B1/F9"][@functionUuid]'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function addReference(tx) {
			await tx.any.addChild(CATEGORY, {
				tagName: 'FunctionCatRef',
				attributes: { function: testCase.path },
			})
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the commit gives a path reference the uuid of what it names, created in the same transaction', () => {
	type TestCase = SclTest.BaseXmlTestCase & { path: string; created: Record<string, string> }

	const testCases: SclTest.TestCases<TestCase> = {
		// the category gets a reference to F3, then the bay gets F3, in one transaction
		'a function reference by path, then the function it names → its functionUuid written': {
			sourceXml: functionsAndACategory,
			path: 'S1/VL1/B1/F3',
			created: { name: 'F3', uuid: 'f3' },
			expectedQueries: ['//v2019C1:FunctionCatRef[@function="S1/VL1/B1/F3"][@functionUuid="f3"]'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function addReferenceThenFunction(tx) {
			await tx.any.addChild(CATEGORY, {
				tagName: 'FunctionCatRef',
				attributes: { function: testCase.path },
			})
			await tx.any.addChild(BAY, { tagName: 'Function', attributes: testCase.created })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the commit of a function created gives the references naming it by path its uuid', () => {
	type TestCase = SclTest.BaseXmlTestCase & { path: string; created: Record<string, string> }

	const testCases: SclTest.TestCases<TestCase> = {
		// the category gets a reference to F3, which the bay lacks; a later transaction adds F3
		'a function reference by a path naming nothing, the function created later → its functionUuid written then':
			{
				sourceXml: functionsAndACategory,
				path: 'S1/VL1/B1/F3',
				created: { name: 'F3', uuid: 'f3' },
				expectedQueries: ['//v2019C1:FunctionCatRef[@function="S1/VL1/B1/F3"][@functionUuid="f3"]'],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function addReference(tx) {
			await tx.any.addChild(CATEGORY, {
				tagName: 'FunctionCatRef',
				attributes: { function: testCase.path },
			})
		})
		await source.transaction(async function addFunction(tx) {
			await tx.any.addChild(BAY, { tagName: 'Function', attributes: testCase.created })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the commit of a function renamed gives the references naming it by path its uuid', () => {
	type TestCase = SclTest.BaseXmlTestCase & { path: string; renamed: Record<string, string> }

	const testCases: SclTest.TestCases<TestCase> = {
		// the category gets a reference to F3, which the bay lacks; a later transaction renames F2 to F3
		'a function reference by a path naming nothing, a function renamed to it later → its functionUuid written then':
			{
				sourceXml: functionsAndACategory,
				path: 'S1/VL1/B1/F3',
				renamed: { name: 'F3' },
				expectedQueries: ['//v2019C1:FunctionCatRef[@function="S1/VL1/B1/F3"][@functionUuid="f2"]'],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function addReference(tx) {
			await tx.any.addChild(CATEGORY, {
				tagName: 'FunctionCatRef',
				attributes: { function: testCase.path },
			})
		})
		await source.transaction(async function renameFunction(tx) {
			await tx.any.update({ tagName: 'Function', id: 'f2' }, { attributes: testCase.renamed })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the commit of an element renamed gives the references naming it in their path, below it, its uuid', () => {
	type TestCase = SclTest.BaseXmlTestCase & { path: string; renamed: Record<string, string> }

	const testCases: SclTest.TestCases<TestCase> = {
		// the category gets a reference to F1 below a bay B2 the voltage level lacks; a later transaction renames B1 to B2
		'a function reference by a path through a bay named later → its functionUuid written then': {
			sourceXml: functionsAndACategory,
			path: 'S1/VL1/B2/F1',
			renamed: { name: 'B2' },
			expectedQueries: ['//v2019C1:FunctionCatRef[@function="S1/VL1/B2/F1"][@functionUuid="f1"]'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function addReference(tx) {
			await tx.any.addChild(CATEGORY, {
				tagName: 'FunctionCatRef',
				attributes: { function: testCase.path },
			})
		})
		await source.transaction(async function renameBay(tx) {
			await tx.any.update(BAY, { attributes: testCase.renamed })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the commit follows the path an edit gives a reference holding a uuid', () => {
	type TestCase = SclTest.BaseXmlTestCase & { path: string }

	const testCases: SclTest.TestCases<TestCase> = {
		// ref1 names F1 by path and uuid; its path pointed at F2
		'its path pointed at F2 → its uuid follows': {
			sourceXml: functionsAndACategory,
			path: 'S1/VL1/B1/F2',
			expectedQueries: ['//v2019C1:FunctionCatRef[@function="S1/VL1/B1/F2"][@functionUuid="f2"]'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function editPath(tx) {
			await tx.any.update(REFERENCE, { attributes: { function: testCase.path } })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the commit follows a path edit made before the transaction creates what it names', () => {
	type TestCase = SclTest.BaseXmlTestCase & { path: string; created: Record<string, string> }

	const testCases: SclTest.TestCases<TestCase> = {
		// ref1 names F1 by path and uuid; its path pointed at F3, which the same transaction then creates
		'its path pointed at a function the transaction creates next → its uuid follows at the commit':
			{
				sourceXml: functionsAndACategory,
				path: 'S1/VL1/B1/F3',
				created: { name: 'F3', uuid: 'f3' },
				expectedQueries: ['//v2019C1:FunctionCatRef[@function="S1/VL1/B1/F3"][@functionUuid="f3"]'],
			},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function editPathThenCreate(tx) {
			await tx.any.update(REFERENCE, { attributes: { function: testCase.path } })
			await tx.any.addChild(BAY, { tagName: 'Function', attributes: testCase.created })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('an edit of the path of a reference holding a uuid to a path naming nothing', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		path: string
		expected: { key: string | undefined; meta: unknown }
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// ref1 names F1 by path and uuid; the bay holds no F9
		'its path pointed at a function nothing holds → refused, the uuid kept': {
			sourceXml: functionsAndACategory,
			path: 'S1/VL1/B1/F9',
			expected: {
				key: 'REFERENCE_NAMES_UNRESOLVED',
				meta: {
					reference: { tagName: 'FunctionCatRef', id: 'ref1' },
					uuidAttribute: 'functionUuid',
					address: 'S1/VL1/B1/F9',
					resolved: 'none',
				},
			},
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const refused = await source
			.transaction(async function editPath(tx) {
				await tx.any.update(REFERENCE, { attributes: { function: testCase.path } })
			})
			.then(function committed() {
				return undefined
			})
			.catch(function refusal(error: unknown) {
				const dialecteError = toDialecteError(error)
				return { key: dialecteError?.key, meta: dialecteError?.meta }
			})
		expect(refused).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('the commit fills the references waiting for a path when a caller counts elements as created or renamed', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		/** The elements given as created or renamed (the roots of a moved subtree), no operation touching any. */
		targetRoots: string[]
		/** The functionUuids the commit writes on ref1, waiting with the path of F2 and no uuid. */
		expected: string[]
	}

	const testCases: SclTest.TestCases<TestCase> = {
		// functions-and-a-category.xml: ref1 given the path of F2 and no uuid, as an earlier step wrote it
		'no element given, none created or renamed → the waiting reference left as it is': {
			sourceXml: functionsAndACategory,
			targetRoots: [],
			expected: [],
		},
		// the same waiting ref1; F1 is no segment of its path, a root counts whatever it names
		'the function F1 given as a root → the waiting reference given the uuid of F2': {
			sourceXml: functionsAndACategory,
			targetRoots: ['f1'],
			expected: ['f2'],
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<TestCase>): Promise<void> {
		const record = await source.query.getRecord(REFERENCE)
		if (!record) throw new Error('ref1 missing')
		const raw = toRawRecord(record)
		const waiting = {
			...raw,
			attributes: withAttributeValues(raw.attributes, [
				{ name: 'function', value: 'S1/VL1/B1/F2' },
				{ name: 'functionUuid', value: undefined },
			]),
		} as AnyRawRecord
		const written = await writePathReferencesAtCommit({
			operations: [],
			query: source.query,
			pending: new Map([[waiting.id, waiting]]),
			targetRoots: new Set(testCase.targetRoots),
		})
		const uuids = written.flatMap((operation) =>
			operation.status === 'deleted'
				? []
				: operation.newRecord.attributes
						.filter((attribute) => attribute.name === 'functionUuid')
						.map((attribute) => attribute.value),
		)
		expect(uuids).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})
