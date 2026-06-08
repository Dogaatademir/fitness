import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Home, Dumbbell, ListChecks, UtensilsCrossed, Activity } from 'lucide-react'

const NAV_HIDDEN_PATHS = ['/workout/start']

const navItems = [
  { to: '/workout',   label: 'Antrenman', icon: Dumbbell        },
  { to: '/programs',  label: 'Program',   icon: ListChecks      },
  { to: '/',          label: 'Ana Sayfa', icon: Home            },
  { to: '/nutrition', label: 'Beslenme',  icon: UtensilsCrossed },
  { to: '/body',      label: 'İlerleme',  icon: Activity        },
]

export default function MainLayout() {
  const location = useLocation()
  const hideNav = NAV_HIDDEN_PATHS.some(p => location.pathname.startsWith(p))

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#f5f3ef' }}>
      <main
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: hideNav ? 0 : 'calc(6rem + env(safe-area-inset-bottom))' }}
      >
        <Outlet />
      </main>

      <nav
        className={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-200 ${
          hideNav ? 'translate-y-full' : ''
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)', background: 'transparent' }}
      >
        <div className="px-4 pb-4">
          <div
            className="flex items-center rounded-3xl overflow-hidden"
            style={{
              background: '#efecea',
              boxShadow: '0 8px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)',
              height: '4rem',
            }}
          >
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className="flex-1 h-full"
              >
                {({ isActive }) => (
                  <div className="relative flex flex-col items-center justify-center gap-1 h-full">
                    <Icon
                      size={20}
                      strokeWidth={isActive ? 2.4 : 1.6}
                      style={{ color: isActive ? '#1a1714' : 'rgba(26,23,20,0.35)' }}
                    />
                    <span style={{
                      fontSize: 10,
                      fontWeight: isActive ? 700 : 500,
                      letterSpacing: '0.01em',
                      color: isActive ? '#1a1714' : 'rgba(26,23,20,0.35)',
                    }}>
                      {label}
                    </span>
                    {isActive && (
                      <span style={{
                        position: 'absolute',
                        bottom: 0,
                        width: 24,
                        height: 3,
                        borderRadius: '2px 2px 0 0',
                        background: '#1a1714',
                      }} />
                    )}
                  </div>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>
    </div>
  )
}
