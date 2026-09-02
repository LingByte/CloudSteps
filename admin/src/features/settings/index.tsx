import { Outlet, useRouterState } from '@tanstack/react-router'
import {
  Bell,
  History,
  Palette,
  ScrollText,
  Ticket,
  UserCog,
  Wallet,
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { SidebarNav } from './components/sidebar-nav'

const sidebarNavItems = [
  {
    title: '个人资料',
    href: '/settings',
    icon: <UserCog size={18} />,
  },
  {
    title: '邀请码',
    href: '/settings/invite-code',
    icon: <Ticket size={18} />,
  },
  {
    title: '账户充值',
    href: '/settings/recharge',
    icon: <Wallet size={18} />,
  },
  {
    title: '通知',
    href: '/settings/notifications',
    icon: <Bell size={18} />,
  },
  {
    title: '外观',
    href: '/settings/appearance',
    icon: <Palette size={18} />,
  },
  {
    title: '登录历史',
    href: '/settings/login-history',
    icon: <History size={18} />,
  },
  {
    title: '操作日志',
    href: '/settings/operation-logs',
    icon: <ScrollText size={18} />,
  },
]

// 这些子页面自带 AdminPage（含 Header），不需要 settings layout 的侧边栏布局
const FULL_PAGE_ROUTES = ['/settings/login-history', '/settings/operation-logs']

export function Settings() {
  const path = useRouterState({ select: (s) => s.location.pathname })
  const isFullPage = FULL_PAGE_ROUTES.some((r) => path.startsWith(r))

  if (isFullPage) {
    return <Outlet />
  }

  return (
    <>
      {/* ===== Top Heading ===== */}
      <Header>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>

      <Main fixed>
        <div className='space-y-0.5'>
          <h1 className='text-2xl font-bold tracking-tight md:text-3xl'>
            设置
          </h1>
          <p className='text-muted-foreground'>
            查看账号信息、站内信通知并调整外观。
          </p>
        </div>
        <Separator className='my-4 lg:my-6' />
        <div className='flex min-h-0 flex-1 flex-col space-y-2 overflow-hidden md:space-y-2 lg:flex-row lg:space-y-0 lg:space-x-12'>
          <aside className='top-0 lg:sticky lg:w-1/5'>
            <SidebarNav items={sidebarNavItems} />
          </aside>
          <div className='flex min-h-0 w-full flex-1 overflow-hidden p-1'>
            <Outlet />
          </div>
        </div>
      </Main>
    </>
  )
}
