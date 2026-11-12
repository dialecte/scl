/// <reference types="vite/client" />

import BayOfBBesideABayOfAXml from './fixtures/bay-of-b-beside-a-bay-of-a.xml?raw'
import BreakerOfAAndBreakerOfNothingXml from './fixtures/breaker-of-a-and-breaker-of-nothing.xml?raw'
import BreakerOfAConnectedToAnotherBayXml from './fixtures/breaker-of-a-connected-to-another-bay.xml?raw'
import F1OnAWithIdentifiersXml from './fixtures/f1-on-a-with-identifiers.xml?raw'
import F1OnAXml from './fixtures/f1-on-a.xml?raw'
import F1WithAnLnodeOnNoIedXml from './fixtures/f1-with-an-lnode-on-no-ied.xml?raw'
import F2SharedByAAndBXml from './fixtures/f2-shared-by-a-and-b.xml?raw'
import FunctionOnBOnlyXml from './fixtures/function-on-b-only.xml?raw'
import LineWithAFunctionOnAAndTwoBreakersXml from './fixtures/line-with-a-function-on-a-and-two-breakers.xml?raw'
import LnodeOfAOnAVoltageLevelXml from './fixtures/lnode-of-a-on-a-voltage-level.xml?raw'
import LnodesOfAAndBWithTheirOwnTypesXml from './fixtures/lnodes-of-a-and-b-with-their-own-types.xml?raw'
import LnodesOfAOnPtrcAndLgosXml from './fixtures/lnodes-of-a-on-ptrc-and-lgos.xml?raw'
import ProcessRootOnAXml from './fixtures/process-root-on-a.xml?raw'
import TargetHoldingSubstationS1Xml from './fixtures/target-holding-substation-s1.xml?raw'
import TransformerWithTwoWindingsOnAXml from './fixtures/transformer-with-two-windings-on-a.xml?raw'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const emptyIsd = /* xml */ `<SCL ${ns} ${id}="empty-isd"/>`

const EXPORT = {
	iedRef: { tagName: 'IED', id: 'ied-a' },
	fileType: 'ISD',
	kind: 'instance',
	inputs: 'none',
	issuer: 'TEST_ISSUER',
	tool: 'TEST',
	who: 'engineer',
} as const

async function act({
	source,
	target,
}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
	if (!target) throw new Error('target required')
	await target.transaction(async function exportIsd(tx) {
		return tx.lifecycle.extract.ied({ ...EXPORT, sourceQuery: source.query })
	})
	return { assertOn: 'target' }
}

