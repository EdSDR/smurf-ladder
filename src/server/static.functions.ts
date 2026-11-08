import { createServerFn } from '@tanstack/react-start'
import { getStaticData } from './staticData'

/** Champion names, spell and rune icons. Public and harmless; cached in memory on the server. */
export const loadStaticData = createServerFn({ method: 'GET' }).handler(async () => {
  return getStaticData()
})
