import { readAttribute, readAttributes } from './read-attributes'

import { describe, expect } from 'vitest'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestRecord,
	runSclTestCases,
} from '@/v2019C1/test'

import type { ReadAttributeParams, SclReadAttributesBaseParams } from './read-attributes.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const NAMESPACED_REVISION = 'eIEC61850-6-100:revision'

const storedLNode = createSclTestRecord({
	record: {
		tagName: 'LNode',
		attributes: { lnClass: 'XCBR', lnInst: '1' },
		parent: { tagName: 'Bay', id: 'bay' },
	},
})
/** An LNode with `prefix` written empty: the factory leaves an empty value out. */
const lnode = {
	...storedLNode,
	attributes: [...storedLNode.attributes, { name: 'prefix', value: '' }],
}
const emptyRoot = createSclTestRecord({ record: { tagName: 'SCL' } })
/** The SCL root with the 6-100 revision written: the factory types its attributes by local name. */
const root = {
	...emptyRoot,
	attributes: [
		{
			name: NAMESPACED_REVISION,
			value: 'C',
			namespace: SCL_DIALECTE_CONFIG.namespaces.v2019C1,
		},
	],
}

describe('readAttribute', () => {
	type TestCase = SclTest.BaseTestCase & {
		params: ReadAttributeParams & { fullObject?: false }
		expected: string | undefined
	}

	const testCases: Record<string, TestCase> = {
		'stored attribute → its value': {
			params: { record: lnode, name: 'lnClass' },
			expected: 'XCBR',
		},
		'attribute stored empty → empty': {
			params: { record: lnode, name: 'prefix' },
			expected: '',
		},
		'absent attribute with a schema default → the default': {
			params: { record: lnode, name: 'iedName' },
			expected: 'None',
		},
		'absent attribute with a schema default, defaults none → empty': {
			params: { record: lnode, name: 'iedName', defaults: 'none' },
			expected: '',
		},
		'absent optional attribute with a schema default, defaults required → empty': {
			params: { record: lnode, name: 'iedName', defaults: 'required' },
			expected: '',
		},
		'absent fixed attribute, defaults required → the fixed value': {
			params: { record: root, name: 'eIEC61850-6-100:version', defaults: 'required' },
			expected: '2019',
		},
		'absent attribute without a schema value → empty': {
			params: { record: lnode, name: 'ldInst' },
			expected: '',
		},
		'namespaced attribute in its namespace scope → its value': {
			params: { record: root, name: 'revision', namespace: 'v2019C1' },
			expected: 'C',
		},
		'namespaced attribute by the name it is stored by → its value': {
			params: { record: root, name: NAMESPACED_REVISION },
			expected: 'C',
		},
	}

	runSclTestCases.generic(testCases, (testCase) => {
		expect(readAttribute(testCase.params)).toBe(testCase.expected)
	})
})

describe('readAttribute, full object', () => {
	type TestCase = SclTest.BaseTestCase & {
		name: string
		defaults?: SclReadAttributesBaseParams['defaults']
		expected: string | undefined
	}

	const testCases: Record<string, TestCase> = {
		'attribute stored empty, defaults none → its object, empty': {
			name: 'prefix',
			defaults: 'none',
			expected: '',
		},
		'absent attribute with a schema default, defaults none → undefined': {
			name: 'iedName',
			defaults: 'none',
			expected: undefined,
		},
		'absent attribute with a schema default → the default object': {
			name: 'iedName',
			expected: 'None',
		},
		'absent attribute without a schema value → undefined': {
			name: 'ldInst',
			expected: undefined,
		},
	}

	runSclTestCases.generic(testCases, (testCase) => {
		const { name, defaults, expected } = testCase
		expect(readAttribute({ record: lnode, name, defaults, fullObject: true })?.value).toBe(expected)
	})
})

describe('readAttributes', () => {
	type TestCase = SclTest.BaseTestCase & {
		defaults?: SclReadAttributesBaseParams['defaults']
		expected: Record<string, string>
	}

	const testCases: Record<string, TestCase> = {
		'defaults none → the stored attributes only': {
			defaults: 'none',
			expected: { lnClass: 'XCBR', lnInst: '1', prefix: '' },
		},
		'default view → the stored attributes and the schema defaults of the absent ones': {
			expected: { lnClass: 'XCBR', lnInst: '1', prefix: '', iedName: 'None' },
		},
	}

	runSclTestCases.generic(testCases, (testCase) => {
		const attributes = readAttributes({ record: lnode, defaults: testCase.defaults })
		expect(attributes).toMatchObject(testCase.expected)
		if (testCase.defaults === 'none')
			expect(Object.keys(attributes).sort()).toEqual(Object.keys(testCase.expected).sort())
	})
})

describe('readAttribute(s) read as the query reads', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		ref: Scl.Ref<Scl.ElementsOf>
		names: readonly { name: string; namespace?: string }[]
	}

	const id = CUSTOM_RECORD_ID_ATTRIBUTE
	const sourceXml = /* xml */ `
		<SCL ${ALL_XMLNS_NAMESPACES} ${NAMESPACED_REVISION}="C" ${id}="root">
			<Substation name="S1" ${id}="substation">
				<VoltageLevel name="V1" ${id}="voltage-level">
					<Bay name="B1" ${id}="bay">
						<LNode lnClass="XCBR" lnInst="1" prefix="" ${id}="lnode"/>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`

	const testCases: SclTest.TestCases<TestCase> = {
		'LNode: stored, stored empty, absent with a schema default, absent without → as the query reads':
			{
				sourceXml,
				ref: { tagName: 'LNode', id: 'lnode' },
				names: [{ name: 'lnClass' }, { name: 'prefix' }, { name: 'iedName' }, { name: 'ldInst' }],
			},
		'SCL: namespaced stored, namespaced fixed absent → as the query reads': {
			sourceXml,
			ref: { tagName: 'SCL', id: 'root' },
			names: [
				{ name: NAMESPACED_REVISION },
				{ name: 'revision', namespace: 'v2019C1' },
				{ name: 'version', namespace: 'v2019C1' },
			],
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const record = await source.query.getRecord(testCase.ref)
			expect(record).toBeDefined()
			if (!record) return
			for (const { name, namespace } of testCase.names) {
				const expected = await source.query.any.getAttribute(record, { name, namespace })
				expect(readAttribute({ record, name, namespace })).toBe(expected)
			}
			const expectedAttributes = await source.query.any.getAttributes(record)
			expect(readAttributes({ record })).toEqual(expectedAttributes)
		},
	})
})
