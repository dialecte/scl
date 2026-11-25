/// <reference types="vite/client" />

import { planClosure, readClosureModel } from './closure'
import SenderWithTwoGooseBlocksXml from './fixtures/sender-with-two-goose-blocks.xml?raw'
import TwoSendersSharingNamesXml from './fixtures/two-senders-sharing-names.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { ClosureSeed } from './closure.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

type TestCase = SclTest.BaseXmlTestCase & {
	seeds: ClosureSeed[]
	/** The records under the IED left out, exactly. */
	leftOut: string[]
	/** The records under its connection left out, exactly; absent: the connection is not cut. */
	connectionLeftOut?: string[]
	logicalNodes: string[]
	engRight?: 'fix'
	depth: 'whole' | 'interface'
}

const sender = { tagName: 'IED', id: 'sender' } as const

function sorted(values: Iterable<string>): string[] {
	return [...values].sort()
}

describe('planClosure - a control block with everything it references, nothing else', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'GOOSE control block GooseA -> its logical device, LN0, data set, access point, server and authentication kept, the logical devices and nodes its data set names kept, the rest left out, the IED marked fix':
			{
				sourceXml: SenderWithTwoGooseBlocksXml,
				seeds: [{ ref: { tagName: 'GSEControl', id: 'goose-a' }, depth: 'interface' }],
				leftOut: [
					'services',
					'ap2',
					'kdc',
					'ld3',
					'association',
					'xcbr1',
					'set-b',
					'rpt',
					'ld1-ln0-values',
					'ld1-ln0-inputs',
					'goose-b',
					'goose-a-receiver',
					'ptoc1-values',
					'ggio2',
				],
				connectionLeftOut: ['gse-b'],
				logicalNodes: ['ld1-ln0', 'ptoc1', 'ld2-ln0', 'ggio1'],
				engRight: 'fix',
				depth: 'interface',
			},
		'report control block Rpt -> its data set and the LN0 it names kept, its report clients and both GOOSE addresses left out':
			{
				sourceXml: SenderWithTwoGooseBlocksXml,
				seeds: [{ ref: { tagName: 'ReportControl', id: 'rpt' }, depth: 'interface' }],
				leftOut: [
					'services',
					'ap2',
					'kdc',
					'ld2',
					'ld3',
					'association',
					'ptoc1',
					'xcbr1',
					'set-a',
					'ld1-ln0-values',
					'ld1-ln0-inputs',
					'goose-a',
					'goose-b',
					'client',
				],
				connectionLeftOut: ['gse-a', 'gse-b'],
				logicalNodes: ['ld1-ln0'],
				engRight: 'fix',
				depth: 'interface',
			},
		'both GOOSE control blocks -> what each references kept, each GOOSE address kept': {
			sourceXml: SenderWithTwoGooseBlocksXml,
			seeds: [
				{ ref: { tagName: 'GSEControl', id: 'goose-a' }, depth: 'interface' },
				{ ref: { tagName: 'GSEControl', id: 'goose-b' }, depth: 'interface' },
			],
			leftOut: [
				'services',
				'ap2',
				'kdc',
				'ld3',
				'association',
				'xcbr1',
				'rpt',
				'ld1-ln0-values',
				'ld1-ln0-inputs',
				'goose-a-receiver',
				'ptoc1-values',
				'ggio2',
			],
			connectionLeftOut: [],
			logicalNodes: ['ld1-ln0', 'ptoc1', 'ld2-ln0', 'ggio1'],
			engRight: 'fix',
			depth: 'interface',
		},
		'the IED whole -> nothing left out, its connection not cut, no engineering right written': {
			sourceXml: SenderWithTwoGooseBlocksXml,
			seeds: [{ ref: sender, depth: 'whole' }],
			leftOut: [],
			depth: 'whole',
			logicalNodes: ['ld1-ln0', 'ptoc1', 'xcbr1', 'ld2-ln0', 'ggio1', 'ggio2', 'ld3-ln0'],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const closure = readClosureModel(source.query, { iedRefs: [sender] }).then((model) =>
				planClosure({ model, seeds: testCase.seeds }),
			)
			await expect(closure).resolves.toBeDefined()
			const plan = await closure
			const ied = plan.ieds.get(sender.id)
			expect(sorted(ied?.leaveOut ?? [])).toEqual(sorted(testCase.leftOut))
			expect(ied?.depth).toBe(testCase.depth)
			expect(ied?.engRight).toBe(testCase.engRight)
			expect(sorted(plan.connections.get('connection')?.leaveOut ?? [])).toEqual(
				sorted(testCase.connectionLeftOut ?? []),
			)
			expect(plan.connections.has('connection')).toBe(testCase.connectionLeftOut !== undefined)
			expect(sorted(plan.logicalNodes)).toEqual(sorted(testCase.logicalNodes))
			expect(sorted(plan.unresolvedMembers)).toEqual([])
			expect(sorted(plan.droppedConnections)).toEqual([])
		},
	})
})

