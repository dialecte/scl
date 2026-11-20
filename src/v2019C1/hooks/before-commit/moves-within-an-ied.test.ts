import aTripNamedAcrossTheProject from './fixtures/a-trip-named-across-the-project.xml?raw'
import secondAccessPointNotConnected from './fixtures/an-ied-with-its-second-access-point-not-connected.xml?raw'
import twoAccessPointsOnOneBus from './fixtures/an-ied-with-two-access-points-on-one-bus.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

type MoveCase = SclTest.BaseXmlTestCase & {
	/** The moves of one transaction, in order. */
	moves: {
		element: Scl.Ref<Scl.ElementsOf>
		parent: Scl.Ref<Scl.ElementsOf>
		before?: Scl.Ref<Scl.ElementsOf>
	}[]
	/** Attributes the same transaction writes after the moves. */
	updates?: { element: Scl.Ref<Scl.ElementsOf>; attributes: Record<string, string> }[]
}

type RefusedCase = MoveCase & {
	/** The refusal: its key and its meta. */
	expected: { key: string | undefined; meta: unknown }
}

const ptrc1 = { tagName: 'LN', id: 'ptrc1' } as Scl.Ref<'LN'>
const ctrl = { tagName: 'LDevice', id: 'ctrl' } as Scl.Ref<'LDevice'>
const prot = { tagName: 'LDevice', id: 'prot' } as Scl.Ref<'LDevice'>

// A logical node moved to another logical device of its IED commits: every reference naming it by its uuid takes its new
// device, what names it by its place within the logical node stays, and what names it by names only follows the rename
// rule (left naming nothing).
describe('the commit follows a logical node moved to another logical device of its IED', () => {
	const testCases: SclTest.TestCases<MoveCase> = {
		// PTRC1 (ptrc1-uuid) goes from PROT to CTRL of BCU1
		'PTRC1 moved from PROT to CTRL → every reference naming it by its uuid names CTRL, the record kept':
			{
				sourceXml: aTripNamedAcrossTheProject,
				moves: [{ element: ptrc1, parent: ctrl }],
				expectedQueries: [
					'//default:LDevice[@inst="CTRL"]/default:LN[@lnClass="PTRC"][@uuid="ptrc1-uuid"]',
					'//default:LNode[@lnUuid="ptrc1-uuid"][@iedName="BCU1"][@ldInst="CTRL"][@lnClass="PTRC"][@lnInst="1"]',
					'//default:ExtRef[@lnUuid="ptrc1-uuid"][@iedName="BCU1"][@ldInst="CTRL"][@doName="Tr"]',
					'//default:ExtRef[@srcCBUuid="trip-report-uuid"][@srcLDInst="CTRL"][@srcCBName="TripReport"]',
					'//default:FCDA[@lnUuid="ptrc1-uuid"][@ldInst="CTRL"][@doName="Tr"]',
					'//default:ClientLN[@lnUuid="ptrc1-uuid"][@iedName="BCU1"][@ldInst="CTRL"]',
					'//default:IEDName[@lnUuid="ptrc1-uuid"][@ldInst="CTRL"][text()="BCU1"]',
				],
				unexpectedQueries: [
					'//default:LDevice[@inst="PROT"]/default:LN[@lnClass="PTRC"]',
					'//default:*[@lnUuid="ptrc1-uuid"][@ldInst="PROT"]',
					'//default:ExtRef[@srcLDInst="PROT"]',
				],
			},
		// CSWI1's DOS names PTRC1's Tr within PTRC1, and PTRC1's LNode names its specification: both stay as written
		'PTRC1 moved from PROT to CTRL → its mapped names and its specification naming unchanged': {
			sourceXml: aTripNamedAcrossTheProject,
			moves: [{ element: ptrc1, parent: ctrl }],
			expectedQueries: [
				'//v2019C1:DOS[@name="Tr"][@mappedLnUuid="ptrc1-uuid"][@mappedDoName="Tr"]',
				'//v2019C1:LNodeSpecNaming[@sIedName="BCU1"][@sLdInst="PROT"][@sLnClass="PTRC"][@sLnInst="1"]',
			],
		},
		// the SourceRef of the CSWI1 LNode reads PTRC1's input Trip by its address, below the IED
		'PTRC1 moved from PROT to CTRL → the SourceRef reading its input names it under CTRL': {
			sourceXml: aTripNamedAcrossTheProject,
			moves: [{ element: ptrc1, parent: ctrl }],
			expectedQueries: [
				'//v2019C1:SourceRef[@extRefUuid="trip-input-uuid"][@extRefAddr="CTRL/PTRC1.Trip"]',
			],
			unexpectedQueries: ['//v2019C1:SourceRef[@extRefAddr="PROT/PTRC1.Trip"]'],
		},
		// TripLogging names its log by its own device: moved, it names PROT's TripLog outright
		'PTRC1 moved from PROT to CTRL → its log control names PROT, still logging to TripLog': {
			sourceXml: aTripNamedAcrossTheProject,
			moves: [{ element: ptrc1, parent: ctrl }],
			expectedQueries: [
				'//default:LDevice[@inst="CTRL"]/default:LN[@lnClass="PTRC"]/default:LogControl[@name="TripLogging"][@ldInst="PROT"][@logName="TripLog"]',
			],
		},
		// SUB1's third ExtRef names CTRL/PTRC1 by its names only, where nothing stood: as after a rename, it now names PTRC1
		"PTRC1 moved from PROT to CTRL → the ExtRef naming CTRL/PTRC1 by names only takes PTRC1's uuid":
			{
				sourceXml: aTripNamedAcrossTheProject,
				moves: [{ element: ptrc1, parent: ctrl }],
				expectedQueries: ['//default:ExtRef[@doName="Op"][@ldInst="CTRL"][@lnUuid="ptrc1-uuid"]'],
			},
		// moved to CTRL, then back to PROT, in one transaction: no move
		'PTRC1 moved to CTRL and back to PROT → nothing written': {
			sourceXml: aTripNamedAcrossTheProject,
			moves: [
				{ element: ptrc1, parent: ctrl },
				{ element: ptrc1, parent: prot },
			],
			expectedQueries: [
				'//default:LDevice[@inst="PROT"]/default:LN[@lnClass="PTRC"][@uuid="ptrc1-uuid"]',
				'//default:LNode[@lnUuid="ptrc1-uuid"][@ldInst="PROT"]',
				'//default:LogControl[@name="TripLogging"][not(@ldInst)]',
			],
		},
	}

	runSclTestCases.withExport({ testCases, act: moveInOneTransaction })
})

