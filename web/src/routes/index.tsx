import { createFileRoute, redirect } from '@tanstack/react-router'

import { getUserFn } from '#/server/auth'

/** Entry — send signed-in users to their habits, everyone else to sign-in. */
export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const user = await getUserFn()
    throw redirect({ to: user ? '/habits' : '/login' })
  },
})
