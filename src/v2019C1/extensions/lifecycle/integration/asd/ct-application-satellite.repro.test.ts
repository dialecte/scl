import { describe, expect, it } from 'vitest'

import { apply } from '@/v2019C1/extensions/lifecycle/apply'
import { allGroups } from '@/v2019C1/extensions/lifecycle/engine/diff'
import { asd as instantiateAsd } from '@/v2019C1/extensions/lifecycle/instantiate/transaction'
import { report } from '@/v2019C1/extensions/lifecycle/report'
import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'
import type { DecisionGroup } from '@/v2019C1/extensions/lifecycle/engine/diff.types'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

const applicationRef = { tagName: 'Application', id: 'app-s' } as Scl.Ref<'Application'>
const bayRef = { tagName: 'Bay', id: 'bay-t' } as Scl.Ref<'Bay'>

// Faithful "Current Transformer" ASD shape: an Application whose MEASUREMENT FunctionRole
// references the four SubFunctions (PhsA/B/C/N, all sharing ONE library templateUuid), a
// composed Function carrying those SubFunctions, and a FunctionCategory satellite whose
// SubCategory holds one FunctionCatRef per SubFunction.
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="eIEC61850-6-100" ${id}="sub-priv-s">
				<eIEC61850-6-100:Application name="CT_App" type="HV_Interface" uuid="app-src" ${id}="app-s">
					<eIEC61850-6-100:FunctionRole name="APPLICATION ROOT" uuid="fr-root-src" ${id}="fr-root-s">
						<eIEC61850-6-100:FunctionRoleContent ${id}="frc-root-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/CT_Fn" functionUuid="fn-src" ${id}="fref-fn-s"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
					<eIEC61850-6-100:FunctionRole name="MEASUREMENT" uuid="fr-meas-src" ${id}="fr-meas-s">
						<eIEC61850-6-100:FunctionRoleContent ${id}="frc-meas-s">
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/PhsA" functionUuid="sfa-src" ${id}="fref-a-s"/>
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/PhsB" functionUuid="sfb-src" ${id}="fref-b-s"/>
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/PhsC" functionUuid="sfc-src" ${id}="fref-c-s"/>
							<eIEC61850-6-100:FunctionRef function="TEMPLATE/N" functionUuid="sfn-src" ${id}="fref-n-s"/>
						</eIEC61850-6-100:FunctionRoleContent>
					</eIEC61850-6-100:FunctionRole>
					<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/PIU" allocationRoleUuid="ar-src" ${id}="arref-s"/>
				</eIEC61850-6-100:Application>
				<eIEC61850-6-100:AllocationRole name="PIU" uuid="ar-src" ${id}="ar-s">
					<eIEC61850-6-100:FunctionRef function="TEMPLATE/CT_Fn" functionUuid="fn-src" ${id}="ar-fref-s"/>
				</eIEC61850-6-100:AllocationRole>
				<eIEC61850-6-100:FunctionCategory name="Measurement" uuid="cat-src" ${id}="cat-s">
					<eIEC61850-6-100:SubCategory name="Current" uuid="subcat-src" ${id}="subcat-s">
						<eIEC61850-6-100:FunctionCatRef functionUuid="sfa-src" function="TEMPLATE/CT_Fn/PhsA" ${id}="cref-a-s"/>
						<eIEC61850-6-100:FunctionCatRef functionUuid="sfb-src" function="TEMPLATE/CT_Fn/PhsB" ${id}="cref-b-s"/>
						<eIEC61850-6-100:FunctionCatRef functionUuid="sfc-src" function="TEMPLATE/CT_Fn/PhsC" ${id}="cref-c-s"/>
						<eIEC61850-6-100:FunctionCatRef functionUuid="sfn-src" function="TEMPLATE/CT_Fn/N" ${id}="cref-n-s"/>
					</eIEC61850-6-100:SubCategory>
				</eIEC61850-6-100:FunctionCategory>
			</Private>
			<VoltageLevel name="TEMPLATE" ${id}="vl-s">
				<Bay name="TEMPLATE" ${id}="bay-s">
					<Function name="CT_Fn" uuid="fn-src" ${id}="fn-1">
						<SubFunction name="PhsA" uuid="sfa-src" templateUuid="lib-subfn" ${id}="sfa-s">
							<LNode iedName="None" lnClass="TCTR" lnInst="1" lnType="TCTR_Type" ${id}="ln-a" uuid="lna-src"/>
						</SubFunction>
						<SubFunction name="PhsB" uuid="sfb-src" templateUuid="lib-subfn" ${id}="sfb-s">
							<LNode iedName="None" lnClass="TCTR" lnInst="2" lnType="TCTR_Type" ${id}="ln-b" uuid="lnb-src"/>
						</SubFunction>
						<SubFunction name="PhsC" uuid="sfc-src" templateUuid="lib-subfn" ${id}="sfc-s">
							<LNode iedName="None" lnClass="TCTR" lnInst="3" lnType="TCTR_Type" ${id}="ln-c" uuid="lnc-src"/>
						</SubFunction>
						<SubFunction name="N" uuid="sfn-src" templateUuid="lib-subfn" ${id}="sfn-s">
							<LNode iedName="None" lnClass="TCTR" lnInst="4" lnType="TCTR_Type" ${id}="ln-n" uuid="lnn-src"/>
						</SubFunction>
					</Function>
				</Bay>
			</VoltageLevel>
		</Substation>
		<DataTypeTemplates ${id}="dtt-s">
			<LNodeType id="TCTR_Type" lnClass="TCTR" ${id}="lnt-s">
				<DO name="Amp" type="SAV_Type" ${id}="do-s"/>
			</LNodeType>
			<DOType id="SAV_Type" cdc="SAV" ${id}="dot-s">
				<DA name="instMag" bType="Struct" fc="MX" ${id}="da-s"/>
			</DOType>
		</DataTypeTemplates>
	</SCL>`

const emptyTargetXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="sub-t">
			<VoltageLevel name="V1" ${id}="vl-t">
				<Bay name="B1" ${id}="bay-t"/>
			</VoltageLevel>
		</Substation>
	</SCL>`

