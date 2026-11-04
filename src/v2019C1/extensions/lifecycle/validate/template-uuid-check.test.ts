import { checkTemplateUuids } from './template-uuid-check'

import { describe, expect, it } from 'vitest'

import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	runSclTestCases,
} from '@/v2019C1/test'

import type { TemplateUuidWarning } from './template-uuid-check.types'
import type { Scl } from '@/v2019C1/config'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

// A legitimate `templateUuid` identifies ONE template element, so it is either unique per instance
// or shared only across instances of the SAME element type (multi-instance). A value reused across
// DIFFERENT element types cannot be a single template — it is a placeholder/authoring artefact.
// The checker flags exactly that, with no false positive on legit sharing.
const DUMMY = '123e4567-e89b-12d3-a456-789012345678'

describe('checkTemplateUuids — flags illegitimate cross-type templateUuid reuse', () => {
	it('warns when one templateUuid is shared across unrelated element types', async () => {
		const xml = /* xml */ `
			<SCL ${ns} ${id}="scd">
				<Substation name="S1" uuid="s1" templateUuid="${DUMMY}" ${id}="sub">
					<Private type="eIEC61850-6-100" ${id}="priv">
						<eIEC61850-6-100:AllocationRole name="PIU" uuid="piu" templateUuid="${DUMMY}" ${id}="ar"/>
					</Private>
					<VoltageLevel name="V1" uuid="vl" templateUuid="${DUMMY}" ${id}="vl"/>
				</Substation>
			</SCL>
		`
		const { source } = await createSclTestProject({ sourceXml: xml })

		const warnings = await checkTemplateUuids(source.document.query)

		expect(warnings).toHaveLength(1)
		expect(warnings[0].code).toBe('cross-type-template-uuid')
		expect(warnings[0].value).toBe(DUMMY)
		expect(warnings[0].count).toBe(3)
		expect(new Set(warnings[0].tagNames)).toEqual(
			new Set(['Substation', 'AllocationRole', 'VoltageLevel']),
		)
	})

	it('does not warn on legit sharing (same type) or unique templateUuids', async () => {
		const xml = /* xml */ `
			<SCL ${ns} ${id}="scd">
				<Substation name="S1" uuid="s1" templateUuid="tpl-sub" ${id}="sub">
					<Private type="eIEC61850-6-100" ${id}="priv">
						<eIEC61850-6-100:AllocationRole name="PIU" uuid="piu" templateUuid="tpl-ar" ${id}="ar1"/>
						<eIEC61850-6-100:AllocationRole name="PIU" uuid="piu2" templateUuid="tpl-ar" ${id}="ar2"/>
					</Private>
				</Substation>
			</SCL>
		`
		const { source } = await createSclTestProject({ sourceXml: xml })

		const warnings = await checkTemplateUuids(source.document.query)
		expect(warnings).toEqual([])
	})
})

describe('checkTemplateUuids — duplicate instance uuid', () => {
	it('warns when the same uuid is used by more than one element', async () => {
		const xml = /* xml */ `
			<SCL ${ns} ${id}="scd">
				<Substation name="S1" uuid="s1" ${id}="sub">
					<VoltageLevel name="V1" uuid="dup" ${id}="vl1"/>
					<VoltageLevel name="V2" uuid="dup" ${id}="vl2"/>
				</Substation>
			</SCL>
		`
		const { source } = await createSclTestProject({ sourceXml: xml })

		const dup = (await checkTemplateUuids(source.document.query)).filter(
			(warning) => warning.code === 'duplicate-instance-uuid',
		)

		expect(dup).toHaveLength(1)
		expect(dup[0].value).toBe('dup')
		expect(dup[0].count).toBe(2)
	})

	it('does not warn when every uuid is unique', async () => {
		const xml = /* xml */ `
			<SCL ${ns} ${id}="scd">
				<Substation name="S1" uuid="s1" ${id}="sub">
					<VoltageLevel name="V1" uuid="v1" ${id}="vl1"/>
					<VoltageLevel name="V2" uuid="v2" ${id}="vl2"/>
				</Substation>
			</SCL>
		`
		const { source } = await createSclTestProject({ sourceXml: xml })

		const dup = (await checkTemplateUuids(source.document.query)).filter(
			(warning) => warning.code === 'duplicate-instance-uuid',
		)
		expect(dup).toEqual([])
	})
})

