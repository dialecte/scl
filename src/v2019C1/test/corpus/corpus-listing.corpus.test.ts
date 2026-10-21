import { assertCorpusListing, isCorpusSynced } from './corpus-smoke'

import { describe, it } from 'vitest'

describe.skipIf(!isCorpusSynced())('corpus listing', () => {
	it('the synced files are exactly the listed files', assertCorpusListing)
})
