/// <reference types="vite/client" />

import DataOfAMappedToAnotherLnOfAXml from './fixtures/data-of-a-mapped-to-another-ln-of-a.xml?raw'
import InputBetweenTwoLnodesOfAXml from './fixtures/input-between-two-lnodes-of-a.xml?raw'
import InputOfAFedByAnLnodeOfBXml from './fixtures/input-of-a-fed-by-an-lnode-of-b.xml?raw'
import InputOfALinkedToAnExtrefOfAXml from './fixtures/input-of-a-linked-to-an-extref-of-a.xml?raw'
import InputOfAWithoutExpectedDataFedByBXml from './fixtures/input-of-a-without-expected-data-fed-by-b.xml?raw'
import LnodeOfAWithAStaleSpecifiedNamingXml from './fixtures/lnode-of-a-with-a-stale-specified-naming.xml?raw'
import LnodeOfAWithoutSpecifiedNamingXml from './fixtures/lnode-of-a-without-specified-naming.xml?raw'
import OutputOfAControllingAnLnodeOfBXml from './fixtures/output-of-a-controlling-an-lnode-of-b.xml?raw'
import OutputOfALinkedToAnExtctrlOfAXml from './fixtures/output-of-a-linked-to-an-extctrl-of-a.xml?raw'

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

describe('an input or output specification naming what the file does not hold stays as a requirement', () => {
	const testCases: SclTest.TestCases = {
		'input of the LNode of A in F2 fed by the LNode of B → the input with its expected data, no link to the LNode of B':
			{
				sourceXml: InputOfAFedByAnLnodeOfBXml,
				targetXml: emptyIsd,
				expectedQueries: [
					'//default:LNode[@lnClass="XCBR"]/default:Private/v2019C1:LNodeInputs/v2019C1:SourceRef[@input="Interlock"][@service="GOOSE"][@pDO="Op"][@pDA="general"][not(@source or @sourceLNodeUuid or @sourceDoName or @sourceDaName)]',
				],
			},
		'input of the LNode of A in F2 with no expected data, fed by the LNode of B → the expected data taken from what fed it':
			{
				sourceXml: InputOfAWithoutExpectedDataFedByBXml,
				targetXml: emptyIsd,
				expectedQueries: [
					'//v2019C1:SourceRef[@input="Interlock"][@pLN="CILO"][@pDO="Op"][@pDA="general"][not(@sourceLNodeUuid)]',
				],
			},
		'input of the LNode of A in F1 fed by another LNode of A → the input keeps its source': {
			sourceXml: InputBetweenTwoLnodesOfAXml,
			targetXml: emptyIsd,
			expectedQueries: [
				'//v2019C1:SourceRef[@input="Trip"][@sourceLNodeUuid="80000000-0000-4000-8000-0000000000a1"][@sourceDoName="Op"][@sourceDaName="general"]',
			],
		},
		'input of the LNode of A linked to the input of its LN → the link cleared, the file holds no input of the IED':
			{
				sourceXml: InputOfALinkedToAnExtrefOfAXml,
				targetXml: emptyIsd,
				expectedQueries: [
					'//v2019C1:SourceRef[@input="Trip"][@pDO="Op"][not(@extRefUuid or @extRefAddr)]',
				],
				unexpectedQueries: ['//default:Inputs'],
			},
		'output of the LNode of A in F2 controlling the LNode of B → the output with its expected data, no link to the LNode of B':
			{
				sourceXml: OutputOfAControllingAnLnodeOfBXml,
				targetXml: emptyIsd,
				expectedQueries: [
					'//default:LNode[@lnClass="XCBR"]/default:Private/v2019C1:LNodeOutputs/v2019C1:ControlRef[@output="Release"][@pDO="Op"][not(@controlled or @controlledLNodeUuid or @controlledDoName)]',
				],
			},
		'output of the LNode of A linked to an external control of its LN → the output keeps that link':
			{
				sourceXml: OutputOfALinkedToAnExtctrlOfAXml,
				targetXml: emptyIsd,
				expectedQueries: [
					'//v2019C1:ControlRef[@output="Open"][@extCtrlUuid="71000000-0000-4000-8000-0000000000a1"]',
					'//default:IED[@name="A"]//default:ExtCtrl[@uuid="71000000-0000-4000-8000-0000000000a1"]',
				],
			},
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('the specification of a written LNode describes the LNode only', () => {
	const testCases: SclTest.TestCases = {
		'data of the LNode of A mapped to another LN of A → its data and value written, not the mapping':
			{
				sourceXml: DataOfAMappedToAnotherLnOfAXml,
				targetXml: emptyIsd,
				expectedQueries: [
					'//default:LNode[@lnClass="PTRC"]/default:Private/v2019C1:DOS[@name="Op"]/v2019C1:DAS[@name="general"]/v2019C1:Val[text()="false"]',
				],
				unexpectedQueries: [
					'//v2019C1:DOS[@mappedLnUuid or @mappedDoName]',
					'//v2019C1:DAS[@mappedLnUuid or @mappedDaName]',
				],
			},
		'LNode of A with no specified naming → its naming written, IED and logical device included': {
			sourceXml: LnodeOfAWithoutSpecifiedNamingXml,
			targetXml: emptyIsd,
			expectedQueries: [
				'//default:LNode[@lnClass="PTRC"]/default:Private/v2019C1:LNodeSpecNaming[@sIedName="A"][@sLdInst="LD1"][string(@sPrefix)=""][@sLnClass="PTRC"][@sLnInst="1"]',
			],
		},
		'LNode of A with a specified naming of another class and instance → the naming of the LNode written instead':
			{
				sourceXml: LnodeOfAWithAStaleSpecifiedNamingXml,
				targetXml: emptyIsd,
				expectedQueries: [
					'//default:LNode[@lnClass="PTRC"]/default:Private[count(v2019C1:LNodeSpecNaming)=1]/v2019C1:LNodeSpecNaming[@sIedName="A"][@sLdInst="LD1"][string(@sPrefix)=""][@sLnClass="PTRC"][@sLnInst="1"]',
				],
			},
	}

	runSclTestCases.withExport({ testCases, act })
})