describe('checkTemplateUuids — templateUuid type mismatch', () => {
	it('warns when a templateUuid resolves in-file to an element of a different type', async () => {
		const xml = /* xml */ `
			<SCL ${ns} ${id}="scd">
				<Substation name="TEMPLATE" uuid="X" ${id}="sub">
					<Private type="eIEC61850-6-100" ${id}="priv">
						<eIEC61850-6-100:AllocationRole name="PIU" uuid="ar" templateUuid="X" ${id}="arole"/>
					</Private>
				</Substation>
			</SCL>
		`
		const { source } = await createSclTestProject({ sourceXml: xml })

		const mismatch = (await checkTemplateUuids(source.document.query)).filter(
			(warning) => warning.code === 'template-uuid-type-mismatch',
		)

		expect(mismatch).toHaveLength(1)
		expect(mismatch[0].value).toBe('X')
		expect(new Set(mismatch[0].tagNames)).toEqual(new Set(['AllocationRole', 'Substation']))
	})

	it('does not warn when a templateUuid resolves to an element of the SAME type', async () => {
		const xml = /* xml */ `
			<SCL ${ns} ${id}="scd">
				<Substation name="S1" uuid="s1" ${id}="sub">
					<VoltageLevel name="TEMPLATE" uuid="X" ${id}="tpl"/>
					<VoltageLevel name="V1" uuid="v1" templateUuid="X" ${id}="inst"/>
				</Substation>
			</SCL>
		`
		const { source } = await createSclTestProject({ sourceXml: xml })

		const mismatch = (await checkTemplateUuids(source.document.query)).filter(
			(warning) => warning.code === 'template-uuid-type-mismatch',
		)
		expect(mismatch).toEqual([])
	})
})

// The function forms are one element type: a function template placed as a function, a subfunction, an equipment
// function or an equipment subfunction keeps its `templateUuid`, and a `templateUuid` naming another form of the family
// is the same lineage. A value shared with an element outside the family is still a placeholder.
const FAMILY = 'fa000000-0000-4000-8000-000000000001'

