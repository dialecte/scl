import { describe } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { asd as instantiateAsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import { ALL_XMLNS_NAMESPACES, CUSTOM_RECORD_ID_ATTRIBUTE, runSclTestCases } from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { DecisionGroup, DecisionMap } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { SclTest } from '@/v2019C1/test'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const applicationRef = { tagName: 'Application', id: 'app-s' } as Scl.Ref<'Application'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

type TestCase = SclTest.BaseXmlTestCase & {
	targetXml: string
	decide: (groups: DecisionGroup[]) => DecisionMap
}

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
				<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="app-src-uuid" ${id}="app-s">
					<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="fr-s">
						<eIEC61850-6-100:FunctionRoleContent ${id}="frc-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/Prot" functionUuid="fn-src-uuid" ${id}="app-fref-s"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
				</eIEC61850-6-100:Application>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid">
						<LNode iedName="None" lnClass="CSWI" lnInst="1" lnType="CSWI_Type" ${id}="lnode-1" uuid="lnode-src-uuid"/>
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

// The newer ASD adds an application-layer role AND a composed-function LNode, so
// the report has one group per layer that we can accept/skip independently.
const mutate = async (tx: Scl.Transaction): Promise<void> => {
	await tx.addChild(applicationRef, { tagName: 'FunctionRole', attributes: { name: 'ROLE2' } })
	await tx.addChild({ tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>, {
		tagName: 'LNode',
		attributes: { iedName: 'None', lnClass: 'XCBR', lnInst: '1', lnType: 'CSWI_Type' },
	})
}

const skipWhere =
	(predicate: (g: DecisionGroup) => boolean) =>
	(groups: DecisionGroup[]): DecisionMap =>
		new Map(groups.filter(predicate).map((g) => [g.id, 'skip'] as const))

const appRole = '//v2019C1:Application[@name="HMI"]/v2019C1:FunctionRole[@name="ROLE2"]'
const functionLNode = '//default:Function[@name="Prot"]/default:LNode[@lnClass="XCBR"]'

describe('lifecycle.apply — decision-gated ASD (both layers)', () => {
	const testCases: SclTest.TestCases<TestCase> = {
		'accept all -> both the application role and the composed-function LNode apply': {
			sourceXml,
			targetXml,
			decide: () => new Map(),
			expectedQueries: [appRole, functionLNode],
		},

		'skip the function-layer group -> only the application change applies': {
			sourceXml,
			targetXml,
			decide: skipWhere((g) => g.primary.tagName === 'LNode'),
			expectedQueries: [appRole],
			unexpectedQueries: [functionLNode],
		},

		'skip the application group -> only the composed-function change applies': {
			sourceXml,
			targetXml,
			decide: skipWhere((g) => g.primary.tagName === 'FunctionRole'),
			expectedQueries: [functionLNode],
			unexpectedQueries: [appRole],
		},
	}

	async function act({
		testCase,
		source,
		target,
	}: SclTest.ActParams<TestCase>): Promise<SclTest.ActResult> {
		if (!target) throw new Error('target required')

		await target.transaction(async (tx) => {
			await instantiateAsd(tx, { sourceQuery: source.query, applicationRef, targetParent: bayRef })
		})
		await source.transaction(mutate)

		const rep = await report(target.query, {
			verb: 'asd',
			sourceQuery: source.query,
			ref: applicationRef,
			anchor: bayRef,
		})

		await target.transaction(async (tx) => {
			await apply(tx, {
				verb: 'asd',
				sourceQuery: source.query,
				ref: applicationRef,
				anchor: bayRef,
				report: rep,
				decisions: testCase.decide(rep.groups),
			})
		})

		return { assertOn: 'target' }
	}

	runSclTestCases.withExport({ testCases, act })
})
