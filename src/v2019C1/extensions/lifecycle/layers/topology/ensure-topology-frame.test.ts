import { ensureTopologyFrame } from './ensure-topology-frame'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	scopeTag: string
	scopeId: string
	targetParentId?: string
}

// A Substation scope with two Bays. Bay B1 carries a BayType classification + equipment + an
// Application (delegated to the application layer). A Function lives under the Substation
// (delegated to the function layer). ensureTopologyFrame must REPRODUCE the structural frame by
// name (Substation/VL/both Bays), carry the topology-OWN content (BayType, equipment), and OMIT
// the delegated fn/app content.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="scl-src">
		<Substation name="S1" desc="main" ${id}="sub-1">
			<VoltageLevel name="V1" ${id}="vl-1">
				<Bay name="B1" ${id}="bay-1">
					<Private type="eIEC61850-6-100" ${id}="bay1-priv">
						<eIEC61850-6-100:BayType ${id}="baytype-1">Interconnection</eIEC61850-6-100:BayType>
						<eIEC61850-6-100:Application name="CB" type="HV" uuid="app-uuid" ${id}="app-1">
							<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="fr-1"/>
						</eIEC61850-6-100:Application>
					</Private>
					<ConductingEquipment name="QA1" type="CBR" ${id}="ce-1"/>
				</Bay>
				<Bay name="B2" ${id}="bay-2">
					<Private type="eIEC61850-6-100" ${id}="bay2-priv">
						<eIEC61850-6-100:BayType ${id}="baytype-2">Feeder</eIEC61850-6-100:BayType>
					</Private>
				</Bay>
			</VoltageLevel>
			<Function name="Prot" uuid="fn-uuid" ${id}="fn-1">
				<LNode iedName="None" lnClass="CSWI" lnInst="1" uuid="ln-uuid" ${id}="lnode-1"/>
			</Function>
		</Substation>
	</SCL>
`

describe('ensureTopologyFrame - reproduces the source topology frame by name (merge-by-name)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'reproduces the structural frame with its own content, omitting delegated fn/app': {
			sourceXml,
			scopeTag: 'Substation',
			scopeId: 'sub-1',
			targetXml: /* xml */ `<SCL ${ns} ${id}="scl-tgt"/>`,
			expectedQueries: [
				// structural frame reproduced by name
				'//default:Substation[@name="S1"]',
				'//default:Substation[@name="S1"]/default:VoltageLevel[@name="V1"]',
				'//default:VoltageLevel[@name="V1"]/default:Bay[@name="B1"]',
				// multi-bay: the second Bay is reproduced distinctly (no collapse)
				'//default:VoltageLevel[@name="V1"]/default:Bay[@name="B2"]',
				// topology-OWN content travels: BayType classification on each Bay
				'//default:Bay[@name="B1"]/default:Private/v2019C1:BayType',
				'//default:Bay[@name="B2"]/default:Private/v2019C1:BayType',
				// equipment (topology-own) travels
				'//default:Bay[@name="B1"]/default:ConductingEquipment[@name="QA1"]',
			],
			unexpectedQueries: [
				// delegated content is NOT carried by the frame (fn/app layers own it)
				'//default:Bay//v2019C1:Application',
				'//default:Substation/default:Function',
			],
		},

		'reuses the ancestor levels the target already provides and creates the scope Bay under them': {
			sourceXml,
			scopeTag: 'Bay',
			scopeId: 'bay-1',
			targetParentId: 't-vl',
			targetXml: /* xml */ `
				<SCL ${ns} ${id}="scl-tgt">
					<Substation name="S1" desc="existing" ${id}="t-sub">
						<VoltageLevel name="V1" ${id}="t-vl">
							<Bay name="B0" ${id}="t-bay0"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expectedQueries: [
				// the existing ancestors are REUSED as context (untouched)
				'//default:Substation[@name="S1"][@desc="existing"]',
				'//default:VoltageLevel[@name="V1"]/default:Bay[@name="B0"]',
				// the scope Bay is CREATED under the reused VoltageLevel, with its own content
				'//default:VoltageLevel[@name="V1"]/default:Bay[@name="B1"]',
				'//default:Bay[@name="B1"]/default:Private/v2019C1:BayType',
				'//default:Bay[@name="B1"]/default:ConductingEquipment[@name="QA1"]',
			],
			unexpectedQueries: [
				// the source ancestor Substation is context (reused), never cloned (would carry desc="main")
				'//default:Substation[@desc="main"]',
				// a sibling Bay outside the scope is not pulled in
				'//default:Bay[@name="B2"]',
			],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			const targetParent = testCase.targetParentId
				? ({ tagName: 'VoltageLevel', id: testCase.targetParentId } as Scl.Ref<Scl.ElementsOf>)
				: ((await tx.getRoot()) as unknown as Scl.Ref<Scl.ElementsOf>)
			await ensureTopologyFrame(tx, {
				sourceQuery: source.query,
				scopeRef: { tagName: testCase.scopeTag, id: testCase.scopeId } as Scl.Ref<Scl.ElementsOf>,
				targetParent,
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
