import { findByName, reportAndApply } from '../integration-helpers'

import { describe } from 'vitest'

import { fsd as extractFsd } from '@/v2019C1/extensions/lifecycle/extract/transaction'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	openSclDocument,
	runSclTestCases,
} from '@/v2019C1/test'

import type { FsdFunctionRef } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { FunctionPlacement } from '@/v2019C1/extensions/lifecycle/extract/transaction/extract.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	/** Where the extracted FSD holds the function. */
	placement: FunctionPlacement
	/** The element of the FSD the placement names. */
	root: FsdFunctionRef['tagName']
}

/** A project whose bay holds a protection function with a trip subfunction; a second bay to place the FSD in. */
const projectXml = /* xml */ `
	<SCL ${ns} ${id}="project">
		<Header id="project" ${id}="project-header"/>
		<Substation name="S1" ${id}="s1">
			<VoltageLevel name="V1" ${id}="v1">
				<Bay name="B1" ${id}="b1">
					<Function name="Prot" uuid="prot-uuid" ${id}="prot">
						<LNode iedName="None" lnClass="PTOC" lnInst="1" uuid="ptoc-uuid" ${id}="ptoc"/>
						<SubFunction name="Trip" uuid="trip-uuid" ${id}="trip">
							<LNode iedName="None" lnClass="PTRC" lnInst="1" uuid="ptrc-uuid" ${id}="ptrc"/>
						</SubFunction>
					</Function>
				</Bay>
				<Bay name="B2" ${id}="b2"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const emptyXml = /* xml */ `<SCL ${ns} ${id}="extracted-root" version="2007" revision="C" release="5"/>`

/** The function placed again in the second bay, whatever form its FSD holds it in. */
const placedInSecondBay = [
	'//default:Bay[@name="B2"]/default:Function[@name="Prot"]/default:LNode[@lnClass="PTOC"]',
	'//default:Bay[@name="B2"]/default:Function[@name="Prot"]/default:SubFunction[@name="Trip"]/default:LNode[@lnClass="PTRC"]',
]

/** An FSD extracted from a bay function, then instantiated in another bay: the same function, in each form. */
describe('extract.fsd, then instantiated: each placement gives the function back', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'at its own level': {
			sourceXml: projectXml,
			targetXml: projectXml,
			placement: 'source-level',
			root: 'Function',
			expectedQueries: placedInSecondBay,
		},
		'below the TEMPLATE substation': {
			sourceXml: projectXml,
			targetXml: projectXml,
			placement: 'substation',
			root: 'Function',
			expectedQueries: placedInSecondBay,
		},
		'as a function template': {
			sourceXml: projectXml,
			targetXml: projectXml,
			placement: 'function-template',
			root: 'FunctionTemplate',
			expectedQueries: placedInSecondBay,
		},
	}

	async function act({
		testCase,
		source,
		target,
		project,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')
		const extracted = await openSclDocument({ project, xml: emptyXml, label: 'extracted fsd' })
		await extracted.transaction(async function extractFunction(tx) {
			await extractFsd(tx, {
				sourceQuery: source.query,
				functionRef: { tagName: 'Function', id: 'prot' },
				tool: 'TEST',
				who: 'test',
				placement: testCase.placement,
			})
		})

		const ref = await findByName(extracted.query, { tagName: testCase.root, name: 'Prot' })
		const anchor = await findByName(target.query, { tagName: 'Bay', name: 'B2' })
		await reportAndApply({
			document: target,
			lifecycle: {
				verb: 'fsd',
				sourceQuery: extracted.query,
				ref: ref as FsdFunctionRef,
				anchor,
				scenario: 'instantiate',
			},
		})
		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