type SharedNamesCase = SclTest.BaseXmlTestCase & {
	seeds: ClosureSeed[]
	/** Per IED in the plan: its depth and the records under it left out, exactly. */
	ieds: Record<string, { depth: 'whole' | 'interface'; leftOut: string[] }>
	/** Per connection in the plan: the records under it left out, exactly. */
	connections: Record<string, string[]>
	droppedConnections: string[]
	unresolvedMembers: string[]
	logicalNodes: string[]
}

const a = { tagName: 'IED', id: 'a' } as const
const b = { tagName: 'IED', id: 'b' } as const

describe('planClosure - control blocks of IEDs sharing names, served access points, connections of what goes', () => {
	const testCases: SclTest.TestCases<SharedNamesCase> = {
		"GooseA of A and GooseB of B, both named LD1 / GooseA and LD1 / GooseB in their IED -> each connection keeps the address of its own kept block only; the access point serving A's server (ServerAt) and its connection kept; the connection of AP2 dropped; the member naming LD9 unresolved":
			{
				sourceXml: TwoSendersSharingNamesXml,
				seeds: [
					{ ref: { tagName: 'GSEControl', id: 'a-goose-a' }, depth: 'interface' },
					{ ref: { tagName: 'GSEControl', id: 'b-goose-b' }, depth: 'interface' },
				],
				ieds: {
					a: { depth: 'interface', leftOut: ['a-ap2', 'a-ptrc1', 'a-sv-a'] },
					b: { depth: 'interface', leftOut: ['b-goose-a'] },
				},
				connections: {
					'a-ap1-connection': ['a-smv-sv-a'],
					'a-ap3-connection': [],
					'b-ap1-connection': ['b-gse-goose-a'],
				},
				droppedConnections: ['a-ap2-connection'],
				unresolvedMembers: ['a-fcda-absent'],
				logicalNodes: ['a-ln0', 'a-ggio1', 'b-ln0', 'b-ggio1'],
			},
		'sampled value block SvA -> its options and its SMV kept, its receivers left out': {
			sourceXml: TwoSendersSharingNamesXml,
			seeds: [{ ref: { tagName: 'SampledValueControl', id: 'a-sv-a' }, depth: 'interface' }],
			ieds: {
				a: { depth: 'interface', leftOut: ['a-ap2', 'a-ptrc1', 'a-goose-a', 'a-sv-a-receiver'] },
			},
			connections: {
				'a-ap1-connection': ['a-gse-goose-a'],
				'a-ap3-connection': ['a-ap3-gse-goose-a'],
			},
			droppedConnections: ['a-ap2-connection'],
			unresolvedMembers: ['a-fcda-absent'],
			logicalNodes: ['a-ln0', 'a-ggio1'],
		},
		'report block RptLn held by logical node PTRC1 -> PTRC1 with its data set kept, the LN0 of its logical device kept':
			{
				sourceXml: TwoSendersSharingNamesXml,
				seeds: [{ ref: { tagName: 'ReportControl', id: 'a-rpt-ln' }, depth: 'interface' }],
				ieds: {
					a: {
						depth: 'interface',
						leftOut: ['a-ap2', 'a-ggio1', 'a-set-a', 'a-goose-a', 'a-sv-a'],
					},
				},
				connections: {
					'a-ap1-connection': ['a-gse-goose-a', 'a-smv-sv-a'],
					'a-ap3-connection': ['a-ap3-gse-goose-a'],
				},
				droppedConnections: ['a-ap2-connection'],
				unresolvedMembers: [],
				logicalNodes: ['a-ln0', 'a-ptrc1'],
			},
		'A whole and GooseB of B -> A untouched, B cut to GooseB': {
			sourceXml: TwoSendersSharingNamesXml,
			seeds: [
				{ ref: a, depth: 'whole' },
				{ ref: { tagName: 'GSEControl', id: 'b-goose-b' }, depth: 'interface' },
			],
			ieds: {
				a: { depth: 'whole', leftOut: [] },
				b: { depth: 'interface', leftOut: ['b-goose-a'] },
			},
			connections: { 'b-ap1-connection': ['b-gse-goose-a'] },
			droppedConnections: [],
			unresolvedMembers: [],
			logicalNodes: ['a-ln0', 'a-ggio1', 'a-ptrc1', 'b-ln0', 'b-ggio1'],
		},
	}

	runSclTestCases.withoutExport<SharedNamesCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const closure = readClosureModel(source.query, { iedRefs: [a, b] }).then((model) =>
				planClosure({ model, seeds: testCase.seeds }),
			)
			await expect(closure).resolves.toBeDefined()
			const plan = await closure
			expect(
				Object.fromEntries(
					[...plan.ieds].map(([id, ied]) => [
						id,
						{ depth: ied.depth, leftOut: sorted(ied.leaveOut) },
					]),
				),
			).toEqual(
				Object.fromEntries(
					Object.entries(testCase.ieds).map(([id, ied]) => [
						id,
						{ depth: ied.depth, leftOut: sorted(ied.leftOut) },
					]),
				),
			)
			expect(
				Object.fromEntries(
					[...plan.connections].map(([id, connection]) => [id, sorted(connection.leaveOut)]),
				),
			).toEqual(
				Object.fromEntries(
					Object.entries(testCase.connections).map(([id, leftOut]) => [id, sorted(leftOut)]),
				),
			)
			expect(sorted(plan.droppedConnections)).toEqual(sorted(testCase.droppedConnections))
			expect(sorted(plan.unresolvedMembers)).toEqual(sorted(testCase.unresolvedMembers))
			expect(sorted(plan.logicalNodes)).toEqual(sorted(testCase.logicalNodes))
		},
	})
})