/** A project holding `functionXml` in a bay, `equipmentXml` in a conducting equipment of that bay, `templatesXml` at the root. */
function functionFamilyXml(
	params: { bayXml?: string; equipmentXml?: string; templatesXml?: string } = {},
): string {
	const { bayXml = '', equipmentXml = '', templatesXml = '' } = params
	const privateTemplates = templatesXml
		? `<Private type="eIEC61850-6-100" ${id}="templates-private">${templatesXml}</Private>`
		: ''
	const equipment = equipmentXml
		? `<ConductingEquipment name="CE1" type="CBR" ${id}="equipment">${equipmentXml}</ConductingEquipment>`
		: ''
	return /* xml */ `
		<SCL ${ns} ${id}="scd">
			${privateTemplates}
			<Substation name="S1" ${id}="substation">
				<VoltageLevel name="V1" ${id}="voltage-level">
					<Bay name="B1" ${id}="bay">
						${equipment}
						${bayXml}
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
}

type FamilyCase = SclTest.BaseXmlTestCase & {
	/** The warnings read, `<code>:<value>:<tags>` each, in the order the checker lists them. */
	expected: string[]
}

describe('checkTemplateUuids — the function forms are one type', () => {
	const testCases: SclTest.TestCases<FamilyCase> = {
		'Function + EqFunction + FunctionTemplate + SubFunctionTemplate on one value -> no warning': {
			sourceXml: functionFamilyXml({
				bayXml: `<Function name="F1" uuid="function-uuid" templateUuid="${FAMILY}" ${id}="function"/>`,
				equipmentXml: `<EqFunction name="EF1" uuid="eq-function-uuid" templateUuid="${FAMILY}" ${id}="eq-function"/>`,
				templatesXml: /* xml */ `
					<eIEC61850-6-100:FunctionTemplate name="FT1" templateUuid="${FAMILY}" ${id}="function-template">
						<eIEC61850-6-100:SubFunctionTemplate name="SFT1" templateUuid="${FAMILY}" ${id}="sub-function-template"/>
					</eIEC61850-6-100:FunctionTemplate>
				`,
			}),
			expected: [],
		},

		'Function + SubFunction + EqSubFunction on one value -> no warning': {
			sourceXml: functionFamilyXml({
				bayXml: /* xml */ `
					<Function name="F1" uuid="function-uuid" templateUuid="${FAMILY}" ${id}="function">
						<SubFunction name="SF1" uuid="sub-function-uuid" templateUuid="${FAMILY}" ${id}="sub-function"/>
					</Function>
				`,
				equipmentXml: /* xml */ `
					<EqFunction name="EF1" uuid="eq-function-uuid" ${id}="eq-function">
						<EqSubFunction name="ESF1" uuid="eq-sub-function-uuid" templateUuid="${FAMILY}" ${id}="eq-sub-function"/>
					</EqFunction>
				`,
			}),
			expected: [],
		},

		'a SubFunction naming in-file a Function -> no mismatch': {
			sourceXml: functionFamilyXml({
				bayXml: /* xml */ `
					<Function name="F1" uuid="${FAMILY}" ${id}="function"/>
					<Function name="F2" uuid="function-two-uuid" ${id}="function-two">
						<SubFunction name="SF1" uuid="sub-function-uuid" templateUuid="${FAMILY}" ${id}="sub-function"/>
					</Function>
				`,
			}),
			expected: [],
		},

		'a SubFunction naming in-file a FunctionTemplate -> no mismatch': {
			sourceXml: functionFamilyXml({
				bayXml: /* xml */ `
					<Function name="F1" uuid="function-uuid" ${id}="function">
						<SubFunction name="SF1" uuid="sub-function-uuid" templateUuid="${FAMILY}" ${id}="sub-function"/>
					</Function>
				`,
				templatesXml: `<eIEC61850-6-100:FunctionTemplate name="FT1" uuid="${FAMILY}" ${id}="function-template"/>`,
			}),
			expected: [],
		},

		'a SubFunction naming in-file an EqSubFunction -> no mismatch': {
			sourceXml: functionFamilyXml({
				bayXml: /* xml */ `
					<Function name="F1" uuid="function-uuid" ${id}="function">
						<SubFunction name="SF1" uuid="sub-function-uuid" templateUuid="${FAMILY}" ${id}="sub-function"/>
					</Function>
				`,
				equipmentXml: /* xml */ `
					<EqFunction name="EF1" uuid="eq-function-uuid" ${id}="eq-function">
						<EqSubFunction name="ESF1" uuid="${FAMILY}" ${id}="eq-sub-function"/>
					</EqFunction>
				`,
			}),
			expected: [],
		},

		'a FunctionTemplate naming in-file a Function -> no mismatch': {
			sourceXml: functionFamilyXml({
				bayXml: `<Function name="F1" uuid="${FAMILY}" ${id}="function"/>`,
				templatesXml: `<eIEC61850-6-100:FunctionTemplate name="FT1" uuid="function-template-uuid" templateUuid="${FAMILY}" ${id}="function-template"/>`,
			}),
			expected: [],
		},

		'a SubFunctionTemplate naming in-file a Function -> no mismatch': {
			sourceXml: functionFamilyXml({
				bayXml: `<Function name="F1" uuid="${FAMILY}" ${id}="function"/>`,
				templatesXml: /* xml */ `
					<eIEC61850-6-100:FunctionTemplate name="FT1" uuid="function-template-uuid" ${id}="function-template">
						<eIEC61850-6-100:SubFunctionTemplate name="SFT1" uuid="sub-function-template-uuid" templateUuid="${FAMILY}" ${id}="sub-function-template"/>
					</eIEC61850-6-100:FunctionTemplate>
				`,
			}),
			expected: [],
		},

		'a Function naming in-file a SubFunctionTemplate -> no mismatch': {
			sourceXml: functionFamilyXml({
				bayXml: `<Function name="F1" uuid="function-uuid" templateUuid="${FAMILY}" ${id}="function"/>`,
				templatesXml: /* xml */ `
					<eIEC61850-6-100:FunctionTemplate name="FT1" uuid="function-template-uuid" ${id}="function-template">
						<eIEC61850-6-100:SubFunctionTemplate name="SFT1" uuid="${FAMILY}" ${id}="sub-function-template"/>
					</eIEC61850-6-100:FunctionTemplate>
				`,
			}),
			expected: [],
		},

		'Function + LNode on one value -> still warns, the tags those of the elements': {
			sourceXml: functionFamilyXml({
				bayXml: /* xml */ `
					<Function name="F1" uuid="function-uuid" templateUuid="${FAMILY}" ${id}="function">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" uuid="lnode-uuid" templateUuid="${FAMILY}" ${id}="lnode"/>
					</Function>
				`,
			}),
			expected: [`cross-type-template-uuid:${FAMILY}:Function,LNode`],
		},

		'a Function naming in-file an LNode -> still a mismatch': {
			sourceXml: functionFamilyXml({
				bayXml: /* xml */ `
					<Function name="F1" uuid="function-uuid" templateUuid="${FAMILY}" ${id}="function">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" uuid="${FAMILY}" ${id}="lnode"/>
					</Function>
				`,
			}),
			expected: [`template-uuid-type-mismatch:${FAMILY}:Function,LNode`],
		},

		'a Function and a SubFunction naming in-file an LNode -> one mismatch, the three tags kept': {
			sourceXml: functionFamilyXml({
				bayXml: /* xml */ `
					<Function name="F1" uuid="function-uuid" templateUuid="${FAMILY}" ${id}="function">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" uuid="${FAMILY}" ${id}="lnode"/>
						<SubFunction name="SF1" uuid="sub-function-uuid" templateUuid="${FAMILY}" ${id}="sub-function"/>
					</Function>
				`,
			}),
			expected: [`template-uuid-type-mismatch:${FAMILY}:Function,LNode,SubFunction`],
		},

		'Function + SubFunction + LNode on one value -> one warning, the three tags kept': {
			sourceXml: functionFamilyXml({
				bayXml: /* xml */ `
					<Function name="F1" uuid="function-uuid" templateUuid="${FAMILY}" ${id}="function">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" uuid="lnode-uuid" templateUuid="${FAMILY}" ${id}="lnode"/>
						<SubFunction name="SF1" uuid="sub-function-uuid" templateUuid="${FAMILY}" ${id}="sub-function"/>
					</Function>
				`,
			}),
			expected: [`cross-type-template-uuid:${FAMILY}:Function,LNode,SubFunction`],
		},
	}

	async function act({ testCase, source }: SclTest.ActParams<FamilyCase>): Promise<void> {
		const warnings = await checkTemplateUuids(source.query)

		expect(warnings.map(summarize)).toEqual(testCase.expected)
	}

	runSclTestCases.withoutExport({ testCases, act })
})

function summarize(warning: TemplateUuidWarning): string {
	return `${warning.code}:${warning.value}:${warning.tagNames.join(',')}`
}

// One function template, placed once as a function and once as a subfunction: the engine writes both forms with the
// template's lineage, so the document is the engine's own output.
describe('checkTemplateUuids — one FSD placed as a function and as a subfunction', () => {
	it('warns of nothing, the engine itself placed it once per tag', async () => {
		const sourceXml = /* xml */ `
			<SCL ${ns} ${id}="fsd">
				<Substation name="TEMPLATE" ${id}="sub-s">
					<VoltageLevel name="TEMPLATE" ${id}="vl-s">
						<Bay name="TEMPLATE" ${id}="bay-s">
							<Function name="F" uuid="fn-f-uuid" ${id}="fn-f"/>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>
		`
		const targetXml = /* xml */ `
			<SCL ${ns} ${id}="scd">
				<Substation name="S1" ${id}="sub-t">
					<VoltageLevel name="V1" ${id}="vl-t">
						<Bay name="B1" ${id}="bay-b1"/>
						<Bay name="B2" ${id}="bay-b2">
							<Function name="G" uuid="fn-g-uuid" ${id}="fn-g"/>
						</Bay>
					</VoltageLevel>
				</Substation>
			</SCL>
		`
		const { source, target } = await createSclTestProject({ sourceXml, targetXml })
		if (!target) throw new Error('target required')
		const functionRef = { tagName: 'Function', id: 'fn-f' } as Scl.Ref<'Function'>
		const placedTags: string[] = []
		await target.document.transaction(async (tx) => {
			for (const targetParent of [
				{ tagName: 'Bay', id: 'bay-b1' },
				{ tagName: 'Function', id: 'fn-g' },
			] as Scl.Ref<Scl.ElementsOf>[]) {
				const placed = await instantiateFsd(tx, {
					sourceQuery: source.document.query,
					functionRef,
					targetParent,
				})
				placedTags.push(placed.functionRef.tagName)
			}
		})

		expect(placedTags).toEqual(['Function', 'SubFunction'])
		// both placed forms carry the template's lineage, the one value the checker must read as one type
		for (const tagName of ['Function', 'SubFunction'] as const) {
			const [placed] = await target.document.query.findByAttributes({
				tagName,
				attributes: { templateUuid: 'fn-f-uuid' },
			})
			expect(placed, `a ${tagName} carrying the template lineage`).toBeDefined()
		}
		const warnings = await checkTemplateUuids(target.document.query)
		expect(warnings.map(summarize)).toEqual([])
	})
})
