import { TIER_META, isTier } from '#/lib/tiers'
import { cn } from '#/lib/utils'

/** Our own tier glyph: a faceted diamond in the tier's color. Unranked is an empty outline. */
export function TierMark({ tier, className }: { tier: string | null | undefined; className?: string }) {
  const color = isTier(tier) ? TIER_META[tier].color : 'var(--muted-ink)'
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cn('size-3.5 shrink-0', className)}>
      {isTier(tier) ? (
        <>
          <path d="M8 1 15 8 8 15 1 8Z" fill={color} />
          <path d="M8 1 15 8H1Z" fill="white" fillOpacity={0.22} />
        </>
      ) : (
        <path d="M8 2 14 8 8 14 2 8Z" fill="none" stroke={color} strokeWidth={1.5} />
      )}
    </svg>
  )
}

export function profileIconUrl(iconId: number | null) {
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${iconId ?? 29}.jpg`
}

export function ProfileIcon({ iconId, className }: { iconId: number | null; className?: string }) {
  return (
    <img
      src={profileIconUrl(iconId)}
      alt=""
      loading="lazy"
      onError={(e) => {
        const fallback = profileIconUrl(null)
        if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback
      }}
      width={40}
      height={40}
      className={cn('size-10 shrink-0 rounded-md bg-panel-raised object-cover', className)}
    />
  )
}
