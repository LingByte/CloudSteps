import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { useAuthStore, type AuthUser } from '@/stores/auth-store'
import { get } from '@/lib/api'
import { getCookie } from '@/lib/cookies'
import { currentPath } from '@/lib/current-path'
import { cn } from '@/lib/utils'
import { LayoutProvider } from '@/context/layout-provider'
import { SearchProvider } from '@/context/search-provider'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { SkipToMain } from '@/components/skip-to-main'

type AuthenticatedLayoutProps = {
  children?: React.ReactNode
}

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const defaultOpen = getCookie('sidebar_state') !== 'false'
  const { auth } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  // demo 模式（GitHub Pages 预览）：跳过登录校验，直接放行看 UI
  const demoMode = import.meta.env.VITE_DEMO_MODE === '1'
  const [ready, setReady] = useState(!auth.accessToken || demoMode)

  useEffect(() => {
    if (demoMode) {
      if (!auth.user) {
        auth.setUser({
          accountNo: 'demo',
          email: 'demo@cloudsteps.example',
          role: ['admin'],
          exp: Date.now() + 24 * 60 * 60 * 1000,
          displayName: '演示账号',
          username: 'demo',
        })
      }
      return
    }

    if (!auth.accessToken) {
      navigate({
        to: '/sign-in',
        search: { redirect: currentPath(location) },
        replace: true,
      })
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const res = await get<{
          id?: number
          email?: string
          displayName?: string
          username?: string
          role?: string
          avatar?: string
        }>('/auth/info')
        if (cancelled) return
        const u = res.data
        const user: AuthUser = {
          id: u.id,
          accountNo: String(u.username ?? u.id ?? u.email ?? ''),
          email: String(u.email ?? u.username ?? ''),
          displayName: u.displayName,
          username: u.username,
          avatar: u.avatar,
          role: u.role ? [u.role] : ['admin'],
          exp: Date.now() + 24 * 60 * 60 * 1000,
        }
        auth.setUser(user)
      } catch (e: unknown) {
        if (cancelled) return
        const status =
          e && typeof e === 'object' && 'status' in e
            ? Number((e as { status?: number }).status)
            : e && typeof e === 'object' && 'response' in e
              ? Number(
                  (e as { response?: { status?: number } }).response?.status
                )
              : undefined
        if (status === 401 || status === 403) {
          auth.reset()
          navigate({
            to: '/sign-in',
            search: { redirect: currentPath(location) },
            replace: true,
          })
          return
        }
      } finally {
        if (!cancelled) setReady(true)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.accessToken])

  if ((!auth.accessToken && !demoMode) || !ready) {
    return (
      <div className='flex h-svh items-center justify-center text-sm text-muted-foreground'>
        正在验证登录状态…
      </div>
    )
  }

  return (
    <SearchProvider>
      <LayoutProvider>
        <SidebarProvider defaultOpen={defaultOpen}>
          <SkipToMain />
          <AppSidebar />
          <SidebarInset
            className={cn(
              '@container/content',
              'has-data-[layout=fixed]:h-svh has-data-[layout=fixed]:overflow-hidden',
              'peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100svh-(var(--spacing)*4))]'
            )}
          >
            {children ?? <Outlet />}
          </SidebarInset>
        </SidebarProvider>
      </LayoutProvider>
    </SearchProvider>
  )
}
