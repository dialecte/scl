import { assertCorpusV2Listing, isCorpusV2Synced } from './corpus-v2-smoke'

import { describe, it } from 'vitest'

describe.skipIf(!isCorpusV2Synced())('corpus V2 listing', () => {
	it('the synced files are exactly the listed files', assertCorpusV2Listing)
})