// A logical device moved to another access point of its IED commits: no tuple name changes, and the address of each
// control block it sends follows it to the connection of its new access point on the same subnetwork.
describe('the commit follows a logical device moved to another access point of its IED', () => {
	const testCases: SclTest.TestCases<MoveCase> = {
		// CTRL (sending PositionGoose) goes from AP1's server to AP2's; both access points are connected on StationBus
		"CTRL moved from AP1 to AP2 → its GSE under AP2's connection on StationBus, the same address": {
			sourceXml: twoAccessPointsOnOneBus,
			moves: [{ element: ctrl, parent: { tagName: 'Server', id: 'bcu1-server2' } }],
			expectedQueries: [
				'//default:AccessPoint[@name="AP2"]/default:Server/default:LDevice[@inst="CTRL"]/default:LN0/default:GSEControl[@name="PositionGoose"]',
				'//default:ConnectedAP[@apName="AP2"]/default:GSE[@ldInst="CTRL"][@cbName="PositionGoose"][@cbUuid="position-goose-uuid"]/default:Address/default:P[@type="MAC-Address"][text()="01-0C-CD-01-00-01"]',
			],
			unexpectedQueries: ['//default:ConnectedAP[@apName="AP1"]/default:GSE'],
		},
		// AP2 placed before AP1 in BCU1: a reorder, no move
		'AP2 placed before AP1 in BCU1 → reordered, nothing else written': {
			sourceXml: twoAccessPointsOnOneBus,
			moves: [
				{
					element: { tagName: 'AccessPoint', id: 'bcu1-ap2' },
					parent: { tagName: 'IED', id: 'bcu1' },
					before: { tagName: 'AccessPoint', id: 'bcu1-ap1' },
				},
			],
			expectedQueries: [
				'//default:IED[@name="BCU1"]/default:AccessPoint[1][@name="AP2"]',
				'//default:ConnectedAP[@apName="AP1"]/default:GSE[@cbName="PositionGoose"]',
			],
		},
	}

	runSclTestCases.withExport({ testCases, act: moveInOneTransaction })
})

