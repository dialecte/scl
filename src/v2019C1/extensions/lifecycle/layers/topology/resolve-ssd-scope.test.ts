import { resolveSsdScope } from './resolve-ssd-scope'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { SsdScopeCandidate } from './resolve-ssd-scope.types'
import type { Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	/** The element the consumer names; none: the scope is read from the file. */
	ref?: Scl.Ref<TopologyStructuralTag>
	expected?: Scl.Ref<TopologyStructuralTag> | undefined
	/** The refusal: its key and the units it lists. */
	expectedRefusal?: { key: string; candidates?: SsdScopeCandidate[] }
	/** The units the scope places, and the record ids it leaves out under its root. */
	expectedUnits?: string[]
	expectedLeftOut?: string[]
}

const twoNamedBays = /* xml */ `
	<SCL ${ns} ${id}="scl-1">
		<Substation name="TEMPLATE" ${id}="sub-1">
			<VoltageLevel name="TEMPLATE" ${id}="vl-1">
				<Bay name="B1" ${id}="bay-1"/>
				<Bay name="B2" ${id}="bay-2"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

/** Two bays, the breaker of the second on a node of the first; a third bay of its own, when asked. */
function linkedBays(params: { third: boolean; level?: string }): string {
	const level = params.level ?? 'TEMPLATE'
	const third = params.third
		? `<Bay name="B3" uuid="b3-uuid" ${id}="bay-3"><ConductingEquipment name="QA1" type="CBR" uuid="qa3-uuid" ${id}="equipment-3"/></Bay>`
		: ''
	return /* xml */ `
		<SCL ${ns} ${id}="scl-1">
			<Substation name="TEMPLATE" ${id}="sub-1">
				<VoltageLevel name="${level}" ${id}="vl-1">
					<Bay name="B1" uuid="b1-uuid" ${id}="bay-1">
						<ConnectivityNode name="L1" pathName="TEMPLATE/${level}/B1/L1" uuid="node-uuid" ${id}="node-1"/>
					</Bay>
					<Bay name="B2" uuid="b2-uuid" ${id}="bay-2">
						<ConductingEquipment name="QA1" type="CBR" uuid="qa2-uuid" ${id}="equipment-2">
							<Terminal name="T1" connectivityNode="TEMPLATE/${level}/B1/L1" substationName="TEMPLATE" voltageLevelName="${level}" bayName="B1" cNodeName="L1" cNodeUuid="node-uuid" ${id}="terminal-2"/>
						</ConductingEquipment>
					</Bay>
					${third}
				</VoltageLevel>
			</Substation>
		</SCL>
	`
}

/** Two named substations, a terminal of the second on a node of the first. */
const linkedSubstations = /* xml */ `
	<SCL ${ns} ${id}="scl-1">
		<Substation name="A" uuid="a-uuid" ${id}="sub-a">
			<VoltageLevel name="V1" ${id}="vl-a">
				<Bay name="B1" ${id}="bay-a">
					<ConnectivityNode name="L1" pathName="A/V1/B1/L1" uuid="node-a-uuid" ${id}="node-a"/>
				</Bay>
			</VoltageLevel>
		</Substation>
		<Substation name="B" uuid="b-uuid" ${id}="sub-b">
			<VoltageLevel name="V1" ${id}="vl-b">
				<Bay name="B1" ${id}="bay-b">
					<ConductingEquipment name="QA1" type="CBR" ${id}="equipment-b">
						<Terminal name="T1" connectivityNode="A/V1/B1/L1" substationName="A" voltageLevelName="V1" bayName="B1" cNodeName="L1" cNodeUuid="node-a-uuid" ${id}="terminal-b"/>
					</ConductingEquipment>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

