import { diff } from './diff'

import { describe, expect, it } from 'vitest'

import {
	ALL_XMLNS_NAMESPACES,
	createSclTestProject,
	CUSTOM_RECORD_ID_ATTRIBUTE,
} from '@/v2019C1/test'

import type { Scl } from '@/v2019C1/config'

const id = CUSTOM_RECORD_ID_ATTRIBUTE
const ns = ALL_XMLNS_NAMESPACES

// Reproduces the real Test_System .ssd condition (screenshot 3): the project was authored with
// a PLACEHOLDER templateUuid smeared across elements ("123e4567-...") and READABLE uuids
// ("PIU_AR"), so the instance AllocationRole's `templateUuid` is NOT the source AllocationRole's
// own `uuid`. The engine matches references by normalizing the instance target uuid to its
// element's `templateUuid` and comparing to the source uuid — which fails here, so the
// Application's AllocationRoleRef is FALSELY classified `removed` on update, even though the
// template is unchanged and the ref still resolves (by path/name) to the same "PIU".
const sourceXml = /* xml */ `
	<SCL ${ns} ${id}="asd-src">
		<Substation name="TEMPLATE" ${id}="sub-s">
			<Private type="eIEC61850-6-100" ${id}="priv-s">
				<eIEC61850-6-100:Application name="CT_App" uuid="app-src" ${id}="app-s">
					<eIEC61850-6-100:AllocationRoleRef allocationRole="TEMPLATE/PIU" allocationRoleUuid="piu-src" ${id}="arref-s"/>
				</eIEC61850-6-100:Application>
				<eIEC61850-6-100:AllocationRole name="PIU" uuid="piu-src" ${id}="ar-s">
					<eIEC61850-6-100:FunctionRef function="TEMPLATE/CT_Fn" functionUuid="fn-src" ${id}="ar-fref-s"/>
				</eIEC61850-6-100:AllocationRole>
			</Private>
		</Substation>
	</SCL>`

// Instance: Application matches by templateUuid (app-src). Its AllocationRoleRef points to the
// instance "PIU" (uuid PIU_AR) whose templateUuid is the PLACEHOLDER (123e4567), NOT piu-src.
const instanceXml = /* xml */ `
	<SCL ${ns} ${id}="scd">
		<Substation name="S1" ${id}="sub-t">
			<Private type="eIEC61850-6-100" ${id}="priv-t">
				<eIEC61850-6-100:Application name="CT_App" uuid="app-inst" templateUuid="app-src" ${id}="app-i">
					<eIEC61850-6-100:AllocationRoleRef allocationRole="S1/PIU" allocationRoleUuid="PIU_AR" ${id}="arref-i"/>
				</eIEC61850-6-100:Application>
				<eIEC61850-6-100:AllocationRole name="PIU" uuid="PIU_AR" templateUuid="123e4567-e89b-12d3-a456-789012345678" ${id}="ar-i">
					<eIEC61850-6-100:FunctionRef function="S1/CT_Fn" functionUuid="fn-inst" ${id}="ar-fref-i"/>
				</eIEC61850-6-100:AllocationRole>
			</Private>
		</Substation>
	</SCL>`

describe('engine.diff — AllocationRoleRef survives when instance templateUuid != source uuid', () => {
	it('does not falsely classify the AllocationRoleRef as removed (placeholder templateUuid project)', async () => {
		const { source, target } = await createSclTestProject({ sourceXml, targetXml: instanceXml })
		if (!target) throw new Error('target required')

		const report = await diff({
			sourceQuery: source.document.query,
			targetQuery: target.document.query,
			sourceRootRef: { tagName: 'Application', id: 'app-s' } as Scl.Ref<'Application'>,
			instanceRootRef: { tagName: 'Application', id: 'app-i' } as Scl.Ref<'Application'>,
		})

		const removedRefs = report.groups.filter(
			(g) => g.change === 'removed' && g.primary.tagName === 'AllocationRoleRef',
		)
		expect(
			removedRefs,
			'AllocationRoleRef must match by its resolvable path/name, not only templateUuid',
		).toHaveLength(0)
	})
})
