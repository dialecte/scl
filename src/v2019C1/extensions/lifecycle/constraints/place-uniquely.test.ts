import { placeUniquely } from './place-uniquely'

import { toDialecteError } from '@dialecte/core'
import { describe, expect } from 'vitest'

import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

/** A bay holding `content`, under a substation whose Private holds applications of `applicationNames`. */
function bayWith(params: { content: string; applicationNames?: [string, string] }): string {
	const { content, applicationNames = ['HMI_App', 'HMI_Other'] } = params
	return /* xml */ `
		<SCL ${ns} ${id}="root">
			<Substation name="S1" ${id}="substation">
				<Private type="eIEC61850-6-100" ${id}="private">
					<eIEC61850-6-100:Application name="${applicationNames[0]}" uuid="application-0" ${id}="application-0"/>
					<eIEC61850-6-100:Application name="${applicationNames[1]}" uuid="application-1" ${id}="application-1"/>
				</Private>
				<VoltageLevel name="V1" ${id}="voltage-level">
					<Bay name="B1" ${id}="bay">
						${content}
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
}

function breaker(suffix: string): string {
	return `<LNode iedName="None" ldInst="LD1" prefix="QA" lnClass="XCBR" lnInst="1" uuid="breaker-${suffix}" ${id}="breaker-${suffix}"/>`
}

type TestCase = SclTest.BaseXmlTestCase & {
	/** The element placed. */
	ref: Scl.Ref<Scl.ElementsOf>
	/** The refusal, as its key and data: absent when the element is placed. */
	expectedRefusal?: { key: string; meta: Record<string, unknown> }
}

describe('placeUniquely — an element placed is told apart from its siblings, or refused', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a function named like another of its bay -> numbered': {
			allowInvalidFixture: {
				reason: 'two functions of one bay share a name: the number the second gets',
				violations: [{ check: 'uniqueness', code: 'uniqueChildNameInBay' }],
			},
			sourceXml: bayWith({
				content: `<Function name="Prot" uuid="function-0" ${id}="function-0"/><Function name="Prot" uuid="function-1" ${id}="function-1"/>`,
			}),
			ref: { tagName: 'Function', id: 'function-1' } as Scl.Ref<Scl.ElementsOf>,
			expectedQueries: [
				'//default:Bay/default:Function[@name="Prot"]',
				'//default:Bay/default:Function[@name="Prot_1"]',
			],
		},
		'an application named like another, both in the Private the rule looks through -> numbered': {
			allowInvalidFixture: {
				reason: 'two applications of one substation share a name: the number the second gets',
				violations: [{ check: 'uniqueness', code: 'uniqueChildNameInSubstation' }],
			},
			sourceXml: bayWith({ content: '', applicationNames: ['HMI_App', 'HMI_App'] }),
			ref: { tagName: 'Application', id: 'application-1' } as Scl.Ref<Scl.ElementsOf>,
			expectedQueries: ['//v2019C1:Application[@name="HMI_App_1"]'],
		},
		'a logical node sharing every field of its key with another of its function -> refused, nothing numbered':
			{
				allowInvalidFixture: {
					reason:
						'two logical nodes of one function share their whole key: the refusal the placement gives',
					violations: [{ check: 'uniqueness', code: 'uniqueLNodeInFunctionB' }],
				},
				sourceXml: bayWith({
					content: `<Function name="Prot" uuid="function-0" ${id}="function-0">${breaker('0')}${breaker('1')}</Function>`,
				}),
				ref: { tagName: 'LNode', id: 'breaker-1' } as Scl.Ref<Scl.ElementsOf>,
				expectedRefusal: {
					key: 'IDENTITY_COLLISION',
					meta: {
						constraint: 'uniqueLNodeInFunctionB',
						fields: expect.arrayContaining(['prefix', 'lnClass', 'lnInst', 'ldInst', 'iedName']),
						element: { tagName: 'LNode', id: 'breaker-1' },
						collidesWith: { tagName: 'LNode', id: 'breaker-0' },
					},
				},
				expectedQueries: ['//default:Function/default:LNode[@uuid="breaker-1"][@lnInst="1"]'],
			},
		'a logical node free in its function -> left as it is': {
			sourceXml: bayWith({
				content: `<Function name="Prot" uuid="function-0" ${id}="function-0">${breaker('0')}${breaker('1').replace('lnInst="1"', 'lnInst="2"')}</Function>`,
			}),
			ref: { tagName: 'LNode', id: 'breaker-1' } as Scl.Ref<Scl.ElementsOf>,
			expectedQueries: ['//default:Function/default:LNode[@uuid="breaker-1"][@lnInst="2"]'],
		},
	}

	async function act({
		testCase,
		source,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		const placed = source.transaction(async function place(tx) {
			await placeUniquely(tx, { ref: testCase.ref })
		})
		if (!testCase.expectedRefusal) {
			await placed
			return { assertOn: 'source' }
		}
		const caught = await placed.catch((error: unknown) => error)
		const refusal = toDialecteError(caught)
		expect({ key: refusal?.key, meta: refusal?.meta }).toEqual(testCase.expectedRefusal)
		return { assertOn: 'source' }
	}

	runSclTestCases.withExport({ testCases, act })
})
