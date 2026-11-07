import { createFileRoute, redirect } from '@tanstack/react-router'
import { AccountsPage, accountsSearch } from '#/components/AccountsPage'
import { listAccounts } from '#/server/accounts.functions'

export const Route = createFileRoute('/mine')({
  validateSearch: accountsSearch,
  beforeLoad: ({ context }) => {
    if (!context.me) throw redirect({ to: '/' })
  },
  loader: () => listAccounts(),
  component: Mine,
})

function Mine() {
  const data = Route.useLoaderData()
  const { me } = Route.useRouteContext()
  return <AccountsPage accounts={data.accounts} me={me} search={Route.useSearch()} scope="mine" />
}
