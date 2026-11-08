import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/members/$id')({
  beforeLoad: ({ context }) => {
    if (!context.me) throw redirect({ to: '/' })
  },
  component: () => <main className="mx-auto max-w-6xl px-4 py-12 text-muted-foreground">Member is coming next.</main>,
})
