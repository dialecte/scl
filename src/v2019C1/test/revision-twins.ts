import {
	REVISION_TWIN_FILES,
	REVISION_TWIN_FOLDER,
	REVISION_TWIN_INSTANCES,
	REVISION_TWINS,
} from './revision-twins.constants'

import type { RevisionTwin, RevisionTwinWithInstance, TwinRevision } from './revision-twins.types'

/** The XML of one revision of a revision twin. */
export function readRevisionTwin(params: { twin: RevisionTwin; revision: TwinRevision }): string {
	const { twin, revision } = params
	const { name, extension } = REVISION_TWINS[twin]
	const path = `${REVISION_TWIN_FOLDER}${name}.r${revision}.${extension}`
	const xml = REVISION_TWIN_FILES[path]
	if (xml === undefined) throw new Error(`revision twin: ${path} is not in the fixtures`)
	return xml
}

/** The XML of the project instance committed beside a revision twin. */
export function readRevisionTwinInstance(params: { twin: RevisionTwinWithInstance }): string {
	const { name } = REVISION_TWINS[params.twin]
	const { extension } = REVISION_TWIN_INSTANCES[params.twin]
	const path = `${REVISION_TWIN_FOLDER}${name}.instance.${extension}`
	const xml = REVISION_TWIN_FILES[path]
	if (xml === undefined) throw new Error(`revision twin: ${path} is not in the fixtures`)
	return xml
}