async function instantiateInto(): Promise<{
	source: Awaited<ReturnType<typeof createSclTestProject>>['source']
	target: NonNullable<Awaited<ReturnType<typeof createSclTestProject>>['target']>
}> {
	const { source, target } = await createSclTestProject({ sourceXml, targetXml: emptyTargetXml })
	if (!target) throw new Error('target required')
	await target.document.transaction(async (tx) => {
		await instantiateAsd(tx, {
			sourceQuery: source.document.query,
			applicationRef,
			targetParent: bayRef,
		})
	})
	return { source, target }
}

describe('repro — ASD application instantiate w/ FunctionCategory satellite (Current Transformer)', () => {
	// SYMPTOM 2 (application instantiate): the nested SubCategory + every FunctionCatRef created.
	it('instantiate creates FunctionCategory > SubCategory > 4 FunctionCatRef', async () => {
		const { target } = await instantiateInto()

		const xml = (await target.document.query.getSnapshot({ as: 'xml' })) as string
		const subCategories = xml.match(/<(?:[A-Za-z0-9.-]+:)?SubCategory\b/g) ?? []
		const funcCatRefs = xml.match(/<(?:[A-Za-z0-9.-]+:)?FunctionCatRef\b/g) ?? []
		expect(subCategories.length, 'one SubCategory instantiated').toBe(1)
		expect(funcCatRefs.length, 'all four nested FunctionCatRef instantiated').toBe(4)
	})

	// SYMPTOM 3 (application update, unchanged template): re-report must be a clean no-op.
	it('re-report after instantiate (unchanged template): nothing falsely removed', async () => {
		const { source, target } = await instantiateInto()

		const rep = await report(target.document.query, {
			verb: 'asd',
			sourceQuery: source.document.query,
			ref: applicationRef,
			anchor: bayRef,
		})

		const falselyRemoved = allGroups(rep).filter(
			(g) => g.change === 'removed' || g.change === 'target-only',
		)
		expect(
			falselyRemoved.map((g) => `${g.change}:${g.primary.tagName}`),
			'unchanged template must not classify anything removed/target-only',
		).toEqual([])
	})

	// SYMPTOM 1 (application instantiate): the composed function's FunctionCategory satellite is
	// folded AND part of the function instance's member cluster.
	it('instantiate report: satellite folded on the composed function AND in its memberIds', async () => {
		const { source, target } = await createSclTestProject({
			sourceXml,
			targetXml: emptyTargetXml,
		})
		if (!target) throw new Error('target required')

		const rep = await report(target.document.query, {
			verb: 'asd',
			sourceQuery: source.document.query,
			ref: applicationRef,
			anchor: bayRef,
			scenario: 'instantiate',
		})

		const groups = allGroups(rep)
		const functionGroup = groups.find((g) => g.primary.tagName === 'Function')
		expect(functionGroup, 'composed function group present').toBeDefined()
		const catCompanion = functionGroup?.companions.find((c) => c.tagName === 'FunctionCategory')
		expect(catCompanion, 'FunctionCategory folded as companion of the function group').toBeDefined()

		const fnInstance = rep.instances.find(
			(inst) => inst.tree.tagName === 'Function' && inst.groups.length > 0,
		)
		expect(fnInstance, 'a reported Function instance').toBeDefined()
		const members = new Set(fnInstance!.memberIds)
		const companionMemberIds = companionMemberSet(functionGroup ? [functionGroup] : [])
		const missing = [...companionMemberIds].filter((cid) => !members.has(cid))
		expect(missing, 'satellite companion ids are in the function memberIds').toEqual([])
	})

	// SYMPTOM 3 (application update, screenshot 3): applying an update against an UNCHANGED
	// template must not graft a DUPLICATE AllocationRole nor then classify the original
	// AllocationRoleRef as `removed`. Reproduces the accumulated-state duplicate PIU.
	it('update apply (unchanged template) does not duplicate the AllocationRole satellite', async () => {
		const { source, target } = await instantiateInto()

		const rep1 = await report(target.document.query, {
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
				report: rep1,
				decisions: new Map(),
			})
		})

		const xml = (await target.document.query.getSnapshot({ as: 'xml' })) as string
		const allocationRoles = xml.match(/<(?:[A-Za-z0-9.-]+:)?AllocationRole\b/g) ?? []
		const allocationRoleRefs = xml.match(/<(?:[A-Za-z0-9.-]+:)?AllocationRoleRef\b/g) ?? []
		expect(allocationRoles.length, 'no duplicate AllocationRole after update').toBe(1)
		expect(allocationRoleRefs.length, 'the AllocationRoleRef survives the update').toBe(1)

		const rep2 = await report(target.document.query, {
			verb: 'asd',
			sourceQuery: source.document.query,
			ref: applicationRef,
			anchor: bayRef,
		})
		const falselyRemoved = allGroups(rep2).filter(
			(g) => g.change === 'removed' || g.change === 'target-only',
		)
		expect(
			falselyRemoved.map((g) => `${g.change}:${g.primary.tagName}`),
			'a second re-report must still be a clean no-op',
		).toEqual([])
	})

	// SYMPTOM 3 (externally-authored project — real .ssd): the existing instance AllocationRole
	// carries a PLACEHOLDER templateUuid that is NOT the source uuid (rev19.ssd smears one dummy
	// across every element). Update must still RECOGNIZE it as the instance of the source
	// satellite (by name within lineage) and reconcile in place — never graft a DUPLICATE.
	it('update apply recognizes an externally-authored instance (dummy templateUuid) — no duplicate', async () => {
		const { source, target } = await instantiateInto()

		// Simulate external authoring: overwrite the instance AllocationRole's templateUuid with the
		// shared placeholder, breaking the uuid lineage the engine normally relies on.
		await target.document.transaction(async (tx) => {
			const roles = await tx.any.getRecordsByTagName('AllocationRole')
			for (const role of roles) {
				await tx.any.update(role, {
					attributes: { templateUuid: '123e4567-e89b-12d3-a456-789012345678' },
				})
			}
		})

		const rep1 = await report(target.document.query, {
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
				report: rep1,
				decisions: new Map(),
			})
		})

		const xml = (await target.document.query.getSnapshot({ as: 'xml' })) as string
		const allocationRoles = xml.match(/<(?:[A-Za-z0-9.-]+:)?AllocationRole\b/g) ?? []
		expect(
			allocationRoles.length,
			'externally-authored instance recognized by name — no duplicate AllocationRole',
		).toBe(1)
	})

	// SYMPTOM (user repro): instantiate, edit ONE composed Function's `desc` on the instance, then
	// update the ASD. Only that Function must report as modified; the Application (and everything
	// else) must stay UP TO DATE — no false-positive "outdated" instances.
	it('editing a composed Function desc does not falsely mark the Application outdated', async () => {
		const { source, target } = await instantiateInto()

		// edit the instance composed Function (CT_Fn) desc only
		await target.document.transaction(async (tx) => {
			for (const fn of await tx.any.getRecordsByTagName('Function')) {
				const { name, templateUuid } = await tx.any.getAttributes(fn)
				if (name === 'CT_Fn' && templateUuid)
					await tx.any.update(fn, { attributes: { desc: 'teset' } })
			}
		})

		const rep = await report(target.document.query, {
			verb: 'asd',
			sourceQuery: source.document.query,
			ref: applicationRef,
			anchor: bayRef,
		})

		const outdated = rep.instances
			.filter((inst) => inst.rootRef && !inst.upToDate)
			.map((inst) => `${inst.tree.tagName}:${inst.title}`)
		expect(outdated, 'only the edited Function is outdated — Application must not be').toEqual([
			'Function:CT_Fn',
		])
	})

	// SYMPTOM (user repro): the ASD instantiated TWICE. A shared satellite (AllocationRole) then
	// carries one FunctionRef per instantiated Function, all sharing one template-space identity.
	// The template has a single such ref, so the sibling instance refs must NOT be flagged removed —
	// re-reporting two clean instantiations must be a no-op, no false-positive "outdated".
	it('multi-instance: two clean instantiations report nothing outdated', async () => {
		const { source, target } = await instantiateInto()
		await target.document.transaction(async (tx) => {
			await instantiateAsd(tx, {
				sourceQuery: source.document.query,
				applicationRef,
				targetParent: bayRef,
			})
		})

		const rep = await report(target.document.query, {
			verb: 'asd',
			sourceQuery: source.document.query,
			ref: applicationRef,
			anchor: bayRef,
		})

		const outdated = rep.instances
			.filter((inst) => inst.rootRef && !inst.upToDate)
			.map((inst) => `${inst.tree.tagName}:${inst.title}`)
		expect(outdated, 'two clean instantiations — nothing outdated').toEqual([])
	})

	// Three instantiations + a mid-course desc edit on one Function: ONLY the edited Function is
	// outdated; every Application (and the other Functions) stay up to date.
	it('multi-instance: three instantiations + one desc edit outdates only that Function', async () => {
		const { source, target } = await instantiateInto()
		for (let i = 0; i < 2; i++) {
			await target.document.transaction(async (tx) => {
				await instantiateAsd(tx, {
					sourceQuery: source.document.query,
					applicationRef,
					targetParent: bayRef,
				})
			})
		}
		await target.document.transaction(async (tx) => {
			for (const fn of await tx.any.getRecordsByTagName('Function')) {
				const { name, templateUuid } = await tx.any.getAttributes(fn)
				if (name === 'CT_Fn' && templateUuid) {
					await tx.any.update(fn, { attributes: { desc: 'teset' } })
					break
				}
			}
		})

		const rep = await report(target.document.query, {
			verb: 'asd',
			sourceQuery: source.document.query,
			ref: applicationRef,
			anchor: bayRef,
		})

		const outdated = rep.instances
			.filter((inst) => inst.rootRef && !inst.upToDate)
			.map((inst) => `${inst.tree.tagName}:${inst.title}`)
		expect(outdated, 'only the edited Function outdated — no Application').toEqual([
			'Function:CT_Fn',
		])
	})

	// SYMPTOM (rev19): the shared AllocationRole is PRE-AUTHORED with a placeholder templateUuid (not
	// the source uuid), so the REPORT cannot recognise it by lineage and falsely classifies it as an
	// `added` satellite on EVERY Application instance. It must be recognised by name -> nothing added.
	it('report recognises a pre-authored shared satellite by name (dummy templateUuid)', async () => {
		const { source, target } = await instantiateInto()
		await target.document.transaction(async (tx) => {
			await instantiateAsd(tx, {
				sourceQuery: source.document.query,
				applicationRef,
				targetParent: bayRef,
			})
		})
		// simulate the pre-authored project: the shared AllocationRole carries a placeholder templateUuid
		await target.document.transaction(async (tx) => {
			for (const role of await tx.any.getRecordsByTagName('AllocationRole')) {
				await tx.any.update(role, {
					attributes: { templateUuid: '123e4567-e89b-12d3-a456-789012345678' },
				})
			}
		})

		const rep = await report(target.document.query, {
			verb: 'asd',
			sourceQuery: source.document.query,
			ref: applicationRef,
			anchor: bayRef,
		})

		const outdated = rep.instances
			.filter((inst) => inst.rootRef && !inst.upToDate)
			.map((inst) => `${inst.tree.tagName}:${inst.title}`)
		expect(outdated, 'shared satellite recognised by name — no Application falsely added').toEqual(
			[],
		)
	})

	// PROVENANCE (genuine removal): the SOURCE satellite drops a reference whose target lineage IS in
	// the source's own scope. The blanket keep would hide it; the provenance policy must classify the
	// instance satellite's now-orphaned ref as `removed` and outdate the carrying primary.
	it('provenance: a source-dropped satellite ref (in-scope target) is reported removed', async () => {
		const { source, target } = await instantiateInto()

		// Source AllocationRole "PIU" references CT_Fn (uuid fn-src) — an element in source scope.
		// Drop that reference in the SOURCE: a genuine removal, not a multi-instance sibling.
		await source.document.transaction(async (tx) => {
			await tx.delete({ tagName: 'FunctionRef', id: 'ar-fref-s' } as Scl.Ref<'FunctionRef'>)
		})

		const rep = await report(target.document.query, {
			verb: 'asd',
			sourceQuery: source.document.query,
			ref: applicationRef,
			anchor: bayRef,
		})

		const removedRefs = allGroups(rep).flatMap((g) =>
			collectRemoved(g).filter((n) => n.tagName === 'FunctionRef'),
		)
		expect(
			removedRefs.length,
			'the source-dropped AllocationRole FunctionRef is classified removed',
		).toBe(1)

		const outdated = rep.instances
			.filter((inst) => inst.rootRef && !inst.upToDate)
			.map((inst) => inst.tree.tagName)
		expect(outdated, 'the Application carrying the satellite is outdated').toContain('Application')
	})
})

function collectRemoved(node: {
	change?: string
	tagName: string
	companions?: unknown[]
	children?: unknown[]
	primary?: unknown
}): { change?: string; tagName: string }[] {
	const out: { change?: string; tagName: string }[] = []
	const walk = (n: { change?: string; tagName: string; children?: unknown[] }): void => {
		if (n.change === 'removed') out.push({ change: n.change, tagName: n.tagName })
		for (const child of (n.children as typeof out) ?? []) walk(child as never)
	}
	const anyNode = node as {
		primary?: { children?: unknown[]; tagName: string; change?: string }
		companions?: unknown[]
	}
	if (anyNode.primary) walk(anyNode.primary as never)
	for (const companion of anyNode.companions ?? []) walk(companion as never)
	return out
}

function companionMemberSet(groups: DecisionGroup[]): Set<string> {
	const ids = new Set<string>()
	const walk = (node: DecisionGroup['companions'][number]): void => {
		const ref = node.sourceRef ?? node.instanceRef
		if (ref?.id) ids.add(ref.id)
		for (const child of node.children) walk(child)
	}
	for (const group of groups) for (const companion of group.companions) walk(companion)
	return ids
}
