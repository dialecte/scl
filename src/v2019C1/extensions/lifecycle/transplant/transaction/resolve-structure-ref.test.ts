import { cloneTree } from './primitives/clone-tree'
import { createAncestryResolver, resolveStructureRef } from './resolve-structure-ref'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
	runSclTestCases,
} from '@/v2019C1/test'

import type { TargetStructure } from './structure.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'
import type * as Core from '@dialecte/core'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

async function buildTemplateStructure(tx: Core.Transaction<Config>) {
	const root = await tx.getRoot()
	const substation = await tx.ensureChild(root, {
		tagName: 'Substation',
		attributes: { name: 'TEMPLATE' },
	})
	const voltageLevel = await tx.ensureChild(substation, {
		tagName: 'VoltageLevel',
		attributes: { name: 'TEMPLATE' },
	})
	const bay = await tx.ensureChild(voltageLevel, {
		tagName: 'Bay',
		attributes: { name: 'TEMPLATE' },
	})
	return { Substation: substation, VoltageLevel: voltageLevel, Bay: bay }
}

describe('resolveStructureRef', () => {
	type TestCase = SclTest.BaseXmlTestCase & {
		ref: Scl.Ref<Scl.ElementsOf>
		expectedTagName: 'Substation' | 'VoltageLevel' | 'Bay'
	}

	const testCases: SclTest.TestCases<TestCase> = {
		'Function under Substation → resolves to Substation': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
					<Substation ${id}="sub1" name="TEMPLATE" uuid="sub-uuid">
						<VoltageLevel ${id}="vl1" name="TEMPLATE" uuid="vl-uuid">
							<Bay ${id}="bay1" name="TEMPLATE" uuid="bay-uuid"/>
						</VoltageLevel>
						<Function ${id}="func1" name="HMI Function" uuid="func-uuid"/>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'Function', id: 'func1' } as Scl.Ref<'Function'>,
			expectedTagName: 'Substation',
		},
		'Function under Bay → resolves to Bay': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
					<Substation ${id}="sub1" name="TEMPLATE" uuid="sub-uuid">
						<VoltageLevel ${id}="vl1" name="TEMPLATE" uuid="vl-uuid">
							<Bay ${id}="bay1" name="TEMPLATE" uuid="bay-uuid">
								<Function ${id}="func1" name="CB Function" uuid="func-uuid"/>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'Function', id: 'func1' } as Scl.Ref<'Function'>,
			expectedTagName: 'Bay',
		},
		'FunctionCategory under Substation Private → resolves to Substation': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
					<Substation ${id}="sub1" name="TEMPLATE" uuid="sub-uuid">
						<Private ${id}="priv1" type="eIEC61850-6-100">
							<eIEC61850-6-100:FunctionCategory ${id}="fcat1" name="PROTECTION" uuid="fcat-uuid"/>
						</Private>
						<VoltageLevel ${id}="vl1" name="TEMPLATE" uuid="vl-uuid">
							<Bay ${id}="bay1" name="TEMPLATE" uuid="bay-uuid"/>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'FunctionCategory', id: 'fcat1' } as Scl.Ref<'FunctionCategory'>,
			expectedTagName: 'Substation',
		},
		'Application under Bay Private → resolves to Bay': {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root" version="2007" revision="C" release="5">
					<Substation ${id}="sub1" name="TEMPLATE" uuid="sub-uuid">
						<VoltageLevel ${id}="vl1" name="TEMPLATE" uuid="vl-uuid">
							<Bay ${id}="bay1" name="TEMPLATE" uuid="bay-uuid">
								<Private ${id}="priv1" type="eIEC61850-6-100">
									<eIEC61850-6-100:Application ${id}="app1" name="CB" uuid="app-uuid" type="HV_interface"/>
								</Private>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			ref: { tagName: 'Application', id: 'app1' } as Scl.Ref<'Application'>,
			expectedTagName: 'Bay',
		},
	}

	runSclTestCases.withoutExport<TestCase>({
		testCases,
		act: async ({ source, testCase }) => {
			const structure = await source.transaction(async (tx) => {
				return buildTemplateStructure(tx)
			})

			const result = await resolveStructureRef(source.query, testCase.ref, structure)

			expect(result.tagName).toBe(testCase.expectedTagName)
		},
	})
})

describe('createAncestryResolver - a satellite directly in a cloned function’s Private', () => {
	/** The function's Private of that type holds the variable; the project holds the function's clone and its Private. */
	function placement(params: { privateType: string }) {
		const { privateType } = params
		return {
			sourceXml: /* xml */ `
				<SCL ${ns} ${id}="root-s" version="2007" revision="C" release="5">
					<Substation ${id}="sub-s" name="TEMPLATE" uuid="sub-s-uuid">
						<VoltageLevel ${id}="vl-s" name="TEMPLATE" uuid="vl-s-uuid">
							<Bay ${id}="bay-s" name="TEMPLATE" uuid="bay-s-uuid">
								<Function ${id}="fn-s" name="Prot" uuid="fn-s-uuid">
									<Private ${id}="priv-s" type="${privateType}">
										<eIEC61850-6-100:Variable ${id}="var-s" name="PICKUP" value="1.2" uuid="var-s-uuid"/>
									</Private>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
			targetXml: /* xml */ `
				<SCL ${ns} ${id}="root-t" version="2007" revision="C" release="5">
					<Substation ${id}="sub-t" name="S1" uuid="sub-t-uuid">
						<VoltageLevel ${id}="vl-t" name="V1" uuid="vl-t-uuid">
							<Bay ${id}="bay-t" name="B1" uuid="bay-t-uuid">
								<Function ${id}="fn-t" name="Prot" uuid="fn-t-uuid">
									<Private ${id}="priv-t" type="${privateType}"/>
								</Function>
							</Bay>
						</VoltageLevel>
					</Substation>
				</SCL>
			`,
		}
	}

	for (const privateType of ['eIEC61850-6-100', 'ACME-Settings']) {
		it(`a Private of type ${privateType} → the variable lands in the clone of that Private, no other Private made`, async () => {
			const { source, target } = await createSclTestProject(placement({ privateType }))
			if (!target) throw new Error('target required')
			const sourceQuery = source.document.query as Core.Query<Config>
			const resolve = createAncestryResolver({
				sourceQuery,
				structure: {} as TargetStructure,
				cloneIndex: new Map<string, Scl.Ref<Scl.ElementsOf>>([
					['fn-s', { tagName: 'Function', id: 'fn-t' }],
					['priv-s', { tagName: 'Private', id: 'priv-t' }],
				]),
			})
			await target.document.transaction(async function place(tx) {
				const ref = { tagName: 'Variable', id: 'var-s' } as Scl.Ref<'Variable'>
				const targetParent = await resolve(ref)
				await cloneTree(tx, { sourceQuery, ref, targetParent })
			})

			const [variable] = await target.document.query.getRecordsByTagName('Variable')
			const privates = await target.document.query.getRecordsByTagName('Private')
			expect(variable?.parent?.id).toBe('priv-t')
			expect(privates.map((record) => record.id)).toEqual(['priv-t'])
		})
	}
})
