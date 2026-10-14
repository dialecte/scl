import { findConstraintViolation, findViolationInScope } from './find-constraint-violation'
import { resolveUniqueValue } from './resolve-unique-value'

import { describe, expect, test } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { ConstraintViolation } from './find-constraint-violation.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

// A Bay already holding two named Functions (Prot, Prot_1) plus a Private-wrapped
// Application (CB). Bay children must be unique by name (schema constraint
// uniqueChildNameInBay, selector wildcard, fields [name]); Private is transparent,
// so the Application counts as a Bay child for the constraint.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation name="S1" ${id}="sub">
			<VoltageLevel name="V1" ${id}="vl">
				<Bay name="B1" ${id}="bay">
					<Function name="Prot" uuid="p1" ${id}="p1"/>
					<Function name="Prot_1" uuid="p2" ${id}="p2"/>
					<Private type="eIEC61850-6-100" ${id}="priv">
						<eIEC61850-6-100:Application name="CB" uuid="a1" ${id}="a1"/>
					</Private>
				</Bay>
			</VoltageLevel>
		</Substation>
	</SCL>
`

const bayRef = { tagName: 'Bay', id: 'bay' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase

describe('findConstraintViolation + resolveUniqueValue', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'detects a name collision and resolves a unique value (generic over the attribute)': {
			sourceXml,
		},
	}

	async function act({ source }: SclTest.ActParams<TestCase>): Promise<void> {
		const query = source.query

		// collision: a new Function named "Prot" clashes with the existing one
		const violation = await findConstraintViolation(query, {
			parentRef: bayRef,
			childTag: 'Function',
			candidate: { name: 'Prot' },
		})
		expect(violation?.constraint).toBe('uniqueChildNameInBay')
		expect(violation?.fields).toEqual(['name'])
		expect(violation?.offendingId).toBe('p1')

		// no collision: a free name
		expect(
			await findConstraintViolation(query, {
				parentRef: bayRef,
				childTag: 'Function',
				candidate: { name: 'Other' },
			}),
		).toBeNull()

		// Private is transparent: a new Application named "CB" clashes with the
		// Private-wrapped Application already under the Bay
		const privateCollision = await findConstraintViolation(query, {
			parentRef: bayRef,
			childTag: 'Application',
			candidate: { name: 'CB' },
		})
		expect(privateCollision?.offendingId).toBe('a1')

		// resolve: "Prot" and "Prot_1" taken -> "Prot_2"
		expect(
			await resolveUniqueValue(query, {
				parentRef: bayRef,
				childTag: 'Function',
				candidate: { name: 'Prot' },
				attr: 'name',
			}),
		).toBe('Prot_2')

		// resolve: an already-unique candidate is returned unchanged
		expect(
			await resolveUniqueValue(query, {
				parentRef: bayRef,
				childTag: 'Function',
				candidate: { name: 'Fresh' },
				attr: 'name',
			}),
		).toBe('Fresh')

		// resolve: a taken value that already ends with a number gets the next free number, never
		// a second one ("Prot_1" taken -> "Prot_2", not "Prot_1_1")
		expect(
			await resolveUniqueValue(query, {
				parentRef: bayRef,
				childTag: 'Function',
				candidate: { name: 'Prot_1' },
				attr: 'name',
			}),
		).toBe('Prot_2')
	}

	runSclTestCases.withoutExport({ testCases, act })
})

// The same tag declared under different parents carries the uniqueness rules of that declaration:
// a ConductingEquipment of a SubFunction compares its SubEquipment names only (an EqFunction may
// reuse one), a Labels under an AccessPoint has its own rule. A ProcessResources, admitted in a
// Private through its wildcard, keeps the rule of its global declaration.
const declaredUnderParentXml = /* xml */ `
	<SCL ${ns} ${id}="root">
		<Substation name="S1" ${id}="substation">
			<VoltageLevel name="V1" ${id}="voltage-level">
				<Bay name="B1" ${id}="bay">
					<Private type="eIEC61850-6-100" ${id}="bay-private">
						<eIEC61850-6-100:ProcessResources ${id}="process-resources">
							<eIEC61850-6-100:ProcessResource name="R1" ${id}="process-resource"/>
						</eIEC61850-6-100:ProcessResources>
					</Private>
					<Function name="F1" ${id}="function">
						<SubFunction name="SF1" ${id}="sub-function">
							<ConductingEquipment name="CE1" type="CBR" ${id}="equipment">
								<SubEquipment name="A" ${id}="sub-equipment"/>
							</ConductingEquipment>
						</SubFunction>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		<IED name="IED1" ${id}="ied">
			<AccessPoint name="AP1" ${id}="access-point">
				<Labels ${id}="labels">
					<Label id="L1" lang="en" ${id}="label">Main</Label>
					<Label lang="de" ${id}="label-without-id">Haupt</Label>
				</Labels>
			</AccessPoint>
		</IED>
	</SCL>
