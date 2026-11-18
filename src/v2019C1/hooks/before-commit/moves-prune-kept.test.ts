import fourFunctions from './fixtures/four-functions-with-resources-and-a-behaviour.xml?raw'

import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const PR1 = { tagName: 'ProcessResource', id: 'pr1' } as Scl.Ref<Scl.ElementsOf>
const F2_RESOURCES = { tagName: 'ProcessResources', id: 'f2-resources' } as Scl.Ref<Scl.ElementsOf>

describe('a container a move empties and the transaction deletes is deleted once', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		// PR1 leaves F1's resources, which the transaction then deletes itself
		'PR1 moved to F2, then the emptied resources of F1 deleted → committed, F1 holds no Private': {
			sourceXml: fourFunctions,
			expectedQueries: ['//default:Function[@name="F2"]//v2019C1:ProcessResource[@name="PR1"]'],
			unexpectedQueries: ['//default:Function[@name="F1"]/default:Private'],
		},
	}

	async function act({
		source,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function moveThenDeleteTheOldParent(tx) {
			await tx.any.move(PR1, { parent: F2_RESOURCES })
			await tx.any.delete({ tagName: 'ProcessResources', id: 'f1-resources' })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('a container a delete of its last child keeps is kept after a move of it', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		// F1 is all B1 holds; a bay emptied by a delete stays
		'the only function of B1 moved to B2 → B1 kept, empty': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="s1" name="S1">
						<VoltageLevel ${id}="vl1" name="VL1">
							<Bay ${id}="b1" name="B1">
								<Function ${id}="f1" name="F1" uuid="f1" />
							</Bay>
							<Bay ${id}="b2" name="B2" />
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expectedQueries: [
				'//default:VoltageLevel[default:Bay[@name="B1"][not(*)]]/default:Bay[@name="B2"]/default:Function[@name="F1"]',
			],
		},
	}

	async function act({
		source,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function moveTheOnlyFunction(tx) {
			await tx.any.move({ tagName: 'Function', id: 'f1' }, { parent: { tagName: 'Bay', id: 'b2' } })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('a container a move empties is judged when the moved element is deleted afterwards', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		// PR1 leaves F1's resources for F2's, then the transaction deletes it: F1's resources lost their only child
		'PR1 moved to the resources of F2, then deleted → the resources of F1 and their Private go, F2 keeps PR2':
			{
				sourceXml: fourFunctions,
				expectedQueries: [
					'//default:Function[@name="F2"]//v2019C1:ProcessResources[v2019C1:ProcessResource[@name="PR2"]][count(*)=1]',
				],
				unexpectedQueries: [
					'//default:Function[@name="F1"]/default:Private',
					'//v2019C1:ProcessResource[@name="PR1"]',
				],
			},
	}

	async function act({
		source,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function moveThenDelete(tx) {
			await tx.any.move(PR1, { parent: F2_RESOURCES })
			await tx.any.delete(PR1)
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('a container a move leaves holding nothing goes', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		// PR1 is the only thing F1's resources and their Private wrapper hold
		'PR1 moved to the resources of F2 → the resources of F1 and their wrapper go': {
			sourceXml: fourFunctions,
			expectedQueries: [
				'//default:Function[@name="F2"]//v2019C1:ProcessResources[v2019C1:ProcessResource[@name="PR1"]][v2019C1:ProcessResource[@name="PR2"]]',
			],
			unexpectedQueries: [
				'//default:Function[@name="F1"]/default:Private',
				'//default:Function[@name="F1"]//v2019C1:ProcessResources',
			],
		},
	}

	async function act({
		source,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function moveTheOnlyResource(tx) {
			await tx.any.move(PR1, { parent: F2_RESOURCES })
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})

describe('a container a move leaves without the last child its schema requires goes, as after a delete', () => {
	const testCases: SclTest.TestCases<SclTest.BaseXmlTestCase> = {
		// C1 holds a Text and its only function reference ref1; C2 holds ref2
		'the only function reference of C1 moved to C2 → C1 goes with its Text': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root">
					<Substation ${id}="s1" name="S1">
						<VoltageLevel ${id}="vl1" name="VL1">
							<Bay ${id}="b1" name="B1">
								<Private ${id}="b1-private" type="eIEC61850-6-100">
									<eIEC61850-6-100:FunctionCategory ${id}="c1" name="C1" uuid="c1">
										<eIEC61850-6-100:Text ${id}="c1-text">protection</eIEC61850-6-100:Text>
										<eIEC61850-6-100:FunctionCatRef ${id}="ref1" function="S1/VL1/B1/F1" functionUuid="f1" />
									</eIEC61850-6-100:FunctionCategory>
									<eIEC61850-6-100:FunctionCategory ${id}="c2" name="C2" uuid="c2">
										<eIEC61850-6-100:FunctionCatRef ${id}="ref2" function="S1/VL1/B1/F2" functionUuid="f2" />
									</eIEC61850-6-100:FunctionCategory>
								</Private>
								<Function ${id}="f1" name="F1" uuid="f1" />
								<Function ${id}="f2" name="F2" uuid="f2" />
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			expectedQueries: [
				'//v2019C1:FunctionCategory[@name="C2"][v2019C1:FunctionCatRef[@functionUuid="f1"]][v2019C1:FunctionCatRef[@functionUuid="f2"]]',
			],
			unexpectedQueries: ['//v2019C1:FunctionCategory[@name="C1"]', '//v2019C1:Text'],
		},
	}

	async function act({
		source,
	}: SclTest.ActParams<SclTest.BaseXmlTestCase>): Promise<SclTest.ActResult> {
		await source.transaction(async function moveTheOnlyReference(tx) {
			await tx.any.move(
				{ tagName: 'FunctionCatRef', id: 'ref1' },
				{
					parent: { tagName: 'FunctionCategory', id: 'c2' },
				},
			)
		})
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
