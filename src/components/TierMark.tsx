import { cn } from '#/lib/utils'

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