// What a move within an IED cannot follow, and every move across IEDs, is refused: nothing committed.
describe('the commit refuses a move it cannot follow, within or across IEDs', () => {
	const testCases: SclTest.TestCases<RefusedCase> = {
		// AP2 of BCU1 is connected nowhere: PositionGoose's address has no connection to go to
		'CTRL moved to AP2, which is connected nowhere → refused, the IED unchanged': {
			sourceXml: secondAccessPointNotConnected,
			moves: [{ element: ctrl, parent: { tagName: 'Server', id: 'bcu1-server2' } }],
			expected: {
				key: 'MOVE_NOT_FOLLOWED',
				meta: { moved: ctrl, parent: { tagName: 'Server', id: 'bcu1-server2' } },
			},
			expectedQueries: [
				'//default:AccessPoint[@name="AP1"]/default:Server/default:LDevice[@inst="CTRL"]',
			],
		},
		// SUB1's LD0 is in another IED
		'PTRC1 moved to LD0 of SUB1 → refused': {
			sourceXml: aTripNamedAcrossTheProject,
			moves: [{ element: ptrc1, parent: { tagName: 'LDevice', id: 'sub1-ld0' } }],
			expected: {
				key: 'MOVE_NOT_FOLLOWED',
				meta: { moved: ptrc1, parent: { tagName: 'LDevice', id: 'sub1-ld0' } },
			},
			expectedQueries: ['//default:LDevice[@inst="PROT"]/default:LN[@lnClass="PTRC"]'],
		},
		// AP2 of BCU1 goes to BCU2
		'AP2 of BCU1 moved to BCU2 → refused': {
			sourceXml: twoAccessPointsOnOneBus,
			moves: [
				{
					element: { tagName: 'AccessPoint', id: 'bcu1-ap2' },
					parent: { tagName: 'IED', id: 'bcu2' },
				},
			],
			expected: {
				key: 'MOVE_NOT_FOLLOWED',
				meta: {
					moved: { tagName: 'AccessPoint', id: 'bcu1-ap2' },
					parent: { tagName: 'IED', id: 'bcu2' },
				},
			},
			expectedQueries: ['//default:IED[@name="BCU1"]/default:AccessPoint[@name="AP2"]'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<RefusedCase>): Promise<SclTest.ActResult> {
		const refused = await moveInOneTransaction({ testCase, source })
			.then(function committed() {
				return undefined
			})
			.catch(function refusal(error: unknown) {
				const dialecteError = toDialecteError(error)
				return { key: dialecteError?.key, meta: dialecteError?.meta }
			})
		expect(refused).toEqual(testCase.expected)
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

// An LDevice holds one LN0: core refuses moving one into another device, before any commit step runs.
describe('core refuses an LN0 moved into another logical device', () => {
	const testCases: SclTest.TestCases<MoveCase & { expectedKey: string }> = {
		// an LDevice holds one LN0: core refuses the move before the commit
		'the LN0 of PROT moved to CTRL → refused by core, the parent full': {
			sourceXml: aTripNamedAcrossTheProject,
			moves: [{ element: { tagName: 'LN0', id: 'prot-lln0' }, parent: ctrl }],
			expectedKey: 'MAX_OCCURRENCES_REACHED',
			expectedQueries: ['//default:LDevice[@inst="PROT"]/default:LN0/default:Log[@name="TripLog"]'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<MoveCase & { expectedKey: string }>): Promise<SclTest.ActResult> {
		const refused = await moveInOneTransaction({ testCase, source }).catch(function refusal(
			error: unknown,
		) {
			return toDialecteError(error)?.key
		})
		expect(refused).toBe(testCase.expectedKey)
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

/** The case's moves, then its updates, in one transaction. */
async function moveInOneTransaction(params: {
	testCase: MoveCase
	source: SclTest.ActParams<MoveCase>['source']
}): Promise<SclTest.ActResult> {
	const { testCase, source } = params
	await source.transaction(async function moveThenUpdate(tx) {
		for (const { element, parent, before } of testCase.moves) {
			await tx.any.move(element, { parent, ...(before ? { before } : {}) })
		}
		for (const { element, attributes } of testCase.updates ?? []) {
			await tx.any.update(element, { attributes })
		}
	})
	return { assertOn: 'source' }
}
