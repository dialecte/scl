// The setup of the `node` test project: the test helpers open their projects on the in-memory store.
import { useTestStorage } from '@dialecte/core/test'

useTestStorage({ type: 'inMemory' })
