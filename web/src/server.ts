import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

/**
 * The web app that used to live here (sign-in, habits, routines, discover, progress) was retired on
 * 2026-10-26: the site now only promotes the app. Its old addresses answer with a permanent
 * redirect to the home page, so a bookmark lands somewhere instead of on a 404.
 */
const RETIRED = new Set(['/login', '/habits', '/routines', '/discover', '/progress'])

export default createServerEntry({
  fetch(request) {
    const url = new URL(request.url)
    const path = url.pathname.replace(/\/+$/, '') || '/'
    if (RETIRED.has(path)) return Response.redirect(new URL('/', url), 301)
    return handler.fetch(request)
  },
})
