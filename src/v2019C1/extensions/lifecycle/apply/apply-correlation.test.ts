import { apply } from './apply'

import { describe, expect, it } from 'vitest'

import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { ssd as instantiateSsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import {
	ALL_XMLNS_NAMESPACES,
	CUSTOM_RECORD_ID_ATTRIBUTE,
	createSclTestProject,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { DiffNode } from '@/v2019C1/extensions/lifecycle/engine/diff.types'

// `apply` fills `appliedRef` on the report's nodes: what each report node became in the applied doc.
// Proves the producer-side correlation the consumer used to re-derive structurally.

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const functionRef = { tagName: 'Function', id: 'fn-1' } as Scl.Ref<'Function'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

function findNode(node: DiffNode, tagName: string): DiffNode | undefined {
	if (node.tagName === tagName) return node
	for (const child of node.children) {
		const found = findNode(child, tagName)
		if (found) return found
	}
	return undefined
}

const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="fsd">
		<Substation name="TEMPLATE" ${id}="sub-s">
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
	</SCL>
`

const emptyTargetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>
`

describe('apply — appliedRef correlation on the report', () => {
	it('first-time instantiate: every added node resolves to its freshly-created element', async () => {
		const { source, target } = await createSclTestProject({ sourceXml, targetXml: emptyTargetXml })
		if (!target) throw new Error('target required')

		const rep = await report(target.document.query, {
			verb: 'fsd',
			sourceQuery: source.document.query,
			ref: functionRef,
			anchor: bayRef,
		})

		let placedFunctionId: string | undefined
		await target.document.transaction(async (tx) => {
			const result = await apply(tx, {
				verb: 'fsd',
				sourceQuery: source.document.query,
				ref: functionRef,
				anchor: bayRef,
				report: rep,
			})
			placedFunctionId =
				result.instances.verb === 'fsd' ? result.instances.functions[0]?.id : undefined
		})

		const rootNode = rep.instances[0]!.tree
		const lnodeNode = findNode(rootNode, 'LNode')

		// root added Function -> the placed function root
		expect(rootNode.change).toBe('added')
		expect(rootNode.appliedRef?.id).toBe(placedFunctionId)
		// a nested added element also resolves to a real applied element
		expect(lnodeNode?.appliedRef?.id).toBeDefined()

		// every applied id actually exists in the applied document
		const applied = await target.document.query.getRecordsByTagName('LNode')
		expect(applied.map((r) => r.id)).toContain(lnodeNode?.appliedRef?.id)
	})

	it('reconcile update: matched node keeps its instance element, an added child gets its clone', async () => {
		// target already carries an instance of the function (stamped templateUuid = source uuid)
		const targetWithInstance = /* xml */ `
			<SCL ${ns} ${id}="scd">
				<Substation name="S1" ${id}="sub-t">
					<VoltageLevel name="V1" ${id}="vl-t">
						<Bay name="B1" ${id}="bay-t">
							<Function name="Prot" ${id}="fn-i" uuid="fn-inst-uuid" templateUuid="fn-src-uuid"/>
						</Bay>
					</VoltageLevel>
				</Substation>
				<DataTypeTemplates ${id}="dtt-t">
					<LNodeType id="CSWI_Type" lnClass="CSWI" ${id}="lnt-t">
						<DO name="Pos" type="DPC_Type" ${id}="do-t"/>
					</LNodeType>
					<DOType id="DPC_Type" cdc="DPC" ${id}="dot-t">
						<DA name="stVal" bType="BOOLEAN" fc="ST" ${id}="da-t"/>
					</DOType>
				</DataTypeTemplates>
			</SCL>
		`
		const { source, target } = await createSclTestProject({
			sourceXml,
			targetXml: targetWithInstance,
		})
		if (!target) throw new Error('target required')

		const rep = await report(target.document.query, {
			verb: 'fsd',
			sourceQuery: source.document.query,
			ref: functionRef,
			anchor: bayRef,
		})

		await target.document.transaction(async (tx) => {
			await apply(tx, {
				verb: 'fsd',
				sourceQuery: source.document.query,
				ref: functionRef,
				anchor: bayRef,
				report: rep,
				// a reconcile with changes needs decisions; an empty map accepts everything
				resolution: { decisions: new Map() },
			})
		})

		const rootNode = rep.instances[0]!.tree
		const lnodeNode = findNode(rootNode, 'LNode')

		// the Function matched in place -> its appliedRef IS its own instance element
		expect(rootNode.appliedRef?.id).toBe(rootNode.instanceRef?.id)
		expect(rootNode.appliedRef?.id).toBe('fn-i')
		// the LNode is added by the update -> its appliedRef is a fresh clone (not the source id)
		expect(lnodeNode?.change).toBe('added')
		expect(lnodeNode?.appliedRef?.id).toBeDefined()
		expect(lnodeNode?.appliedRef?.id).not.toBe('lnode-1')
		const applied = await target.document.query.getRecordsByTagName('LNode')
		expect(applied.map((r) => r.id)).toContain(lnodeNode?.appliedRef?.id)
	})
})

describe('apply — appliedRef across composed instances (ASD)', () => {
	const applicationRef = { tagName: 'Application', id: 'app-s' } as Scl.Ref<'Application'>

	const asdSourceXml = /* xml */ `
		<SCL ${ns} ${id}="asd">
			<Substation name="TEMPLATE" ${id}="sub-s">
				<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
					<eIEC61850-6-100:Application name="HMI" type="DCS" uuid="app-src-uuid" ${id}="app-s">
						<eIEC61850-6-100:FunctionRole name="ROOT" ${id}="fr-s">
							<eIEC61850-6-100:FunctionRoleContent ${id}="frc-s">
								<eIEC61850-6-100:FunctionRef function="TEMPLATE/TEMPLATE/TEMPLATE/Prot" functionUuid="fn-src-uuid" ${id}="app-fref-s"/>
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
		</SCL>
	`

	it('first-time instantiate annotates BOTH the Application and its composed Function instances', async () => {
		const { source, target } = await createSclTestProject({
			sourceXml: asdSourceXml,
			targetXml: emptyTargetXml,
		})
		if (!target) throw new Error('target required')

		const rep = await report(target.document.query, {
			verb: 'asd',
			sourceQuery: source.document.query,
			ref: applicationRef,
			anchor: bayRef,
		})

		await target.document.transaction(async (tx) => {
			await apply(tx, {
				verb: 'asd',
				sourceQuery: source.document.query,
				ref: applicationRef,
				anchor: bayRef,
				report: rep,
			})
		})

		const appInstance = rep.instances.find((i) => i.tree.tagName === 'Application')
		const fnInstance = rep.instances.find((i) => i.tree.tagName === 'Function')
		expect(appInstance).toBeDefined()
		expect(fnInstance).toBeDefined()

		// both first-time roots resolve to real applied elements
		const appIds = (await target.document.query.getRecordsByTagName('Application')).map((r) => r.id)
		const fnIds = (await target.document.query.getRecordsByTagName('Function')).map((r) => r.id)
		expect(appIds).toContain(appInstance!.tree.appliedRef?.id)
		expect(fnIds).toContain(fnInstance!.tree.appliedRef?.id)
	})
})

describe('apply — SSD frame appliedRef lands on the NEW bay, not the existing same-named one', () => {
	const bayScope = { tagName: 'Bay', id: 'bay-s' } as Scl.Ref<'Bay'>
	const targetVl = { tagName: 'VoltageLevel', id: 'vl-t' } as Scl.Ref<'VoltageLevel'>

	const ssdSource = /* xml */ `
		<SCL ${ns} ${id}="ssd">
			<Header id="ssd-header" uuid="ssd-doc-uuid" version="0" revision="1" ${id}="hdr-s"/>
			<Substation name="TEMPLATE" ${id}="sub-s">
				<VoltageLevel name="TEMPLATE" ${id}="vl-s">
					<Bay name="B1" ${id}="bay-s">
						<ConductingEquipment name="QA1" type="CBR" ${id}="ce-s"/>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
	const ssdTarget = /* xml */ `
		<SCL ${ns} ${id}="scd">
			<Header id="proj" uuid="proj-uuid" ${id}="hdr-t"/>
			<Substation name="S1" ${id}="sub-t">
				<VoltageLevel name="V1" ${id}="vl-t"/>
			</Substation>
		</SCL>
	`

	it('second instantiate: the added frame bay resolves to TEMPLATE_1, distinct from the seeded bay', async () => {
		const { source, target } = await createSclTestProject({
			sourceXml: ssdSource,
			targetXml: ssdTarget,
		})
		if (!target) throw new Error('target required')

		// seed the FIRST bay so a re-instantiation collides on the Bay name (B1 -> B1_1)
		await target.document.transaction(async (tx) => {
			await instantiateSsd(tx, {
				sourceQuery: source.document.query,
				scopeRef: bayScope,
				targetParent: targetVl,
			})
		})
		const seededBayIds = (await target.document.query.getRecordsByTagName('Bay')).map((r) => r.id)

		// report + apply the SECOND instantiate
		const rep = await report(target.document.query, {
			verb: 'ssd',
			scenario: 'instantiate',
			sourceQuery: source.document.query,
			ref: bayScope,
			anchor: targetVl,
		})
		await target.document.transaction(async (tx) => {
			await apply(tx, {
				verb: 'ssd',
				scenario: 'instantiate',
				sourceQuery: source.document.query,
				ref: bayScope,
				anchor: targetVl,
				report: rep,
				resolution: { decisions: new Map() },
			})
		})

		// the frame report instance (Bay root) must resolve to the NEW bay, never the seeded one
		const frameInstance = rep.instances.find((i) => i.tree.tagName === 'Bay')
		expect(frameInstance).toBeDefined()
		const newBayId = frameInstance!.tree.appliedRef?.id
		expect(newBayId).toBeDefined()
		expect(seededBayIds).not.toContain(newBayId) // NOT conflated with the existing bay
		const allBayIds = (await target.document.query.getRecordsByTagName('Bay')).map((r) => r.id)
		expect(allBayIds).toContain(newBayId) // it IS a real bay in the applied doc
		expect(allBayIds.length).toBe(2) // seeded + new
	})
})

describe('apply — SSD appliedRef covers the elements carried from outside the scope', () => {
	const bayScope = { tagName: 'Bay', id: 'bay-s' } as Scl.Ref<'Bay'>
	const targetVl = { tagName: 'VoltageLevel', id: 'vl-t' } as Scl.Ref<'VoltageLevel'>

	// a bay whose function is annotated by a Variable declared at Substation level, outside the bay
	const ssdSource = /* xml */ `
		<SCL ${ns} ${id}="ssd">
			<Header id="ssd-header" uuid="ssd-doc-uuid" version="0" revision="1" ${id}="hdr-s"/>
			<Substation name="TEMPLATE" ${id}="sub-s">
				<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
					<eIEC61850-6-100:Variable name="VXCBR" uuid="var-src-uuid" ${id}="var-s">
						<eIEC61850-6-100:VariableApplyTo element="TEMPLATE/TEMPLATE/B1/Prot" elementUuid="fn-src-uuid" ${id}="vapp-s"/>
					</eIEC61850-6-100:Variable>
				</Private>
				<VoltageLevel name="TEMPLATE" ${id}="vl-s">
					<Bay name="B1" ${id}="bay-s">
						<Function name="Prot" ${id}="fn-1" uuid="fn-src-uuid"/>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
	const ssdTarget = /* xml */ `
		<SCL ${ns} ${id}="scd">
			<Header id="proj" uuid="proj-uuid" ${id}="hdr-t"/>
			<Substation name="S1" ${id}="sub-t">
				<VoltageLevel name="V1" ${id}="vl-t"/>
			</Substation>
		</SCL>
	`

	it('first-time instantiate: the Variable carried with a function resolves to its clone', async () => {
		const { source, target } = await createSclTestProject({
			sourceXml: ssdSource,
			targetXml: ssdTarget,
		})
		if (!target) throw new Error('target required')

		const rep = await report(target.document.query, {
			verb: 'ssd',
			sourceQuery: source.document.query,
			ref: bayScope,
			anchor: targetVl,
		})
		await target.document.transaction(async (tx) => {
			await apply(tx, {
				verb: 'ssd',
				sourceQuery: source.document.query,
				ref: bayScope,
				anchor: targetVl,
				report: rep,
			})
		})

		const variableCompanion = allGroups(rep)
			.flatMap((group) => group.companions)
			.find((companion) => companion.tagName === 'Variable')
		expect(variableCompanion).toBeDefined()

		const variableIds = (await target.document.query.getRecordsByTagName('Variable')).map(
			(record) => record.id,
		)
		expect(variableIds).toContain(variableCompanion!.appliedRef?.id)
	})
})

describe('apply — the report describes the last run only', () => {
	const bayScope = { tagName: 'Bay', id: 'bay-s' } as Scl.Ref<'Bay'>
	const targetVl = { tagName: 'VoltageLevel', id: 'vl-t' } as Scl.Ref<'VoltageLevel'>

	// a bay typical B1 with a function of its own
	const ssdSource = /* xml */ `
		<SCL ${ns} ${id}="ssd">
			<Header id="ssd-header" uuid="ssd-doc-uuid" version="0" revision="1" ${id}="hdr-s"/>
			<Substation name="TEMPLATE" ${id}="sub-s">
				<VoltageLevel name="TEMPLATE" ${id}="vl-s">
					<Bay name="B1" uuid="bay-src-uuid" ${id}="bay-s">
						<Function name="Prot" uuid="fn-src-uuid" ${id}="fn-s"/>
					</Bay>
				</VoltageLevel>
			</Substation>
		</SCL>
	`
	// a voltage level with no bay yet
	const ssdTarget = /* xml */ `
		<SCL ${ns} ${id}="scd">
			<Header id="proj" uuid="proj-uuid" ${id}="hdr-t"/>
			<Substation name="S1" ${id}="sub-t">
				<VoltageLevel name="V1" ${id}="vl-t"/>
			</Substation>
		</SCL>
	`

	it('a run placing everything, then a run leaving the bay out → nothing of the bay is said to be placed', async () => {
		const { source, target } = await createSclTestProject({
			sourceXml: ssdSource,
			targetXml: ssdTarget,
		})
		if (!target) throw new Error('target required')
		const lifecycleTarget = {
			verb: 'ssd' as const,
			sourceQuery: source.document.query,
			ref: bayScope,
			anchor: targetVl,
		}
		const rep = await report(target.document.query, lifecycleTarget)

		// the preview: everything accepted
		const preview = await target.document.prepare(async (tx) => {
			await apply(tx, { ...lifecycleTarget, report: rep })
		})
		preview.discard()

		// the dry run: the bay left out with what it holds
		const decisions = new Map(allGroups(rep).map((group) => [group.id, 'skip' as const]))
		const dryRun = await target.document.prepare(async (tx) => {
			await apply(tx, { ...lifecycleTarget, report: rep, resolution: { decisions } })
		})
		dryRun.discard()

		const bayMapping = rep.mappings.find((mapping) => mapping.id === 'bay-s')
		expect(bayMapping?.mapping).toEqual({ create: expect.anything() })
		expect(bayMapping?.appliedRef).toBeUndefined()
		const nodes = allGroups(rep).flatMap((group) => [group.primary, ...group.companions])
		expect(nodes.map((node) => node.appliedRef)).toEqual(nodes.map(() => undefined))
	})
})
