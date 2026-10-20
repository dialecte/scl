/// <reference types="vite/client" />
/**
 * Test setup of this package: the output check validates against the schema files synced into this folder
 * (`npm run xsd:sync`), read the first time a test validates. The files are not committed: without them the XSD
 * validator does not run, the other checks do, and the vitest config says so once per run. A package using the test
 * helpers says where its own copy is (see `configureSclXsdSchemas`).
 */
import { configureSclXsdSchemas } from '../../scl-xsd'
import { SCL_XSD_FILE_NAMES } from '../../scl-xsd.constants'

const SCHEMA_LOADERS = import.meta.glob<string>('./*.xsd', { query: '?raw', import: 'default' })

// the validator runs only on the whole set: a partial copy is the same as none (the vitest config says which)
const synced = new Set(
	Object.keys(SCHEMA_LOADERS).map((path) => path.slice(path.lastIndexOf('/') + 1)),
)
if (SCL_XSD_FILE_NAMES.every((name) => synced.has(name))) {
	configureSclXsdSchemas({ load: loadFixtureSchemas })
}

async function loadFixtureSchemas(): Promise<Record<string, string>> {
	const texts: Record<string, string> = {}
	for (const [path, load] of Object.entries(SCHEMA_LOADERS)) {
		texts[path.slice(path.lastIndexOf('/') + 1)] = await load()
	}
	return texts
}
