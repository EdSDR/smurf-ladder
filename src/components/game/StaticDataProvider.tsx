import { createContext, useContext } from 'react'
import type { StaticData } from '#/server/staticData'

const Ctx = createContext<StaticData | null>(null)

export function StaticDataProvider({ data, children }: { data: StaticData | null; children: React.ReactNode }) {
  return <Ctx.Provider value={data}>{children}</Ctx.Provider>
}

/** Static game data, or null until the first daily refresh has run. */
export function useStaticData() {
  return useContext(Ctx)
}

export function useChampion(id: number) {
  const data = useStaticData()
  const entry = data?.champions[id]
  return { name: entry?.[0] ?? 'Unknown champion', alias: entry?.[1] ?? null }
}
