import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

type TestCase = SclTest.BaseXmlTestCase & {
	/** The elements deleted, in one transaction. */
	deleted: Scl.Ref<Scl.ElementsOf>[]
}

/** A function whose wrapper holds `content`, a breaker, and an application referring to the first relation. */
function relationsXml(content: string, params: { relationReference?: boolean } = {}): string {
	const { relationReference = true } = params
	const reference = relationReference
		? `<eIEC61850-6-100:PowerSystemRelationRef ${id}="relation-ref" powerSystemRelation="S1/F1/PSR1" powerSystemRelationUuid="uuid-psr1" />`
		: ''
	return /* xml */ `
		<SCL ${ns} ${id}="root">
			<Substation ${id}="substation" name="S1">
				<Private ${id}="substation-private" type="eIEC61850-6-100">
					<eIEC61850-6-100:Application ${id}="application" name="A1" uuid="uuid-application">
						<eIEC61850-6-100:FunctionRole ${id}="role" name="R1">
							<eIEC61850-6-100:FunctionRoleContent ${id}="content">
								<eIEC61850-6-100:FunctionRef function="S1/F2" functionUuid="uuid-f2" />
								${reference}
							</eIEC61850-6-100:FunctionRoleContent>
						</eIEC61850-6-100:FunctionRole>
					</eIEC61850-6-100:Application>
				</Private>
				<VoltageLevel ${id}="voltage-level" name="V1">
					<Bay ${id}="bay" name="B1">
						<ConductingEquipment ${id}="equipment" name="CB1" type="CBR" uuid="uuid-equipment" />
					</Bay>
				</VoltageLevel>
				<Function ${id}="function" name="F1" uuid="uuid-f1">
					<Private ${id}="private" type="eIEC61850-6-100">
						${content}
					</Private>
				</Function>
				<Function ${id}="other-function" name="F2" uuid="uuid-f2">
					<Private ${id}="other-private" type="eIEC61850-6-100"/>
				</Function>
			</Substation>
		</SCL>
	`
}

const oneRelation = /* xml */ `
	<eIEC61850-6-100:PowerSystemRelations ${id}="relations">
		<eIEC61850-6-100:PowerSystemRelation ${id}="psr1" name="PSR1" uuid="uuid-psr1" relation="S1/V1/B1/CB1" relationUuid="uuid-equipment" />
	</eIEC61850-6-100:PowerSystemRelations>
`

const twoRelations = /* xml */ `
	<eIEC61850-6-100:PowerSystemRelations ${id}="relations">
		<eIEC61850-6-100:PowerSystemRelation ${id}="psr1" name="PSR1" uuid="uuid-psr1" relation="S1/V1/B1/CB1" relationUuid="uuid-equipment" />
		<eIEC61850-6-100:PowerSystemRelation ${id}="psr2" name="PSR2" uuid="uuid-psr2" relation="S1/V1/B1/CB1" relationUuid="uuid-equipment" />
	</eIEC61850-6-100:PowerSystemRelations>
`

const RELATION_1 = { tagName: 'PowerSystemRelation', id: 'psr1' } as const
const RELATION_2 = { tagName: 'PowerSystemRelation', id: 'psr2' } as const

