'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@/hooks/use-user'
import { useSubscription } from '@/hooks/use-subscription'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  FileText,
  Users,
  CreditCard,
  BarChart3,
  LogOut,
  ChevronLeft,
  Menu,
  Activity,
  Package,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useState } from 'react'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Documentos', href: '/documentos', icon: FileText, badge: true },
  { name: 'Items', href: '/items', icon: Package },
  { name: 'Proveedores', href: '/proveedores', icon: Users },
  { name: 'Pagos', href: '/pagos', icon: CreditCard },
  { name: 'Estadísticas', href: '/estadisticas', icon: BarChart3 },
  { name: 'Procesamiento', href: '/procesamiento', icon: Activity, logsBadge: true },
]

interface SidebarContentProps {
  pathname: string
  user: { nombre?: string } | null
  isAdmin: boolean
  subscription: { plan_nombre?: string } | null
  signOut: () => void
  pendingCount?: number
  unreadLogsCount?: number
  collapsed?: boolean
  onCollapse?: () => void
}

function SidebarContent({
  pathname,
  user,
  isAdmin,
  subscription,
  signOut,
  pendingCount = 0,
  unreadLogsCount = 0,
  collapsed = false,
  onCollapse,
}: SidebarContentProps) {
  return (
    <aside
      className={cn(
        'bg-slate-950 flex flex-col h-screen transition-all duration-300',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-slate-800">
        {!collapsed && (
          <span className="text-lg font-semibold text-white tracking-tight">
            AXP
          </span>
        )}
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <ChevronLeft
              className={cn(
                'h-4 w-4 transition-transform',
                collapsed && 'rotate-180'
              )}
            />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href))
          const Icon = item.icon
          const showBadge = item.badge && pendingCount > 0
          const showLogsBadge = (item as any).logsBadge && unreadLogsCount > 0
          const badgeCount = showBadge ? pendingCount : showLogsBadge ? unreadLogsCount : 0
          const badgeColor = showLogsBadge ? 'bg-red-500' : 'bg-amber-500'

          return (
            <Link
              key={item.name}
              href={item.href as '/'}
              className={cn(
                'flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors group relative',
                isActive
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
              )}
              title={collapsed ? item.name : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1">{item.name}</span>
                  {(showBadge || showLogsBadge) && (
                    <span className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium text-white',
                      badgeColor
                    )}>
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </>
              )}
              {collapsed && (showBadge || showLogsBadge) && (
                <span className={cn(
                  'absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-medium text-white',
                  badgeColor
                )}>
                  {badgeCount > 9 ? '9+' : badgeCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-800 p-3 space-y-3">
        {!collapsed && subscription && (
          <div className="px-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">
              Plan
            </p>
            <p className="text-xs text-slate-300 truncate">
              {subscription.plan_nombre}
            </p>
          </div>
        )}
        <div
          className={cn(
            'flex items-center',
            collapsed ? 'justify-center' : 'justify-between px-2'
          )}
        >
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white truncate">
                {user?.nombre?.split(' ')[0]}
              </p>
              <p className="text-xs text-slate-500">
                {isAdmin ? 'Admin' : 'Lectura'}
              </p>
            </div>
          )}
          <button
            onClick={() => signOut()}
            className={cn(
              'p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors',
              collapsed && 'mx-auto'
            )}
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}

interface SidebarProps {
  pendingCount?: number
  unreadLogsCount?: number
}

export function Sidebar({ pendingCount = 0, unreadLogsCount = 0 }: SidebarProps) {
  const pathname = usePathname()
  const { user, signOut, isAdmin } = useUser()
  const { subscription } = useSubscription()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden lg:block sticky top-0 h-screen">
        <SidebarContent
          pathname={pathname}
          user={user}
          isAdmin={isAdmin}
          subscription={subscription}
          signOut={signOut}
          pendingCount={pendingCount}
          unreadLogsCount={unreadLogsCount}
          collapsed={collapsed}
          onCollapse={() => setCollapsed(!collapsed)}
        />
      </div>

      {/* Mobile Sidebar (Sheet) */}
      <div className="lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="fixed top-3 left-3 z-40 bg-white shadow-md border"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-56 bg-slate-950 border-slate-800">
            <SidebarContent
              pathname={pathname}
              user={user}
              isAdmin={isAdmin}
              subscription={subscription}
              signOut={signOut}
              pendingCount={pendingCount}
              unreadLogsCount={unreadLogsCount}
            />
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}