// The scope of an SSD: the element the consumer names when it is named; the TEMPLATE scaffolding,
// named or read from the file, is walked down Substation -> VoltageLevel -> Bay to the first level
// holding a named element - the reusable unit. Several named units there: the consumer chooses.
describe('resolveSsdScope', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'two bays linked by a terminal: one element, rooted at their scaffolding': {
			sourceXml: linkedBays({ third: false }),
			expected: { tagName: 'VoltageLevel', id: 'vl-1' },
			expectedUnits: ['bay-1', 'bay-2'],
			expectedLeftOut: [],
		},
		'… one of them named: the whole group': {
			sourceXml: linkedBays({ third: false }),
			ref: { tagName: 'Bay', id: 'bay-2' },
			expected: { tagName: 'VoltageLevel', id: 'vl-1' },
			expectedUnits: ['bay-1', 'bay-2'],
		},
		'three bays, two linked, none chosen: refused with two candidates': {
			sourceXml: linkedBays({ third: true }),
			expectedRefusal: {
				key: 'SSD_SCOPE_AMBIGUOUS',
				candidates: [
					{
						tagName: 'Bay',
						id: 'bay-1',
						name: 'B1',
						linked: [{ tagName: 'Bay', id: 'bay-2', name: 'B2' }],
					},
					{ tagName: 'Bay', id: 'bay-3', name: 'B3', linked: [] },
				],
			},
		},
		'… one of the linked pair named: the pair, the third bay left out': {
			sourceXml: linkedBays({ third: true }),
			ref: { tagName: 'Bay', id: 'bay-1' },
			expected: { tagName: 'VoltageLevel', id: 'vl-1' },
			expectedUnits: ['bay-1', 'bay-2'],
			expectedLeftOut: ['bay-3', 'equipment-3'],
		},
		"two linked bays and a function of their scaffolding: the function is not the group's": {
			sourceXml: linkedBays({ third: false })
				.replace(
					'</VoltageLevel>',
					`<PowerTransformer name="T1" type="PTR" uuid="own-transformer-uuid" ${id}="own-transformer"/><Function name="Own" uuid="own-uuid" ${id}="own-function"/></VoltageLevel>`,
				)
				.replace(
					'<VoltageLevel name="TEMPLATE" ' + id + '="vl-1">',
					`<VoltageLevel name="TEMPLATE" ${id}="vl-1"><Private type="eIEC61850-6-100" ${id}="vl-private"><eIEC61850-6-100:Application name="Own" type="DCS" uuid="own-application-uuid" ${id}="own-application"><eIEC61850-6-100:FunctionRole name="ROOT" ${id}="own-role"><eIEC61850-6-100:FunctionRoleContent ${id}="own-content"><eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/Own" functionUuid="own-uuid" ${id}="own-ref"/></eIEC61850-6-100:FunctionRoleContent></eIEC61850-6-100:FunctionRole></eIEC61850-6-100:Application></Private>`,
				),
			expected: { tagName: 'VoltageLevel', id: 'vl-1' },
			expectedUnits: ['bay-1', 'bay-2'],
			expectedLeftOut: [
				'own-application',
				'own-content',
				'own-function',
				'own-ref',
				'own-role',
				'own-transformer',
			],
		},
		'two linked bays in a named voltage level, one of them named: it alone': {
			sourceXml: linkedBays({ third: false, level: 'V1' }),
			ref: { tagName: 'Bay', id: 'bay-2' },
			expected: { tagName: 'Bay', id: 'bay-2' },
			expectedUnits: ['bay-2'],
		},
		'a bay linked to a TEMPLATE bay beside it, named: it alone, the scaffolding is no unit': {
			sourceXml: linkedBays({ third: false }).replaceAll('B1', 'TEMPLATE'),
			ref: { tagName: 'Bay', id: 'bay-2' },
			expected: { tagName: 'Bay', id: 'bay-2' },
			expectedUnits: ['bay-2'],
		},
		'two named substations linked by a terminal: no scaffolding holds them, refused each on its own':
			{
				sourceXml: linkedSubstations,
				expectedRefusal: {
					key: 'SSD_SCOPE_AMBIGUOUS',
					candidates: [
						{ tagName: 'Substation', id: 'sub-a', name: 'A', linked: [] },
						{ tagName: 'Substation', id: 'sub-b', name: 'B', linked: [] },
					],
				},
			},
		'… one of them named: it alone': {
			sourceXml: linkedSubstations,
			ref: { tagName: 'Substation', id: 'sub-b' },
			expected: { tagName: 'Substation', id: 'sub-b' },
			expectedUnits: ['sub-b'],
		},
		'… the third bay named: it alone': {
			sourceXml: linkedBays({ third: true }),
			ref: { tagName: 'Bay', id: 'bay-3' },
			expected: { tagName: 'Bay', id: 'bay-3' },
			expectedUnits: ['bay-3'],
		},
		'the first named level below TEMPLATE ancestors (a Bay) is the root': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="TEMPLATE" ${id}="sub-1">
						<VoltageLevel name="TEMPLATE" ${id}="vl-1">
							<Bay name="MyBay" ${id}="bay-1"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expected: { tagName: 'Bay', id: 'bay-1' },
		},

		'a named Substation is itself the root': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="S1" ${id}="sub-1">
						<VoltageLevel name="V1" ${id}="vl-1"/>
					</Substation>
				</SCL>
			`,
			expected: { tagName: 'Substation', id: 'sub-1' },
		},

		'the first named level can be a VoltageLevel': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="TEMPLATE" ${id}="sub-1">
						<VoltageLevel name="V1" ${id}="vl-1">
							<Bay name="B1" ${id}="bay-1"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expected: { tagName: 'VoltageLevel', id: 'vl-1' },
		},

		'an all-TEMPLATE chain resolves to the deepest reached level (Bay)': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="TEMPLATE" ${id}="sub-1">
						<VoltageLevel name="TEMPLATE" ${id}="vl-1">
							<Bay name="TEMPLATE" ${id}="bay-1"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expected: { tagName: 'Bay', id: 'bay-1' },
		},

		'a TEMPLATE Substation with no deeper level is itself the root': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="TEMPLATE" ${id}="sub-1"/>
				</SCL>
			`,
			expected: { tagName: 'Substation', id: 'sub-1' },
		},

		'no Substation -> undefined': {
			sourceXml: /* xml */ `<SCL ${ns} ${id}="scl-1"/>`,
			expected: undefined,
		},
		'two named bays at the first named level, none chosen: refused with both': {
			sourceXml: twoNamedBays,
			expectedRefusal: {
				key: 'SSD_SCOPE_AMBIGUOUS',
				candidates: [
					{ tagName: 'Bay', id: 'bay-1', name: 'B1', linked: [] },
					{ tagName: 'Bay', id: 'bay-2', name: 'B2', linked: [] },
				],
			},
		},

		'two named bays, the TEMPLATE substation named: refused with both': {
			sourceXml: twoNamedBays,
			ref: { tagName: 'Substation', id: 'sub-1' },
			expectedRefusal: {
				key: 'SSD_SCOPE_AMBIGUOUS',
				candidates: [
					{ tagName: 'Bay', id: 'bay-1', name: 'B1', linked: [] },
					{ tagName: 'Bay', id: 'bay-2', name: 'B2', linked: [] },
				],
			},
		},

		'two named bays, the second chosen: it is the scope': {
			sourceXml: twoNamedBays,
			ref: { tagName: 'Bay', id: 'bay-2' },
			expected: { tagName: 'Bay', id: 'bay-2' },
		},

		'a named level chosen above the first named one: it is the scope': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="S1" ${id}="sub-1">
						<VoltageLevel name="V1" ${id}="vl-1">
							<Bay name="B1" ${id}="bay-1"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'VoltageLevel', id: 'vl-1' },
			expected: { tagName: 'VoltageLevel', id: 'vl-1' },
		},

		'the TEMPLATE voltage level chosen: walked down to the one bay it holds': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="TEMPLATE" ${id}="sub-1">
						<VoltageLevel name="TEMPLATE" ${id}="vl-1">
							<Bay name="B1" ${id}="bay-1"/>
						</VoltageLevel>
						<VoltageLevel name="V2" ${id}="vl-2">
							<Bay name="B2" ${id}="bay-2"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'VoltageLevel', id: 'vl-1' },
			expected: { tagName: 'Bay', id: 'bay-1' },
		},

		'a named bay beside a TEMPLATE one: the named bay is the unit': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="TEMPLATE" ${id}="sub-1">
						<VoltageLevel name="TEMPLATE" ${id}="vl-1">
							<Bay name="TEMPLATE" ${id}="bay-1"/>
							<Bay name="B2" ${id}="bay-2"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expected: { tagName: 'Bay', id: 'bay-2' },
		},

		'two named voltage levels beside a TEMPLATE one, none chosen: refused with both': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="scl-1">
					<Substation name="TEMPLATE" ${id}="sub-1">
						<VoltageLevel name="TEMPLATE" ${id}="vl-1">
							<Bay name="B1" ${id}="bay-1"/>
						</VoltageLevel>
						<VoltageLevel name="HV" ${id}="vl-2"/>
						<VoltageLevel name="MV" ${id}="vl-3"/>
					</Substation>
				</SCL>
			`,
			expectedRefusal: {
				key: 'SSD_SCOPE_AMBIGUOUS',
				candidates: [
					{ tagName: 'VoltageLevel', id: 'vl-2', name: 'HV', linked: [] },
					{ tagName: 'VoltageLevel', id: 'vl-3', name: 'MV', linked: [] },
				],
			},
		},

		'an element the file does not hold chosen: refused': {
			sourceXml: twoNamedBays,
			ref: { tagName: 'Bay', id: 'absent' },
			expectedRefusal: { key: 'TEMPLATE_ROOT_NOT_FOUND', candidates: undefined },
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const resolved = resolveSsdScope(source.query, { ref: testCase.ref })
		if (testCase.expectedRefusal) {
			const refusal = toDialecteError(await resolved.catch((error: unknown) => error))
			expect({ key: refusal?.key, candidates: refusal?.meta?.candidates }).toEqual(
				testCase.expectedRefusal,
			)
		} else {
			const scope = await resolved
			expect(scope?.root).toEqual(testCase.expected)
			if (testCase.expectedUnits) {
				expect(scope?.units.map((unit) => unit.id)).toEqual(testCase.expectedUnits)
				expect(scope?.scaffolding).toBe(testCase.expectedUnits.length > 1)
			}
			if (testCase.expectedLeftOut)
				expect([...(scope?.leftOut ?? [])].sort()).toEqual(testCase.expectedLeftOut)
		}
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