type RefusalCase = SclTest.BaseXmlTestCase & {
	iedRefs: Scl.Ref<'IED'>[]
	seeds: ClosureSeed[]
	expectedKey: string
}

describe('planClosure - what it refuses', () => {
	const testCases: SclTest.TestCases<RefusalCase> = {
		'an IED the document does not hold -> ELEMENT_NOT_FOUND': {
			sourceXml: TwoSendersSharingNamesXml,
			iedRefs: [{ tagName: 'IED', id: 'ghost' }],
			seeds: [],
			expectedKey: 'ELEMENT_NOT_FOUND',
		},
		'an interface seed that is not a control block -> ASSERTION_FAILED': {
			sourceXml: TwoSendersSharingNamesXml,
			iedRefs: [a],
			seeds: [{ ref: { tagName: 'GSEControl', id: 'a-set-a' }, depth: 'interface' }],
			expectedKey: 'ASSERTION_FAILED',
		},
		'an interface seed naming a GOOSE block as a report block -> ASSERTION_FAILED': {
			sourceXml: TwoSendersSharingNamesXml,
			iedRefs: [a],
			seeds: [{ ref: { tagName: 'ReportControl', id: 'a-goose-a' }, depth: 'interface' }],
			expectedKey: 'ASSERTION_FAILED',
		},
		'a whole seed that is not an IED of the model -> ASSERTION_FAILED': {
			sourceXml: TwoSendersSharingNamesXml,
			iedRefs: [a],
			seeds: [{ ref: { tagName: 'IED', id: 'a-ld1' }, depth: 'whole' }],
			expectedKey: 'ASSERTION_FAILED',
		},
	}

	runSclTestCases.withoutExport<RefusalCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const refused = await readClosureModel(source.query, { iedRefs: testCase.iedRefs })
				.then((model) => planClosure({ model, seeds: testCase.seeds }))
				.then(
					() => undefined,
					(error: unknown) => error,
				)
			expect(toDialecteError(refused)?.key).toBe(testCase.expectedKey)
		},
	})
})
