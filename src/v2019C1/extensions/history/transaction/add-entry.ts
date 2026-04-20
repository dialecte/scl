import { getLatestHitem } from '../query'

import type { Scl } from '@/v2019C1/config'

export async function addEntry(
	tx: Scl.Transaction,
	params: {
		filename: string
		header: {
			id?: string
			fileType: Scl.AttributesValueObjectOf<'Header'>['fileType']
			nameStructure?: Scl.AttributesValueObjectOf<'Header'>['nameStructure']
			version: 'keep' | 'increment'
			tool: Scl.AttributesValueObjectOf<'Header'>['toolID']
		}
		item: {
			who: Scl.AttributesValueObjectOf<'Hitem'>['who']
			what: Scl.AttributesValueObjectOf<'Hitem'>['what']
			why: Scl.AttributesValueObjectOf<'Hitem'>['why']
		}
	},
): Promise<void> {
	const { filename, header, item } = params
	const { id, fileType, nameStructure, version: versionMode, tool } = header
	const { who, what, why } = item

	const root = await tx.getRoot()

	// Ensure Header
	const existingHeader = await tx.getRecord({ tagName: 'Header' })
	const headerRef =
		existingHeader ??
		(await tx.addChild(root, {
			tagName: 'Header',
			attributes: {
				id:
					id ??
					filename
						.replace(/\.[^.]+$/, '')
						.toLowerCase()
						.replace(/\s+/g, '_'),
				toolID: tool,
				fileType,
				...(nameStructure ? { nameStructure } : {}),
				version: '0',
				revision: '1',
				uuid: crypto.randomUUID(),
			},
		}))

	// Ensure History
	const existingHistory = await tx.getRecord({ tagName: 'History' })
	const historyRef =
		existingHistory ?? (await tx.addChild(headerRef, { tagName: 'History', attributes: {} }))

	// Compute version/revision from latest Hitem
	const lastHitem = await getLatestHitem(tx)
	const lastVersion = lastHitem?.attributes.find((a) => a.name === 'version')?.value
	const lastRevision = lastHitem?.attributes.find((a) => a.name === 'revision')?.value

	const computedVersion =
		versionMode === 'keep'
			? (lastVersion ?? '0')
			: lastVersion
				? String(Number(lastVersion) + 1)
				: '0'
	const computedRevision = lastRevision ? String(Number(lastRevision) + 1) : '1'

	// Update Header with new version/revision
	await tx.update(headerRef, {
		attributes: { version: computedVersion, revision: computedRevision },
	})

	// Format when
	const date = new Date()
	const parts = date.toString().split(' ')
	const timezone = date.toLocaleString('en', { timeZoneName: 'short' }).split(' ').pop()
	const formattedWhen = `${parts[0]} ${parts[1]} ${parts[2]} ${parts[4]} ${timezone} ${parts[3]}`

	await tx.addChild(historyRef, {
		tagName: 'Hitem',
		attributes: {
			version: computedVersion,
			revision: computedRevision,
			when: formattedWhen,
			who,
			what,
			why,
		},
	})

	await tx.update(headerRef, {
		attributes: { version: computedVersion, revision: computedRevision },
	})
}
