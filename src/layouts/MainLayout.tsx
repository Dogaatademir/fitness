import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Dumbbell, ListChecks,
  UtensilsCrossed, TrendingUp,
} from 'lucide-react'

const NAV_HIDDEN_PATHS = ['/workout/start']

const navItems = [
  { to: '/workout',   label: 'Antrenman',  icon: Dumbbell        },
  { to: '/programs',  label: 'Programlar', icon: ListChecks      },
  { to: '/',          label: 'Panel',      icon: LayoutDashboard },
  { to: '/nutrition', label: 'Beslenme',   icon: UtensilsCrossed },
  { to: '/body',      label: 'Vücut',      icon: TrendingUp      },
]

export default function MainLayout() {
  const location = useLocation()
  const hideNav = NAV_HIDDEN_PATHS.some(p => location.pathname.startsWith(p))

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#0d0d14' }}>
      <main
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: hideNav ? 0 : 'calc(5rem + env(safe-area-inset-bottom))' }}
      >
        <Outlet />
      </main>

      <nav
        className={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-200 ${
          hideNav ? 'translate-y-full' : ''
        }`}
        style={{
          background: '#111118',
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <div
          className="flex items-center"
          style={{ height: '4.5rem', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className="flex-1 h-full"
            >
              {({ isActive }) => (
                <div
                  className="flex flex-col items-center justify-center gap-1.5 h-full relative"
                  style={{ color: isActive ? '#e8e4dc' : 'rgba(255,255,255,0.22)' }}
                >
                  {isActive && (
                    <span
                      className="absolute top-0 left-1/2 -translate-x-1/2"
                      style={{
                        width: 20,
                        height: 2,
                        borderRadius: '0 0 2px 2px',
                        background: '#e8e4dc',
                      }}
                    />
                  )}
                  <Icon
                    size={18}
                    strokeWidth={isActive ? 2.2 : 1.6}
                  />
                  <span
                    className="leading-none"
                    style={{
                      fontSize: 9,
                      fontWeight: isActive ? 700 : 500,
                      letterSpacing: '0.04em',
                      color: isActive ? '#e8e4dc' : 'rgba(255,255,255,0.22)',
                    }}
                  >
                    {label}
                  </span>
                </div>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}