describe('the process part of an ISD holds the LNodes of the S-IED in their frame', () => {
	const testCases: SclTest.TestCases = {
		'no LNode on A, a function on B → no specification part in the file': {
			sourceXml: FunctionOnBOnlyXml,
			targetXml: emptyIsd,
			expectedQueries: ['/default:SCL/default:IED[@name="A"]'],
			unexpectedQueries: ['//default:Substation', '//default:Function', '//default:LNode'],
		},
		'F1 in bay B1 holding an LNode on A → S1, V1, B1 and F1 with that LNode, names and identifiers as in the project':
			{
				sourceXml: F1OnAWithIdentifiersXml,
				targetXml: emptyIsd,
				expectedQueries: [
					'/default:SCL/default:Substation[@name="S1"][@uuid="11000000-0000-4000-8000-000000000001"]/default:VoltageLevel[@name="V1"][@uuid="11000000-0000-4000-8000-000000000002"]/default:Bay[@name="B1"][@uuid="11000000-0000-4000-8000-000000000003"]/default:Function[@name="F1"][@uuid="12000000-0000-4000-8000-000000000001"]/default:LNode[@iedName="A"][@lnClass="PTRC"][@lnUuid="5a000000-0000-4000-8000-000000000001"][@uuid="80000000-0000-4000-8000-0000000000a1"]',
				],
			},
		'F1 holding an LNode on A and an LNode on no IED → F1 with the LNode on A only': {
			sourceXml: F1WithAnLnodeOnNoIedXml,
			targetXml: emptyIsd,
			expectedQueries: [
				'//default:Function[@name="F1"][count(default:LNode)=1]/default:LNode[@iedName="A"][@lnClass="PTRC"]',
			],
			unexpectedQueries: ['//default:LNode[@iedName="None"]'],
		},
		'F2 with subfunction Control on A and subfunction Interlock on B → F2 with Control only': {
			sourceXml: F2SharedByAAndBXml,
			targetXml: emptyIsd,
			expectedQueries: [
				'//default:Function[@name="F2"][count(default:SubFunction)=1]/default:SubFunction[@name="Control"]/default:LNode[@iedName="A"]',
			],
			unexpectedQueries: [
				'//default:SubFunction[@name="Interlock"]',
				'//default:LNode[@iedName="B"]',
			],
		},
		'bay B1 with F1 on A, bay B2 with F3 on B only → B1, no B2': {
			sourceXml: BayOfBBesideABayOfAXml,
			targetXml: emptyIsd,
			expectedQueries: [
				'//default:VoltageLevel[@name="V1"][count(default:Bay)=1]/default:Bay[@name="B1"]',
			],
			unexpectedQueries: ['//default:Bay[@name="B2"]', '//default:Function[@name="F3"]'],
		},
		'breaker QA1 whose equipment function holds an LNode on A, breaker QA2 of nothing → QA1 with its function, no QA2':
			{
				sourceXml: BreakerOfAAndBreakerOfNothingXml,
				targetXml: emptyIsd,
				expectedQueries: [
					'//default:Bay[@name="B1"][count(default:ConductingEquipment)=1]/default:ConductingEquipment[@name="QA1"]/default:EqFunction[@name="BreakerControl"]/default:LNode[@iedName="A"][@lnClass="XCBR"]',
				],
				unexpectedQueries: ['//default:ConductingEquipment[@name="QA2"]'],
			},
		'Process root holding a function on A → the Process with that function': {
			sourceXml: ProcessRootOnAXml,
			targetXml: emptyIsd,
			expectedQueries: [
				'/default:SCL/default:Process[@name="Plant"][@uuid="11000000-0000-4000-8000-000000000011"]/default:Function[@name="PlantProtection"]/default:LNode[@iedName="A"]',
			],
		},
		'Line holding a function on A and two breakers of nothing → the Line with its function and its first breaker, which a line requires':
			{
				sourceXml: LineWithAFunctionOnAAndTwoBreakersXml,
				targetXml: emptyIsd,
				expectedQueries: [
					'/default:SCL/default:Line[@name="L1"][count(default:ConductingEquipment)=1][default:ConductingEquipment[@name="LineBreaker1"]]/default:Function[@name="LineProtection"]/default:LNode[@iedName="A"]',
				],
				unexpectedQueries: ['//default:ConductingEquipment[@name="LineBreaker2"]'],
			},
		'voltage level V1 holding an LNode on A itself, bays B1 and B2 of nothing → V1 with the LNode and B1, the bay a voltage level requires':
			{
				sourceXml: LnodeOfAOnAVoltageLevelXml,
				targetXml: emptyIsd,
				expectedQueries: [
					'//default:VoltageLevel[@name="V1"][count(default:Bay)=1][default:LNode[@iedName="A"]]/default:Bay[@name="B1"]',
				],
				unexpectedQueries: ['//default:Bay[@name="B2"]'],
			},
		'breaker QA1 on A in B1 connected to node CN1 of bay B2, which holds a node CN2 and a breaker QA2 → B2 with CN1 only':
			{
				sourceXml: BreakerOfAConnectedToAnotherBayXml,
				targetXml: emptyIsd,
				expectedQueries: [
					'//default:Bay[@name="B1"]/default:ConductingEquipment[@name="QA1"]/default:Terminal[@cNodeUuid="11000000-0000-4000-8000-000000000021"]',
					'//default:Bay[@name="B2"][count(default:ConnectivityNode)=1]/default:ConnectivityNode[@name="CN1"][@uuid="11000000-0000-4000-8000-000000000021"]',
				],
				unexpectedQueries: [
					'//default:ConductingEquipment[@name="QA2"]',
					'//default:ConnectivityNode[@name="CN2"]',
				],
			},
		'LNode on A mapped to its LGOS beside one mapped to its PTRC → F1 with the PTRC LNode only': {
			sourceXml: LnodesOfAOnPtrcAndLgosXml,
			targetXml: emptyIsd,
			expectedQueries: [
				'//default:Function[@name="F1"][count(default:LNode)=1]/default:LNode[@lnClass="PTRC"]',
			],
			unexpectedQueries: ['//default:LNode[@lnClass="LGOS"]'],
		},
		'power transformer T1 with windings W1 and W2 and an equipment function on A → T1 whole, with the nodes its windings connect to':
			{
				sourceXml: TransformerWithTwoWindingsOnAXml,
				targetXml: emptyIsd,
				expectedQueries: [
					'//default:PowerTransformer[@name="T1"][count(default:TransformerWinding)=2][default:TransformerWinding[@name="W2"]/default:Terminal[@cNodeName="CN2"]]/default:EqFunction[@name="Differential"]/default:LNode[@iedName="A"]',
					'//default:Bay[@name="B1"][count(default:ConnectivityNode)=2]',
				],
			},
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the data types of an ISD include those of its LNodes', () => {
	const testCases: SclTest.TestCases = {
		'LNode on A with a type of its own, LNode on B with another → the type of the LNode on A, not the other':
			{
				sourceXml: LnodesOfAAndBWithTheirOwnTypesXml,
				targetXml: emptyIsd,
				expectedQueries: [
					'//default:LNode[@lnClass="XCBR"][@lnType="XCBR_SPECIFIED"]',
					'/default:SCL/default:DataTypeTemplates/default:LNodeType[@id="XCBR_SPECIFIED"]/default:DO[@name="Pos"][@type="DPS_T"]',
					'/default:SCL/default:DataTypeTemplates/default:DOType[@id="DPS_T"]',
				],
				unexpectedQueries: [
					'//default:LNodeType[@id="CILO_SPECIFIED"]',
					'//default:DOType[@id="ENA_T"]',
				],
			},
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('an ISD is written only into a target holding no process part', () => {
	const testCases: SclTest.TestCases = {
		'target already holding substation S1 → refused, the target as it was': {
			sourceXml: F1OnAXml,
			targetXml: TargetHoldingSubstationS1Xml,
		},
	}

	async function actRefused({
		source,
		target,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<void> {
		if (!target) throw new Error('target required')
		const before = await target.query.getSnapshot({ as: 'tree' })
		const refused = await target
			.transaction(async function exportIsd(tx) {
				return tx.lifecycle.extract.ied({ ...EXPORT, sourceQuery: source.query })
			})
			.catch((error: unknown) => error)
		expect(toDialecteError(refused)?.key).toBe('EXTRACTION_TARGET_NOT_EMPTY')
		const after = await target.query.getSnapshot({ as: 'tree' })
		expect(after).toEqual(before)
	}

	runSclTestCases.withoutExport({ testCases, act: actRefused })
})
