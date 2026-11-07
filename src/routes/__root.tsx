import { HeadContent, Link, Scripts, createRootRoute } from '@tanstack/react-router'
import { Toaster } from '#/components/ui/sonner'
import { TooltipProvider } from '#/components/ui/tooltip'
import { SiteHeader } from '#/components/SiteHeader'
import { getMe } from '#/server/auth.functions'
import { VaultProvider } from '#/vault/VaultProvider'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  beforeLoad: async () => ({ me: await getMe() }),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Smurf Ladder' },
      { name: 'description', content: 'Every shared League account on one ladder, so you know which one to play.' },
      { name: 'theme-color', content: '#0f1a24' },
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
    <main className="mx-auto max-w-6xl px-4 py-24">
      <h1 className="wide text-2xl font-extrabold">This page didn’t load</h1>
      <p className="mt-2 max-w-[60ch] text-muted-foreground">{(error as Error).message}</p>
      <a href="/" className="mt-4 inline-block underline underline-offset-4">
        Reload the ladder
      </a>
    </main>
  ),
  notFoundComponent: () => (
    <main className="mx-auto max-w-6xl px-4 py-24">
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
  const { me } = Route.useRouteContext()
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="flex min-h-dvh flex-col">
        <VaultProvider memberId={me?.id ?? null}>
          <TooltipProvider>
            <SiteHeader me={me} />
            <div className="flex-1">{children}</div>
            <footer className="border-t">
              <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground">
                <p className="max-w-[72ch]">
                  Smurf Ladder isn’t endorsed by Riot Games and doesn’t reflect the views or opinions of Riot Games or anyone officially
                  involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or
                  registered trademarks of Riot Games, Inc.
                </p>
              </div>
            </footer>
          </TooltipProvider>
          <Toaster position="bottom-center" />
        </VaultProvider>
        <Scripts />
      </body>
    </html>
  )
}
