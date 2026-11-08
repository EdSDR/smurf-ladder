import { HeadContent, Link, Scripts, createRootRoute } from '@tanstack/react-router'
import { Toaster } from '#/components/ui/sonner'
import { TooltipProvider } from '#/components/ui/tooltip'
import { SiteFooter } from '#/components/SiteFooter'
import { SiteHeader } from '#/components/SiteHeader'
import { StaticDataProvider } from '#/components/game/StaticDataProvider'
import { getMe } from '#/server/auth.functions'
import { loadStaticData } from '#/server/static.functions'
import type { StaticData } from '#/server/staticData'
import { VaultProvider } from '#/vault/VaultProvider'
import appCss from '../styles.css?url'

// Champion names and icon maps change once a day; the browser fetches them once per visit.
let staticCache: StaticData | null = null

export const Route = createRootRoute({
  beforeLoad: async () => {
    const [me, staticData] = await Promise.all([getMe(), staticCache ? Promise.resolve(staticCache) : loadStaticData()])
    if (typeof window !== 'undefined' && staticData) staticCache = staticData
    return { me, staticData }
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Smurf Ladder' },
      { name: 'description', content: 'Every shared League account on one ladder, so you know which one to play.' },
      { name: 'theme-color', content: '#0c0e12' },
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    ],
  }),
  shellComponent: RootDocument,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-7xl px-4 py-24">
      <h1 className="wide text-2xl font-extrabold">This page didn’t load</h1>
      <p className="mt-2 max-w-[60ch] text-muted-foreground">{(error as Error).message}</p>
      <a href="/" className="mt-4 inline-block underline underline-offset-4">
        Reload the ladder
      </a>
    </main>
  ),
  notFoundComponent: () => (
    <main className="mx-auto max-w-7xl px-4 py-24">
      <h1 className="wide text-2xl font-extrabold">Nothing here</h1>
      <p className="mt-2 text-muted-foreground">
        That page doesn’t exist.{' '}
        <Link to="/" className="text-foreground underline underline-offset-4">
          Back to the ladder
        </Link>
      </p>
    </main>
  ),
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const { me, staticData } = Route.useRouteContext()
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="flex min-h-dvh flex-col">
        <VaultProvider memberId={me?.id ?? null}>
          <StaticDataProvider data={staticData}>
          <TooltipProvider>
            <SiteHeader me={me} />
            <div className="flex-1">{children}</div>
            <SiteFooter />
          </TooltipProvider>
          <Toaster position="bottom-center" />
          </StaticDataProvider>
        </VaultProvider>
        <Scripts />
      </body>
    </html>
  )
}