`

type DeclaredUnderParentTestCase = SclTest.BaseXmlTestCase & {
	/** The parent the child is placed under; or the one `stage` writes in the transaction. */
	parentRef?: Scl.Ref<Scl.ElementsOf>
	stage?: (tx: Scl.Transaction) => Promise<Scl.Ref<Scl.ElementsOf>>
	childTag: string
	candidate: Record<string, string>
	expected: ConstraintViolation | null
}

describe('findConstraintViolation - the rules declared under the parent of the parent', () => {
	const equipmentRef = {
		tagName: 'ConductingEquipment',
		id: 'equipment',
	} as Scl.Ref<Scl.ElementsOf>

	const testCases: SclTest.TestCases<DeclaredUnderParentTestCase> = {
		'a SubEquipment named like another in an equipment of a SubFunction -> the rule declared there':
			{
				sourceXml: declaredUnderParentXml,
				parentRef: equipmentRef,
				childTag: 'SubEquipment',
				candidate: { name: 'A' },
				expected: {
					constraint: 'uniqueSubEquipmentSubFunc',
					fields: ['name'],
					offendingId: 'sub-equipment',
				},
			},
		'an EqFunction named like a SubEquipment there -> free, that rule compares SubEquipment names only':
			{
				sourceXml: declaredUnderParentXml,
				parentRef: equipmentRef,
				childTag: 'EqFunction',
				candidate: { name: 'A' },
				expected: null,
			},
		'a Label repeating id and lang in the Labels of an AccessPoint -> the rule declared under the AccessPoint':
			{
				sourceXml: declaredUnderParentXml,
				parentRef: { tagName: 'Labels', id: 'labels' } as Scl.Ref<Scl.ElementsOf>,
				childTag: 'Label',
				candidate: { id: 'L1', lang: 'en' },
				expected: { constraint: 'uniqueLabelInAP', fields: ['id', 'lang'], offendingId: 'label' },
			},
		'a Label without the id its rule compares, next to one also without it -> free, a key needs every field':
			{
				sourceXml: declaredUnderParentXml,
				parentRef: { tagName: 'Labels', id: 'labels' } as Scl.Ref<Scl.ElementsOf>,
				childTag: 'Label',
				candidate: { lang: 'de' },
				expected: null,
			},
		'a ProcessResource named like another in a ProcessResources of a Private -> the rule of its global declaration':
			{
				sourceXml: declaredUnderParentXml,
				parentRef: {
					tagName: 'ProcessResources',
					id: 'process-resources',
				} as Scl.Ref<Scl.ElementsOf>,
				childTag: 'ProcessResource',
				candidate: { name: 'R1' },
				expected: { constraint: 'uniquePR', fields: ['name'], offendingId: 'process-resource' },
			},
		'an equipment written earlier in the same transaction, under a SubFunction -> the rule declared there':
			{
				sourceXml: declaredUnderParentXml,
				stage: stageEquipmentWithSubEquipment,
				childTag: 'SubEquipment',
				candidate: { name: 'B' },
				expected: {
					constraint: 'uniqueSubEquipmentSubFunc',
					fields: ['name'],
					offendingId: 'staged-sub-equipment-b-1',
				},
			},
	}

	/** A new equipment under the SubFunction, holding a SubEquipment "B", staged, not committed. */
	async function stageEquipmentWithSubEquipment(
		tx: Scl.Transaction,
	): Promise<Scl.Ref<Scl.ElementsOf>> {
		const equipment = await tx.addChild(
			{ tagName: 'SubFunction', id: 'sub-function' } as Scl.Ref<'SubFunction'>,
			{ tagName: 'ConductingEquipment', attributes: { name: 'CE2', type: 'DIS' } },
		)
		await tx.addChild(
			{ tagName: 'ConductingEquipment', id: equipment.id } as Scl.Ref<'ConductingEquipment'>,
			{
				id: 'staged-sub-equipment-b-1',
				tagName: 'SubEquipment',
				attributes: { name: 'B' },
			},
		)
		return { tagName: 'ConductingEquipment', id: equipment.id } as Scl.Ref<Scl.ElementsOf>
	}

	async function act({ testCase, source }: SclTest.ActParams<DeclaredUnderParentTestCase>) {
		const { stage, childTag, candidate, expected } = testCase
		await source.transaction(async (tx) => {
			const parentRef = stage ? await stage(tx) : testCase.parentRef
			if (!parentRef) throw new Error('a case names its parentRef or stages one')
			const violation = await findConstraintViolation(tx, { parentRef, childTag, candidate })
			expect(violation).toEqual(expected)
		})
	}

	runSclTestCases.withoutExport({ testCases, act })
})

describe('findViolationInScope - what a constraint selects and compares', () => {
	const SCL = 'http://www.iec.ch/61850/2003/SCL'
	const child = (tagName: string, uri: string, name: string, id = `${tagName}-${uri}`) =>
		({
			id,
			tagName,
			namespace: { prefix: '', uri },
			attributes: [{ name: 'name', value: name }],
			value: '',
			parent: null,
			children: [],
			tree: [],
		}) as unknown as Core.AnyTreeRecord
	const nested = (parent: Core.AnyTreeRecord, ...tree: Core.AnyTreeRecord[]) =>
		({ ...parent, tree }) as unknown as Core.AnyTreeRecord
	const unique = (
		selector: Core.IdentityConstraint['selector'],
		fields: Core.IdentityConstraint['fields'] = [
			[{ steps: [], attribute: { name: 'name', namespace: '' } }],
		],
	): Core.IdentityConstraint => ({ kind: 'unique', name: 'u', namespace: SCL, selector, fields })
	const bayStep = { name: 'Bay', namespace: SCL }

	const testCases: Record<
		string,
		{ constraint: Core.IdentityConstraint; children: Core.AnyTreeRecord[]; collides: boolean }
	> = {
		'a sibling of the same name in the namespace the selector names -> a collision': {
			constraint: unique([{ steps: [bayStep] }]),
			children: [child('Bay', SCL, 'B1')],
			collides: true,
		},
		'a selector reaching every descendant (.//) -> document-wide, left to validation: no collision':
			{
				constraint: unique([{ deep: true, steps: [bayStep] }]),
				children: [
					child('Bay', SCL, 'B1'),
					nested(child('VoltageLevel', SCL, 'V1'), child('Bay', SCL, 'B1', 'deep-bay')),
				],
				collides: false,
			},
		'a descendant of the same name, the selector reaching children only -> no collision': {
			constraint: unique([{ steps: [bayStep] }]),
			children: [nested(child('VoltageLevel', SCL, 'V1'), child('Bay', SCL, 'B1', 'deep-bay'))],
			collides: false,
		},
		'a sibling of the same name in another namespace -> not selected, no collision': {
			constraint: unique([{ steps: [bayStep] }]),
			children: [child('Bay', 'urn:other', 'B1')],
			collides: false,
		},
		'a selector two steps deep, its first naming the child -> selects no direct child, no collision':
			{
				constraint: unique([{ steps: [bayStep, { name: 'Function', namespace: SCL }] }]),
				children: [child('Bay', SCL, 'B1')],
				collides: false,
			},
		'a field reading an attribute of another namespace -> not compared, no collision': {
			constraint: unique(
				[{ steps: [bayStep] }],
				[[{ steps: [], attribute: { name: 'name', namespace: 'urn:other' } }]],
			),
			children: [child('Bay', SCL, 'B1')],
			collides: false,
		},
		'a field reading the text of a child -> not compared, no collision': {
			constraint: unique([{ steps: [bayStep] }], [[{ steps: [{ name: 'name', namespace: SCL }] }]]),
			children: [child('Bay', SCL, 'B1')],
			collides: false,
		},
	}

	for (const [name, { constraint, children, collides }] of Object.entries(testCases)) {
		test(name, () => {
			const violation = findViolationInScope({
				scope: { constraints: [constraint], children },
				candidate: { name: 'B1' },
			})
			expect(violation !== null).toBe(collides)
		})
	}
})
