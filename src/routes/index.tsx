import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { AccountsPage, accountsSearch } from '#/components/AccountsPage'
import { listAccounts } from '#/server/accounts.functions'

const signinMessages: Record<string, string> = {
  'not-invited': 'That Discord account isn’t on the member list. Ask an admin to invite you.',
  failed: 'Discord sign-in didn’t finish. Try again.',
}

export const Route = createFileRoute('/')({
  validateSearch: accountsSearch.extend({ signin: accountsSearch.shape.q }),
  loader: () => listAccounts(),
  component: Home,
})

function Home() {
  const data = Route.useLoaderData()
  const { me } = Route.useRouteContext()
  const { signin, ...search } = Route.useSearch()
  const navigate = Route.useNavigate()

  useEffect(() => {
    if (signin && signinMessages[signin]) {
      toast.error(signinMessages[signin])
      navigate({ search: (s) => ({ ...s, signin: undefined }), replace: true })
    }
  }, [signin, navigate])

  return <AccountsPage accounts={data.accounts} me={me} search={search} scope="all" />
}
