const REPO = 'https://github.com/EdSDR/smurf-ladder'

const link = 'text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline'

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="grid gap-3">
          <div className="flex items-center gap-2">
            {/* The ladder mark again, small: one step per tier band the app cares about. */}
            <svg viewBox="0 0 24 20" className="h-4 w-5" aria-hidden>
              <rect x="0" y="14" width="6" height="6" fill="var(--tier-bronze)" />
              <rect x="9" y="8" width="6" height="12" fill="var(--tier-gold)" />
              <rect x="18" y="2" width="6" height="18" fill="var(--tier-master)" />
            </svg>
            <span className="wide text-sm font-extrabold tracking-tight">Smurf Ladder</span>
          </div>
          <p className="max-w-[60ch] text-sm text-pretty text-muted-foreground">
            Ranks come from the Riot API and refresh every few minutes. Decay countdowns are estimates; your client shows the exact
            number.
          </p>
        </div>

        <nav aria-label="Project" className="flex flex-wrap gap-x-6 gap-y-2 text-sm sm:justify-end">
          <a href={REPO} className={link} target="_blank" rel="noreferrer">
            Source code
          </a>
          <a href={`${REPO}#self-hosting`} className={link} target="_blank" rel="noreferrer">
            Host your own
          </a>
          <a href={`${REPO}/security/advisories/new`} className={link} target="_blank" rel="noreferrer">
            Report a security issue
          </a>
        </nav>

        <div className="border-t pt-6 sm:col-span-2">
          <p className="max-w-[90ch] text-xs leading-relaxed text-muted-foreground/80">
            Smurf Ladder isn’t endorsed by Riot Games and doesn’t reflect the views or opinions of Riot Games or anyone officially
            involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or
            registered trademarks of Riot Games, Inc.
          </p>
        </div>
      </div>
    </footer>
  )
}
