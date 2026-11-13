import { createSclImportSession } from './io-hooks'

import { IMPORT_PROGRESS_INTERVAL_MS } from '@dialecte/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

/** Each name-in-scope key the path index writes, in order: read by the path-index case. */
const scopedNameKeysWritten = vi.hoisted(function noneYet(): string[] {
	return []
})

vi.mock(
	'@/v2019C1/extensions/reference/query/build/name-scope',
	async function recordScopedNameKeys(importOriginal) {
		const original =
			await importOriginal<typeof import('@/v2019C1/extensions/reference/query/build/name-scope')>()
		return {
			...original,
			scopedNameKey: function recordedScopedNameKey(
				params: Parameters<typeof original.scopedNameKey>[0],
			): string {
				scopedNameKeysWritten.push('scoped-name-key')
				return original.scopedNameKey(params)
			},
		}
	},
)

import { SCL_NAMESPACES } from '@/v2019C1/config'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'

import type { SclImportSession } from './io-hooks.types'
import type {
	AfterImportContext,
	AfterImportResult,
	AnyRawRecord,
	ImportFilesProgress,
	ImportStepReport,
} from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** The source of the test project the file is imported into: a document holding nothing. */
const EMPTY_SCL = /* xml */ `<SCL ${ns}></SCL>`

/**
 * A file giving each step something to count: two LNodes (one without its specified naming), fifteen elements
 * holding a uuid (any element is a target: a `VariableApplyTo` may name it; the path index goes over them twice, then
 * over their other paths: 31), a terminal written with a path and one
 * with a uuid only, two connectivity nodes writing their own path, a DOS mapped by uuid, and two tuple references
 * (the ConnectedAP, the LNode bound to its IED).
 */
const EVERY_STEP_FILE = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation ${id}="s1" name="S1">
			<VoltageLevel ${id}="vl1" name="VL1">
				<Bay ${id}="b1" name="B1">
					<ConductingEquipment ${id}="qa1" name="QA1" type="CBR">
						<Terminal ${id}="t1" connectivityNode="S1/VL1/B1/L1" cNodeName="L1"/>
						<Terminal ${id}="t2" cNodeUuid="00000000-0000-4000-8000-000000000002"/>
					</ConductingEquipment>
					<ConnectivityNode ${id}="l1" name="L1" pathName="S1/VL1/B1/L1" uuid="00000000-0000-4000-8000-000000000001"/>
					<ConnectivityNode ${id}="l2" name="L2" pathName="S1/VL1/B1/L2" uuid="00000000-0000-4000-8000-000000000002"/>
				</Bay>
			</VoltageLevel>
			<Function ${id}="fn" name="F1" uuid="00000000-0000-4000-8000-000000000003">
				<LNode ${id}="lnode" iedName="VENDOR" ldInst="LD0" lnClass="PTOC" lnInst="1" lnUuid="ptoc1-uuid">
					<Private ${id}="priv" type="eIEC61850-6-100">
						<eIEC61850-6-100:LNodeSpecNaming ${id}="naming" sLnClass="PTOC" sLnInst="1"/>
						<eIEC61850-6-100:DOS ${id}="dos-op" name="Op" mappedLnUuid="ptoc1-uuid"/>
					</Private>
				</LNode>
				<LNode ${id}="unnamed" iedName="None" lnClass="XSWI" lnInst="1"/>
			</Function>
		</Substation>
		<Communication ${id}="com">
			<SubNetwork ${id}="net" name="N1">
				<ConnectedAP ${id}="cap" iedName="VENDOR" apName="AP1"/>
			</SubNetwork>
		</Communication>
		<IED ${id}="ied" name="VENDOR">
			<AccessPoint ${id}="ap" name="AP1" uuid="00000000-0000-4000-8000-000000000004">
				<Server ${id}="srv">
					<LDevice ${id}="ld" inst="LD0">
						<LN0 ${id}="lln0" lnClass="LLN0" inst="" lnType="LLN0_T" uuid="lln0-uuid"/>
						<LN ${id}="ptoc1" lnClass="PTOC" inst="1" lnType="PTOC_T" uuid="ptoc1-uuid"/>
					</LDevice>
				</Server>
			</AccessPoint>
		</IED>
	</SCL>
