import { apply } from '../apply'
import { report } from '../report'

import { describe } from 'vitest'

import { fsd as instantiateFsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { GroupDecision } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

// Slice 3 (graft) — when a template update GRAFTS a new child onto an existing instance,
// the placed element is validated against its instance-parent context: a name collision
// is auto-resolved, and the full track can override the name. Engine owns uniqueness.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="sub">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" uuid="fn-1" ${id}="fn-1">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" uuid="ln-1" ${id}="ln-1"/>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates ${id}="dtt-s">
			<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnt-s">
				<DO name="Pos" type="DPC_Type" ${id}="do-s"/>
			</LNodeType>
			<DOType id="DPC_Type" cdc="DPC" ${id}="dot-s">
				<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-s"/>
			</DOType>
		</DataTypeTemplates>
	</SCL>`

const targetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>`

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	overrideName?: string
}

describe('lifecycle scenario — reconcile resolves a grafted element name collision (Slice 3)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'a grafted SubFunction colliding with a project sibling is auto-resolved': {
			sourceXml,
			targetXml,
			expectedQueries: [
				'//default:Function[@name="Prot"]/default:SubFunction[@name="Aux"]', // the project sibling is kept
				'//default:Function[@name="Prot"]/default:SubFunction[@name="Aux_1"]', // the graft is renamed
			],
			unexpectedQueries: [
				'//default:Function[@name="Prot"]/default:SubFunction[@name="Aux"][2]', // no duplicate name
			],
		},
		'a user override names the grafted SubFunction': {
			sourceXml,
			targetXml,
			overrideName: 'AuxB',
			expectedQueries: [
				'//default:Function[@name="Prot"]/default:SubFunction[@name="Aux"]', // the project sibling
				'//default:Function[@name="Prot"]/default:SubFunction[@name="AuxB"]', // user override applied verbatim
			],
			unexpectedQueries: [
				'//default:Function[@name="Prot"]/default:SubFunction[@name="Aux_1"]', // not auto-resolved: user name wins
			],
		},
	}

	async function act({
		source,
		target,
		testCase,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		// instantiate the template function into the empty project
		await target.transaction(async (tx) => {
			await instantiateFsd(tx, { sourceQuery: source.query, functionRef, targetParent: bayRef })
		})

		// the project adds its own SubFunction "Aux" to the instance (no template lineage)
		const [instanceFunction] = await target.query.findByAttributes({
			tagName: 'Function',
			attributes: { templateUuid: 'fn-1' },
		})
		if (!instanceFunction) throw new Error('instance function not found')
		await target.transaction(async (tx) => {
			await tx.addChild({ tagName: 'Function', id: instanceFunction.id } as Scl.Ref<'Function'>, {
				tagName: 'SubFunction',
				attributes: { name: 'Aux' },
			})
		})

		// the template evolves: it now also carries a SubFunction named "Aux"
		let sourceSubRef!: Scl.Ref<'SubFunction'>
		await source.transaction(async (tx) => {
			sourceSubRef = (await tx.addChild(functionRef, {
				tagName: 'SubFunction',
				attributes: { name: 'Aux', uuid: 'sf-2' },
			})) as Scl.Ref<'SubFunction'>
		})

		// update via the seam: the new SubFunction is grafted onto the instance and its
		// collision resolved; a user override rides on the grafted group's decision `values`
		const rep = await report(target.query, {
			verb: 'fsd',
			sourceQuery: source.query,
			ref: functionRef,
			anchor: bayRef,
		})
		const decisions = new Map<string, GroupDecision>()
		if (testCase.overrideName) {
			const graftGroup = rep.groups.find(
				(group) => group.change === 'added' && group.primary.sourceRef?.id === sourceSubRef.id,
			)
			if (!graftGroup) throw new Error('graft group not found')
			decisions.set(graftGroup.id, { action: 'accept', values: { name: testCase.overrideName } })
		}
		await target.transaction(async (tx) => {
			await apply(tx, {
				verb: 'fsd',
				sourceQuery: source.query,
				ref: functionRef,
				anchor: bayRef,
				report: rep,
				decisions,
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