// What a transaction leaves holding nothing goes at its commit when it has no reason to stay: a wrapper with no
// child and no text, an element whose definition needs a child it no longer holds — whoever wrote.
describe('the commit removes the containers a transaction left holding nothing', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'the only relation deleted → its list and the wrapper go, the reference to it too': {
			sourceXml: relationsXml(oneRelation),
			deleted: [RELATION_1],
			expectedQueries: ['//default:Function[@name="F1"]'],
			unexpectedQueries: [
				'//v2019C1:PowerSystemRelations',
				'//default:Function[@name="F1"]/default:Private',
				'//v2019C1:PowerSystemRelationRef',
			],
		},
		'one of two relations deleted → the list and the other stay': {
			sourceXml: relationsXml(twoRelations),
			deleted: [RELATION_2],
			expectedQueries: ['//v2019C1:PowerSystemRelations/v2019C1:PowerSystemRelation[@name="PSR1"]'],
			unexpectedQueries: ['//v2019C1:PowerSystemRelation[@name="PSR2"]'],
		},
		'both relations deleted in one transaction → the list and the wrapper go': {
			sourceXml: relationsXml(twoRelations),
			deleted: [RELATION_1, RELATION_2],
			expectedQueries: ['//default:Function[@name="F1"]'],
			unexpectedQueries: [
				'//v2019C1:PowerSystemRelations',
				'//default:Function[@name="F1"]/default:Private',
			],
		},
		'the wrapper holds something else → the list goes, the wrapper stays': {
			sourceXml: relationsXml(`
				${oneRelation}
				<eIEC61850-6-100:ProcessResources ${id}="resources">
					<eIEC61850-6-100:ProcessResource ${id}="resource" name="R1" />
				</eIEC61850-6-100:ProcessResources>
			`),
			deleted: [RELATION_1],
			expectedQueries: ['//default:Function[@name="F1"]/default:Private/v2019C1:ProcessResources'],
			unexpectedQueries: ['//v2019C1:PowerSystemRelations'],
		},
		'the equipment a relation names deleted → the relation, its list and the wrapper go': {
			sourceXml: relationsXml(oneRelation),
			deleted: [{ tagName: 'ConductingEquipment', id: 'equipment' }],
			expectedQueries: ['//default:Function[@name="F1"]'],
			unexpectedQueries: [
				'//v2019C1:PowerSystemRelations',
				'//default:Function[@name="F1"]/default:Private',
			],
		},
		'the function holding them deleted → everything below goes, without error': {
			sourceXml: relationsXml(oneRelation),
			deleted: [{ tagName: 'Function', id: 'function' }],
			unexpectedQueries: ['//v2019C1:PowerSystemRelations', '//default:Function[@name="F1"]'],
		},
		'the wrapper deleted → without error': {
			sourceXml: relationsXml(oneRelation),
			deleted: [{ tagName: 'Private', id: 'private' }],
			expectedQueries: ['//default:Function[@name="F1"]'],
			unexpectedQueries: ['//v2019C1:PowerSystemRelations'],
		},
		'an empty wrapper the transaction did not touch stays': {
			sourceXml: relationsXml(oneRelation),
			deleted: [RELATION_1],
			expectedQueries: ['//default:Function[@name="F2"]/default:Private'],
			unexpectedQueries: ['//default:Function[@name="F1"]/default:Private'],
		},
		'the last reference of a category deleted → the category and its wrapper go, and the reference to the category':
			{
				sourceXml: relationsXml(
					`<eIEC61850-6-100:FunctionCategory ${id}="category" name="C1" uuid="uuid-category">
						<eIEC61850-6-100:FunctionCatRef ${id}="category-ref" function="S1/F2" functionUuid="uuid-f2" />
					</eIEC61850-6-100:FunctionCategory>`,
					{ relationReference: false },
				).replace(
					'<eIEC61850-6-100:FunctionRef function="S1/F2" functionUuid="uuid-f2" />',
					'<eIEC61850-6-100:FunctionRef function="S1/F2" functionUuid="uuid-f2" /><eIEC61850-6-100:FunctionCategoryRef functionCategory="S1/F1/C1" functionCategoryUuid="uuid-category" />',
				),
				deleted: [{ tagName: 'FunctionCatRef', id: 'category-ref' }],
				expectedQueries: ['//v2019C1:FunctionRef[@functionUuid="uuid-f2"]'],
				unexpectedQueries: [
					'//v2019C1:FunctionCategory',
					'//v2019C1:FunctionCategoryRef',
					'//default:Function[@name="F1"]/default:Private',
				],
			},
		'the last process resource deleted → the list and the wrapper go': {
			sourceXml: relationsXml(
				`
				<eIEC61850-6-100:ProcessResources ${id}="resources">
					<eIEC61850-6-100:ProcessResource ${id}="resource" name="R1" />
				</eIEC61850-6-100:ProcessResources>
				`,
				{ relationReference: false },
			),
			deleted: [{ tagName: 'ProcessResource', id: 'resource' }],
			expectedQueries: ['//default:Function[@name="F1"]'],
			unexpectedQueries: [
				'//v2019C1:ProcessResources',
				'//default:Function[@name="F1"]/default:Private',
			],
		},
	}

	runSclTestCases.withExport({ testCases, act: deleteInOneTransaction })
})

async function deleteInOneTransaction({
	testCase,
	source,
}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
	await source.transaction(async function deleteEach(tx) {
		for (const ref of testCase.deleted) await tx.delete(ref)
	})
	return { assertOn: 'source' }
}