`

/** A step as the import told it last: its name and its count, when it gave one. */
type ToldStep = { step: string; done?: number; total?: number }

/** The last report of each step the SCL session told, in the order the steps started (core's `start` left out). */
function stepsTold(params: { heard: readonly ImportFilesProgress[] }): ToldStep[] {
	const last = new Map<string, ToldStep>()
	for (const progress of params.heard) {
		if (progress.phase !== 'processing' || progress.step === 'start') continue
		const { step, done, total } = progress
		last.set(step, {
			step,
			...(done !== undefined && { done }),
			...(total !== undefined && { total }),
		})
	}
	return [...last.values()]
}

describe('the steps an SCL import tells while its references are resolved', () => {
	type TestCase = {
		only?: boolean
		/** The step whose first report aborts the import */
		abortAt?: string
		expectedSteps: ToldStep[]
		/** The key of the error the file failed with; absent, it is imported */
		expectedErrorKey?: string
	}

	const testCases: Record<string, TestCase> = {
		'a file holding something for every step → each step told in the order it runs, each count reaching its total':
			{
				expectedSteps: [
					{ step: 'spec-naming', done: 2, total: 2 },
					{ step: 'path-index', done: 31, total: 31 },
					{ step: 'data-types' },
					{ step: 'path-fills', done: 1, total: 1 },
					{ step: 'references', done: 1, total: 1 },
					{ step: 'own-paths', done: 2, total: 2 },
					{ step: 'mapped-data', done: 1, total: 1 },
					{ step: 'tuple-references', done: 2, total: 2 },
				],
			},
		'the import aborted as the references step starts → the file fails IMPORT_ABORTED, no step after it told, nothing kept':
			{
				abortAt: 'references',
				expectedSteps: [
					{ step: 'spec-naming', done: 2, total: 2 },
					{ step: 'path-index', done: 31, total: 31 },
					{ step: 'data-types' },
					{ step: 'path-fills', done: 1, total: 1 },
					{ step: 'references', done: 0, total: 1 },
				],
				expectedErrorKey: 'IMPORT_ABORTED',
			},
	}

	let entries = Object.entries(testCases)
	const onlyEntries = entries.filter(([, testCase]) => testCase.only)
	if (onlyEntries.length) entries = onlyEntries

	entries.forEach(([description, testCase]) => {
		it(description, async () => {
			const { project } = await createSclTestProject({ sourceXml: EMPTY_SCL })
			const documentsBefore = await project.getDocuments()
			const openBefore = [...project.state.documents.keys()]
			const controller = new AbortController()
			const heard: ImportFilesProgress[] = []

			const [entry] = await project.import(
				[new File([EVERY_STEP_FILE], 'every-step.scd', { type: 'text/xml' })],
				{
					useCustomRecordsIds: true,
					signal: controller.signal,
					onProgress: function keepProgress(progress) {
						heard.push(progress)
						if (progress.phase === 'processing' && progress.step === testCase.abortAt) {
							controller.abort()
						}
					},
				},
			)

			expect(stepsTold({ heard })).toEqual(testCase.expectedSteps)
			if (testCase.expectedErrorKey) {
				expect(entry).toMatchObject({ status: 'failed', error: { key: testCase.expectedErrorKey } })
				const documentsAfter = await project.getDocuments()
				expect(documentsAfter).toEqual(documentsBefore)
				expect([...project.state.documents.keys()]).toEqual(openBefore)
			} else {
				expect(entry.status).toBe('imported')
			}
		})
	})
})

describe('an SCL import session aborted inside a long step', () => {
	afterEach(function restoreClock() {
		vi.restoreAllMocks()
	})

	type TestCase = {
		only?: boolean
		/** The step whose count, told part way, sends the abort */
		step: string
		/** How many items the step goes over */
		total: number
		/** The records the session is handed, under one substation */
		records: (total: number) => AnyRawRecord[]
		/** The step after it: never told */
		nextStep: string
	}

	const testCases: Record<string, TestCase> = {
		'the abort sent once references told a count part way → afterImport throws before the step ends, no later step told':
			{
				step: 'references',
				total: 40,
				records: (total) => [
					rawRecord({
						tagName: 'ConnectivityNode',
						attributes: { name: 'L1', pathName: 'S1/L1', uuid: 'uuid-l1' },
					}),
					...Array.from({ length: total }, () =>
						rawRecord({
							tagName: 'Terminal',
							attributes: { connectivityNode: 'S1/L1', cNodeName: 'L1' },
						}),
					),
				],
				nextStep: 'own-paths',
			},
		'the abort sent once path-index told a count part way → afterImport throws before the step ends, no later step told':
			{
				step: 'path-index',
				total: 40,
				records: (total) =>
					Array.from({ length: total }, (_, index) =>
						rawRecord({
							tagName: 'ConnectivityNode',
							attributes: { name: `L${index}`, pathName: `S1/L${index}`, uuid: `uuid-l${index}` },
						}),
					),
				nextStep: 'data-types',
			},
	}

	let entries = Object.entries(testCases)
	const onlyEntries = entries.filter(([, testCase]) => testCase.only)
	if (onlyEntries.length) entries = onlyEntries

	entries.forEach(([description, testCase]) => {
		it(description, async () => {
			const session = createSclImportSession()
			const root = rawRecord({ tagName: 'Substation', attributes: { name: 'S1' } })
			for (const record of testCase.records(testCase.total)) {
				session.beforeImportRecord!({ record, ancestry: [root] })
			}
			// every read of the clock is a progress interval later: a long step tells its count part way
			let clock = 0
			vi.spyOn(performance, 'now').mockImplementation(function laterEachRead() {
				clock += IMPORT_PROGRESS_INTERVAL_MS
				return clock
			})
			const controller = new AbortController()
			const told: ImportStepReport[] = []
			let abortSent = false
			const context: AfterImportContext = {
				report: function abortPartWay(report) {
					told.push(report)
					const partWay =
						report.done !== undefined && report.done > 0 && report.done < testCase.total
					if (report.step !== testCase.step || !partWay || abortSent) return
					abortSent = true
					sendAbortLater({ controller })
				},
				signal: controller.signal,
			}

			const thrown = await session.afterImport!(context).catch(function keepThrown(error: unknown) {
				return error
			})

			expect(thrown).toBe(controller.signal.reason)

			const toldOfStep = told.filter((report) => report.step === testCase.step)
			expect(toldOfStep.at(-1)?.done).toBeLessThan(testCase.total)
			expect(told.map((report) => report.step)).not.toContain(testCase.nextStep)
		})
	})
})

describe('the path-index step told complete once the index is built', () => {
	/**
	 * A session whose path index writes its name-in-scope keys through the recording module above. The node tier shares
	 * its modules between test files: another file may have loaded the path index before the recording module was set,
	 * so the session is imported again.
	 */
	async function recordingSession(): Promise<SclImportSession> {
		vi.resetModules()
		const { createSclImportSession: createRecordingSession } = await import('./io-hooks')
		return createRecordingSession()
	}

	type TestCase = {
		only?: boolean
		/** The records the session is handed, each with its ancestry */
		records: () => { record: AnyRawRecord; ancestry: AnyRawRecord[] }[]
	}

	const testCases: Record<string, TestCase> = {
		'functional variants named in their application → their keys written before path-index tells done === total':
			{
				records: function variantsInAnApplication() {
					const substation = rawRecord({ tagName: 'Substation', attributes: { name: 'S1' } })
					const application = rawRecord({
						tagName: 'Application',
						attributes: { name: 'A1', uuid: 'uuid-a1' },
					})
					const group = rawRecord({
						tagName: 'FunctionalVariantGroup',
						attributes: { name: 'G1', uuid: 'uuid-g1' },
					})
					return [
						{ record: application, ancestry: [substation] },
						{ record: group, ancestry: [substation, application] },
						...['V1', 'V2', 'V3'].map((name) => ({
							record: rawRecord({
								tagName: 'FunctionalVariant',
								attributes: { name, uuid: `uuid-${name}` },
							}),
							ancestry: [substation, application, group],
						})),
					]
				},
			},
	}

	let entries = Object.entries(testCases)
	const onlyEntries = entries.filter(([, testCase]) => testCase.only)
	if (onlyEntries.length) entries = onlyEntries

	entries.forEach(([description, testCase]) => {
		it(description, async () => {
			const session = await recordingSession()
			for (const { record, ancestry } of testCase.records()) {
				session.beforeImportRecord!({ record, ancestry })
			}
			const happened = scopedNameKeysWritten
			happened.length = 0
			const context: AfterImportContext = {
				report: function keepReport(report) {
					const complete = report.done !== undefined && report.done === report.total
					happened.push(`${report.step}${complete ? ' complete' : ''}`)
				},
				signal: new AbortController().signal,
			}

			await session.afterImport!(context)

			expect(happened).toContain('scoped-name-key')
			expect(happened.lastIndexOf('scoped-name-key')).toBeLessThan(
				happened.indexOf('path-index complete'),
			)
		})
	})
})

describe('an SCL import session run with no context', () => {
	it('afterImport given no context → the same writes and diagnostics as with one, nothing told', async () => {
		function collected(): ReturnType<typeof createSclImportSession> {
			const session = createSclImportSession()
			const root = rawRecord({ tagName: 'Substation', attributes: { name: 'S1' } })
			const node = rawRecord({
				tagName: 'ConnectivityNode',
				attributes: { name: 'L1', pathName: 'wrong', uuid: 'uuid-l1' },
			})
			const terminal = rawRecord({
				tagName: 'Terminal',
				attributes: { connectivityNode: 'S1/L1', cNodeName: 'L1' },
			})
			session.beforeImportRecord!({ record: node, ancestry: [root] })
			session.beforeImportRecord!({ record: terminal, ancestry: [root] })
			return session
		}
		const told: ImportStepReport[] = []
		const context: AfterImportContext = {
			report: function keepReport(report) {
				told.push(report)
			},
			signal: new AbortController().signal,
		}

		const withContext = await collected().afterImport!(context)
		const withoutContext = await collected().afterImport!()

		expect(told.length).toBeGreaterThan(0)
		expect(shapeOf(withoutContext)).toEqual(shapeOf(withContext))
	})
})

/**
 * Abort from a later task, as a caller's abort reaches a worker: a message, seen by the import only when it lets the
 * queue run.
 */
function sendAbortLater(params: { controller: AbortController }): void {
	const channel = new MessageChannel()
	channel.port1.addEventListener('message', function abortNow() {
		channel.port1.close()
		params.controller.abort()
	})
	channel.port1.start()
	channel.port2.postMessage(null)
}

/** A raw record of the default namespace with no parent nor children. */
function rawRecord(params: { tagName: string; attributes: Record<string, string> }): AnyRawRecord {
	return {
		id: crypto.randomUUID(),
		tagName: params.tagName,
		namespace: SCL_NAMESPACES.default,
		attributes: Object.entries(params.attributes).map(([name, value]) => ({ name, value })),
		value: '',
		parent: null,
		children: [],
	}
}

/** The attributes each write sets and the code of each diagnostic: what a result says, without its record ids. */
function shapeOf(result: AfterImportResult): {
	updates: unknown[]
	diagnostics: string[]
} {
	return {
		updates: (result.updates ?? []).map((update) => update.attributes),
		diagnostics: (result.diagnostics ?? []).map((diagnostic) => diagnostic.code),
	}
}
