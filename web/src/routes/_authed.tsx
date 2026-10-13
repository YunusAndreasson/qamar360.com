import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useMatchRoute,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import {
  ChartLine,
  CircleCheckBig,
  Compass,
  ListTodo,
  LogOut,
  Repeat2,
} from 'lucide-react'

import { MakerSignature } from '#/components/maker-signature'
import { QamarBrandName, QamarMark } from '#/components/qamar-logo'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '#/components/ui/breadcrumb'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Separator } from '#/components/ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '#/components/ui/sidebar'
import { supabaseBrowser } from '#/lib/supabase/client'
import { getShellFn } from '#/server/auth'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async () => {
    const { user, sidebarOpen } = await getShellFn()
    if (!user) throw redirect({ to: '/login' })
    return { user, sidebarOpen }
  },
  component: AuthedLayout,
})

const NAV = [
  { to: '/habits', label: 'Habits', icon: CircleCheckBig },
  { to: '/routines', label: 'Routines', icon: Repeat2 },
  { to: '/plans', label: 'Plans', icon: ListTodo },
  { to: '/progress', label: 'Progress', icon: ChartLine },
  { to: '/discover', label: 'Discover', icon: Compass },
] as const

function AuthedLayout() {
  const { user, sidebarOpen } = Route.useRouteContext()
  const navigate = useNavigate()
  const router = useRouter()
  const matchRoute = useMatchRoute()

  async function signOut() {
    await supabaseBrowser.auth.signOut()
    await router.invalidate()
    await navigate({ to: '/login' })
  }

  // `fuzzy` is what keeps the parent section lit on a detail route — /plans/$id must not
  // un-highlight Plans.
  const section = NAV.find((item) => matchRoute({ to: item.to, fuzzy: true }))
  const initial = (user.email ?? '?').charAt(0).toUpperCase()

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link to="/habits">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground">
                    <QamarMark size={18} />
                  </div>
                  <QamarBrandName className="truncate font-semibold tracking-tight" />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.label}
                      isActive={item.to === section?.to}
                    >
                      <Link to={item.to}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg">
                    <Avatar className="size-8 rounded-lg">
                      <AvatarFallback className="rounded-lg">{initial}</AvatarFallback>
                    </Avatar>
                    <span className="truncate text-sm">{user.email}</span>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-56">
                  <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                    {user.email}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut}>
                    <LogOut />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="px-1 pb-1 group-data-[collapsible=icon]:hidden">
            <MakerSignature />
          </div>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>{section?.label ?? 'Qamar360'}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
