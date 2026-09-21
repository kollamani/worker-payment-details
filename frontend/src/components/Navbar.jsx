import React, { useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutGrid, Users, PlusCircle, UserSearch, ClipboardList, LogOut, Wallet, Menu, X, ChevronDown, UserCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Navbar = () => {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [workspaceOpen, setWorkspaceOpen] = React.useState(false);
  const workspaceRef = useRef(null);

  // Close the "My Workspace" menu on outside click / Escape.
  useEffect(() => {
    if (!workspaceOpen) return undefined;
    const handlePointerDown = (event) => {
      if (workspaceRef.current && !workspaceRef.current.contains(event.target)) setWorkspaceOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setWorkspaceOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [workspaceOpen]);

  const handleLogout = () => {
    setMobileOpen(false);
    setWorkspaceOpen(false);
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
    { to: '/members', label: 'Members', icon: Users },
    { to: '/transactions/new', label: 'Transactions', icon: PlusCircle },
    { to: '/users', label: 'Views', icon: UserSearch },
    { to: '/task-notes', label: 'Task Notes', icon: ClipboardList },
  ];

  const linkClass = ({ isActive }) =>
    `flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
      isActive ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-brand-50 hover:text-brand-700'
    }`;

  return (
    <nav className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto max-w-[90rem] px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-16 items-center justify-between gap-3">
          <NavLink to="/dashboard" className="flex min-w-0 items-center gap-2 text-base font-bold text-brand-700 sm:text-lg">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <Wallet size={18} />
            </span>
            <span className="truncate">Ledger Tracker</span>
          </NavLink>

          <div className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={linkClass}>
                <Icon size={16} /> <span className="whitespace-nowrap">{label}</span>
              </NavLink>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {/* "My Workspace" dropdown — identity + quick navigation. */}
            <div className="relative hidden sm:block" ref={workspaceRef}>
              <button
                type="button"
                onClick={() => setWorkspaceOpen((open) => !open)}
                aria-expanded={workspaceOpen}
                aria-haspopup="menu"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
              >
                <UserCircle2 size={17} className="text-brand-600" />
                <span className="max-w-32 truncate">My Workspace</span>
                <ChevronDown size={14} className={`transition-transform duration-200 ${workspaceOpen ? 'rotate-180' : ''}`} />
              </button>

              {workspaceOpen && (
                <div role="menu" className="absolute right-0 z-40 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {admin?.name || admin?.username || 'Workspace'}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {admin?.username ? `@${admin.username}` : 'Signed in'}
                    </p>
                  </div>
                  <div className="my-1 h-px bg-slate-100" />
                  {navItems.map(({ to, label, icon: Icon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      role="menuitem"
                      onClick={() => setWorkspaceOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                    >
                      <Icon size={15} /> {label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleLogout}
              className="hidden items-center gap-1 rounded-full px-3 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 sm:flex"
            >
              <LogOut size={16} /> Logout
            </button>
            <button
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              className="inline-flex items-center justify-center rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 lg:hidden"
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation"
              aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            >
              {mobileOpen ? <X size={21} /> : <Menu size={21} />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div id="mobile-navigation" className="border-t border-slate-100 py-3 lg:hidden">
            <div className="grid gap-1">
              {navItems.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} onClick={() => setMobileOpen(false)} className={linkClass}>
                  <Icon size={17} /> <span>{label}</span>
                </NavLink>
              ))}
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
              >
                <LogOut size={17} /> Logout
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
