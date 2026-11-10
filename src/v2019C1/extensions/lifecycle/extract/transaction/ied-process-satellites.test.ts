/// <reference types="vite/client" />

import BehaviourOnLnodesOfAAndBXml from './fixtures/behaviour-on-lnodes-of-a-and-b.xml?raw'
import BehaviourOnTwoLnodesOfAXml from './fixtures/behaviour-on-two-lnodes-of-a.xml?raw'
import ProcessResourceNamedByAnInputOfAXml from './fixtures/process-resource-named-by-an-input-of-a.xml?raw'
import ProcessResourceNamedByNothingXml from './fixtures/process-resource-named-by-nothing.xml?raw'
import VariableOnABayXml from './fixtures/variable-on-a-bay.xml?raw'
import VariableOnAnLnOfAXml from './fixtures/variable-on-an-ln-of-a.xml?raw'
import VariableOnAnLnOfBXml from './fixtures/variable-on-an-ln-of-b.xml?raw'
import VariableOnAnLnodeOfAXml from './fixtures/variable-on-an-lnode-of-a.xml?raw'
import VariableOnAnLnodeOfBXml from './fixtures/variable-on-an-lnode-of-b.xml?raw'
import VariableOnLnodesOfAAndBXml from './fixtures/variable-on-lnodes-of-a-and-b.xml?raw'

import { describe } from 'vitest'

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

describe('a behaviour description travels only when all its LNodes do', () => {
	const testCases: SclTest.TestCases = {
		'behaviour description of F1 on two LNodes of A → written whole': {
			sourceXml: BehaviourOnTwoLnodesOfAXml,
			targetXml: emptyIsd,
			expectedQueries: [
				'//default:Function[@name="F1"]/default:Private/v2019C1:BehaviorDescription[@name="Logic"][@uuid="13000000-0000-4000-8000-000000000001"][count(v2019C1:InputVar)=1][count(v2019C1:OutputVar)=1]/v2019C1:InputVar[@lnodeUuid="80000000-0000-4000-8000-0000000000a1"]',
			],
		},
		'behaviour description of F2 on an LNode of A and one of B → not written, F2 is': {
			sourceXml: BehaviourOnLnodesOfAAndBXml,
			targetXml: emptyIsd,
			expectedQueries: ['//default:Function[@name="F2"]/default:SubFunction[@name="Control"]'],
			unexpectedQueries: ['//v2019C1:BehaviorDescription'],
		},
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('a variable travels with its applications to the LNodes written', () => {
	const testCases: SclTest.TestCases = {
		'variable of F1 applying to an LNode of A → written': {
			sourceXml: VariableOnAnLnodeOfAXml,
			targetXml: emptyIsd,
			expectedQueries: [
				'//default:Function[@name="F1"]/default:Private/v2019C1:Variable[@name="Setting"][@value="5"][@uuid="14000000-0000-4000-8000-000000000001"]/v2019C1:VariableApplyTo[@elementUuid="80000000-0000-4000-8000-0000000000a1"]',
			],
		},
		'variable of F2 applying to an LNode of A and one of B → written with its application to the LNode of A only':
			{
				sourceXml: VariableOnLnodesOfAAndBXml,
				targetXml: emptyIsd,
				expectedQueries: [
					'//v2019C1:Variable[@name="Setting"][count(v2019C1:VariableApplyTo)=1]/v2019C1:VariableApplyTo[@elementUuid="80000000-0000-4000-8000-0000000000a2"]',
				],
			},
		'variable of F2 applying to an LNode of B only → not written': {
			sourceXml: VariableOnAnLnodeOfBXml,
			targetXml: emptyIsd,
			expectedQueries: ['//default:Function[@name="F2"]/default:SubFunction[@name="Control"]'],
			unexpectedQueries: ['//v2019C1:Variable'],
		},
		'variable of F1 applying to bay B1, which the file holds as frame → not written': {
			sourceXml: VariableOnABayXml,
			targetXml: emptyIsd,
			expectedQueries: [
				'//default:Bay[@name="B1"]/default:Function[@name="F1"]/default:LNode[@iedName="A"]',
			],
			unexpectedQueries: ['//v2019C1:Variable'],
		},
		'variable of F1 applying to the LN of A that implements its LNode → written': {
			sourceXml: VariableOnAnLnOfAXml,
			targetXml: emptyIsd,
			expectedQueries: [
				'//v2019C1:Variable[@name="Setting"]/v2019C1:VariableApplyTo[@elementUuid="5a000000-0000-4000-8000-000000000001"]',
			],
		},
		'variable of F1 applying to the LN of B → not written': {
			sourceXml: VariableOnAnLnOfBXml,
			targetXml: emptyIsd,
			expectedQueries: ['//default:Function[@name="F1"]/default:LNode[@iedName="A"]'],
			unexpectedQueries: [
				'//v2019C1:Variable',
				'//*[@elementUuid="5b000000-0000-4000-8000-000000000001"]',
			],
		},
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('a process resource travels when the specification of a written LNode names it', () => {
	const testCases: SclTest.TestCases = {
		'process resource of F1 named by an input of the LNode of A → written': {
			sourceXml: ProcessResourceNamedByAnInputOfAXml,
			targetXml: emptyIsd,
			expectedQueries: [
				'//default:Function[@name="F1"]/default:Private/v2019C1:ProcessResources/v2019C1:ProcessResource[@name="PR1"][@uuid="15000000-0000-4000-8000-000000000001"]',
				'//v2019C1:SourceRef[@input="Trip"][@resourceUuid="15000000-0000-4000-8000-000000000001"]',
			],
		},
		'process resource of F1 that no written LNode names → not written, nor its container': {
			sourceXml: ProcessResourceNamedByNothingXml,
			targetXml: emptyIsd,
			expectedQueries: ['//default:Function[@name="F1"]/default:LNode[@iedName="A"]'],
			unexpectedQueries: ['//v2019C1:ProcessResources', '//v2019C1:ProcessResource'],
		},
	}

	runSclTestCases.withExport({ testCases, act })
})
