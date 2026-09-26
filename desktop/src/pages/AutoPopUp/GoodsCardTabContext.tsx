import { createContext, useContext, useMemo, useState } from 'react'

export type GoodsCardTab = 'goods-list' | 'shortcuts'

interface GoodsCardTabContextValue {
  tab: GoodsCardTab
  setTab: (tab: GoodsCardTab) => void
}

const GoodsCardTabContext = createContext<GoodsCardTabContextValue | null>(null)

export function GoodsCardTabProvider({ children }: { children: React.ReactNode }) {
  const [tab, setTab] = useState<GoodsCardTab>('goods-list')
  const value = useMemo(() => ({ tab, setTab }), [tab])
  return <GoodsCardTabContext.Provider value={value}>{children}</GoodsCardTabContext.Provider>
}

export function useGoodsCardTab() {
  return useContext(GoodsCardTabContext)
}
