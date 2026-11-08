import { champIconUrl, itemIconUrl, ROLE_NAMES, roleIconUrl, runeIconUrl, spellIconUrl, tierCrestUrl } from '#/lib/assets'
import { TIER_META, formatRank, isTier } from '#/lib/tiers'
import { cn } from '#/lib/utils'
import { useChampion, useStaticData } from './StaticDataProvider'

/** Riot's mini rank crest. Unranked accounts get a muted placeholder crest. */
export function TierCrest({ tier, className }: { tier: string | null | undefined; className?: string }) {
  return (
    <img
      src={tierCrestUrl(isTier(tier) ? tier : 'unranked')}
      alt={isTier(tier) ? TIER_META[tier].name : 'Unranked'}
      className={cn('size-6 shrink-0 object-contain', !isTier(tier) && 'opacity-60', className)}
      loading="lazy"
    />
  )
}

/** "◈ Diamond II 67 LP" in the tier's color. */
export function RankLabel({ tier, rank, lp, className, crest = true }: { tier: string | null; rank: string | null; lp?: number; className?: string; crest?: boolean }) {
  const color = isTier(tier) ? TIER_META[tier].color : 'var(--muted-ink)'
  return (
    <span className={cn('flex min-w-0 items-center gap-1.5', className)}>
      {crest && <TierCrest tier={tier} className="size-5" />}
      <span className="wide font-bold whitespace-nowrap" style={{ color }}>
        {formatRank(tier, rank)}
      </span>
      {lp !== undefined && isTier(tier) && <span className="nums whitespace-nowrap text-muted-foreground">{lp} LP</span>}
    </span>
  )
}

export function ChampIcon({
  id,
  size = 32,
  level,
  ring,
  className,
}: {
  id: number
  size?: number
  level?: number
  ring?: 'win' | 'loss'
  className?: string
}) {
  const { name } = useChampion(id)
  return (
    <span className={cn('relative inline-block shrink-0', className)} style={{ width: size, height: size }} title={name}>
      <img
        src={champIconUrl(id)}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        className={cn('size-full rounded-full bg-panel-raised object-cover', ring && 'ring-2 ring-offset-2 ring-offset-rift')}
        style={ring ? ({ '--tw-ring-color': `var(--${ring})` } as React.CSSProperties) : undefined}
      />
      {level !== undefined && (
        <span className="nums absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full bg-rift text-[11px] font-semibold ring-1 ring-line">
          {level}
        </span>
      )}
    </span>
  )
}

export function RoleIcon({ position, className }: { position: string | null; className?: string }) {
  if (!position) return <span className={cn('inline-block size-5', className)} aria-hidden />
  return <img src={roleIconUrl(position)} alt={ROLE_NAMES[position] ?? position} title={ROLE_NAMES[position]} className={cn('size-5 opacity-80', className)} loading="lazy" />
}

export function ItemIcon({ id, size = 22 }: { id: number; size?: number }) {
  const data = useStaticData()
  if (!id || !data) return <span className="inline-block rounded-sm bg-panel-raised" style={{ width: size, height: size }} aria-hidden />
  return <img src={itemIconUrl(data.version, id)} alt="" width={size} height={size} loading="lazy" className="rounded-sm" />
}

export function SpellIcon({ id, size = 18 }: { id: number; size?: number }) {
  const data = useStaticData()
  const file = data?.spells[id]
  if (!file || !data) return <span className="inline-block rounded-sm bg-panel-raised" style={{ width: size, height: size }} aria-hidden />
  return <img src={spellIconUrl(data.version, file)} alt="" width={size} height={size} loading="lazy" className="rounded-sm" />
}

export function RuneIcon({ id, size = 18 }: { id: number | null; size?: number }) {
  const data = useStaticData()
  const path = id ? data?.runes[id] : null
  if (!path) return <span className="inline-block" style={{ width: size, height: size }} aria-hidden />
  return <img src={runeIconUrl(path)} alt="" width={size} height={size} loading="lazy" />
}

/** "▲ 25 LP" / "▼ 18 LP" / "0 LP". The sign is in the text too, not just the color. */
export function LpChange({ value, className }: { value: number | null | undefined; className?: string }) {
  if (value === null || value === undefined) return null
  const up = value > 0
  const down = value < 0
  return (
    <span
      className={cn('nums inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold', className)}
      style={{
        color: up ? 'var(--gain)' : down ? 'var(--drop)' : 'var(--muted-ink)',
        background: `color-mix(in oklab, ${up ? 'var(--gain)' : down ? 'var(--drop)' : 'var(--muted-ink)'} 14%, transparent)`,
      }}
    >
      {up ? '▲' : down ? '▼' : ''}
      {up ? '+' : ''}
      {value} LP
    </span>
  )
}

export function PlacementBadge({ placement, badge }: { placement: number | null; badge: 'MVP' | 'ACE' | null }) {
  if (!placement) return <span className="rounded-md bg-panel-raised px-1.5 py-0.5 text-xs text-muted-foreground">Remake</span>
  const color = badge === 'MVP' ? 'var(--mvp)' : badge === 'ACE' ? 'var(--ace)' : 'var(--muted-ink)'
  const label = badge ?? `${placement}${placement === 2 ? 'nd' : placement === 3 ? 'rd' : 'th'}`
  return (
    <span className="nums rounded-md px-1.5 py-0.5 text-xs font-bold" style={{ color, background: `color-mix(in oklab, ${color} 16%, transparent)` }}>
      {label}
    </span>
  )
}

/** The splash-art banner behind account and member headers. */
export function SplashBanner({ championId, className, children }: { championId: number | null | undefined; className?: string; children: React.ReactNode }) {
  const { alias } = useChampion(championId ?? 0)
  return (
    <div className={cn('relative isolate overflow-hidden rounded-[10px] border', className)}>
      {alias && (
        <img
          src={`https://ddragon.leagueoflegends.com/cdn/img/champion/centered/${alias}_0.jpg`}
          alt=""
          className="banner-in absolute inset-0 -z-10 size-full object-cover object-[center_25%]"
        />
      )}
      {/* Fade the art into the page so text on the left and bottom stays readable. */}
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,var(--rift)_8%,color-mix(in_oklab,var(--rift)_70%,transparent)_45%,transparent_80%)]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(0deg,var(--rift)_0%,transparent_55%)]" />
      {children}
    </div>
  )
}
