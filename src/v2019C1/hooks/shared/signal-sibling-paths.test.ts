import { describe } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Config } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test/hydrated-test.types'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/**
 * A signal's name depends on its siblings: adding, changing or removing a
 * SourceRef renames the references to the SourceRefs that share its input.
 */
describe('signal names follow their siblings', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		act: (document: Core.Document<Config>) => Promise<void>
	}

	function lnodeWith(sourceRefs: string): string {
		return /* xml */ `
			<SCL ${ns} ${id}="root">
				<Substation name="S1" ${id}="s1">
					<Function name="F1" ${id}="f1">
						<LNode lnClass="PTRC" lnInst="1" iedName="None" ${id}="owner">
							<eIEC61850-6-100:LNodeInputs ${id}="inputs">${sourceRefs}</eIEC61850-6-100:LNodeInputs>
							<eIEC61850-6-100:BehaviorDescription name="BD1" ${id}="bd1">
								<eIEC61850-6-100:InputVar varName="v" inputName="NAME" inputUuid="uuid-first" ${id}="var"/>
							</eIEC61850-6-100:BehaviorDescription>
						</LNode>
					</Function>
				</Substation>
			</SCL>
		`
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'a second Trip input added → the first one is named "Trip(1)"': {
			sourceXml: lnodeWith(
				`<eIEC61850-6-100:SourceRef input="Trip" uuid="uuid-first" ${id}="first"/>`,
			).replace('NAME', 'Trip'),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.addChild(
						{ tagName: 'LNodeInputs', id: 'inputs' },
						{ tagName: 'SourceRef', attributes: { input: 'Trip', inputInst: '2' } },
					)
				})
			},
			expectedQueries: ['//v2019C1:InputVar[@inputUuid="uuid-first" and @inputName="Trip(1)"]'],
		},
		'the second Trip input removed → the first one is named "Trip" again': {
			sourceXml: lnodeWith(
				`<eIEC61850-6-100:SourceRef input="Trip" uuid="uuid-first" ${id}="first"/>
				<eIEC61850-6-100:SourceRef input="Trip" inputInst="2" ${id}="second"/>`,
			).replace('NAME', 'Trip(1)'),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.delete({ tagName: 'SourceRef', id: 'second' })
				})
			},
			expectedQueries: ['//v2019C1:InputVar[@inputUuid="uuid-first" and @inputName="Trip"]'],
		},
		'the second Trip input renamed Block → the first one is named "Trip" again': {
			sourceXml: lnodeWith(
				`<eIEC61850-6-100:SourceRef input="Trip" uuid="uuid-first" ${id}="first"/>
				<eIEC61850-6-100:SourceRef input="Trip" inputInst="2" ${id}="second"/>`,
			).replace('NAME', 'Trip(1)'),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update(
						{ tagName: 'SourceRef', id: 'second' },
						{ attributes: { input: 'Block' } },
					)
				})
			},
			expectedQueries: ['//v2019C1:InputVar[@inputUuid="uuid-first" and @inputName="Trip"]'],
		},
		'another input renamed Trip → the first one is named "Trip(1)"': {
			sourceXml: lnodeWith(
				`<eIEC61850-6-100:SourceRef input="Trip" uuid="uuid-first" ${id}="first"/>
				<eIEC61850-6-100:SourceRef input="Block" inputInst="2" ${id}="second"/>`,
			).replace('NAME', 'Trip'),
			act: async (document) => {
				await document.transaction(async (tx) => {
					await tx.update({ tagName: 'SourceRef', id: 'second' }, { attributes: { input: 'Trip' } })
				})
			},
			expectedQueries: ['//v2019C1:InputVar[@inputUuid="uuid-first" and @inputName="Trip(1)"]'],
		},
	}

	runSclTestCases.withExport({
		testCases,
		act: async ({ source, testCase }) => {
			await testCase.act(source)
			return { assertOn: 'source' }
		},
	})
})
