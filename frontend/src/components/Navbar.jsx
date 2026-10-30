import React, { useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutGrid,
  Users,
  PlusCircle,
  UserSearch,
  ClipboardList,
  LogOut,
  Wallet,
  Menu,
  X,
  ChevronDown,
  UserCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';

/**
 * Sticky glass top bar.
 *
 * Layout
 *   Left   — logo mark + "Ledger Tracker" wordmark
 *   Center — primary nav links (>= xl) as active-pill + subtle hover states
 *   Right  — grouped utility controls: theme toggle, workspace dropdown,
 *            logout (each with a clean 1px border + icon), hamburger < xl
 *
 * Glass shell — `backdrop-blur-md bg-slate-900/80 border-b border-slate-800`
 * in dark mode (with backdrop-saturate for a richer glass tint); an
 * equivalent light glass is used in light mode so the bar always matches
 * the active theme. All text colors ride the semantic ink/line tokens, which
 * keep every label at WCAG AA+ against whichever glass is showing.
 *
 * Responsive
 *   < sm   — logo + hamburger; menu carries theme, workspace identity,
 *            every link and logout
 *   sm–xl  — logo + theme + workspace + logout inline; hamburger keeps links
 *   >= xl  — full three-section bar, hamburger hidden
 */
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

  // While the mobile sheet is open: freeze the page beneath it (iOS momentum
  // scrolling would otherwise drag both layers) and close on Escape.
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileOpen]);

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

  const focusRing =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:focus-visible:ring-brand-400';

  // Shared pill for the center nav and the mobile menu: active route gets the
  // brand pill, idle routes get a quiet fill-on-hover. Icons render only in
  // the mobile menu (the center section stays text-only for breathing room).
  const linkClass = ({ isActive }) =>
    `flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition-colors duration-150 ${focusRing} ${
      isActive
        ? 'bg-brand-600 text-white shadow-sm'
        : 'text-ink-soft hover:bg-subtle hover:text-ink'
    }`;

  const workspaceIdentity = admin?.name || admin?.username || 'Workspace';
  const workspaceInitial = workspaceIdentity.trim().charAt(0).toUpperCase() || 'W';

  return (
    <>
      <nav className="sticky top-0 z-30 pt-safe border-b border-slate-200/80 bg-white/80 backdrop-blur-md backdrop-saturate-150 dark:border-slate-800 dark:bg-slate-900/80">
      <div className="mx-auto flex h-16 max-w-[90rem] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        {/* ── Left: logo + brand ─────────────────────────────────────────── */}
        <NavLink
          to="/dashboard"
          aria-label="Ledger Tracker — go to dashboard"
          className={`flex min-w-0 shrink-0 items-center gap-2.5 rounded-full ${focusRing}`}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-600/25">
            <Wallet size={18} aria-hidden="true" />
          </span>
          <span className="truncate text-base font-bold tracking-tight text-ink sm:text-lg">
            Ledger Tracker
          </span>
        </NavLink>

        {/* ── Center: primary navigation (xl and up) ─────────────────────── */}
        <div
          className="hidden min-w-0 flex-1 items-center justify-center gap-1 xl:flex"
          aria-label="Primary navigation"
        >
          {navItems.map(({ to, label }) => (
            <NavLink key={to} to={to} className={linkClass}>
              <span>{label}</span>
            </NavLink>
          ))}
        </div>

        {/* ── Right: grouped utility controls ───────────────────────────── */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Light / Dark / System theme switch — also reachable from the
              slide-down menu on phones, where the top bar hides it. */}
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>

          {/* "My Workspace" dropdown — identity + quick navigation. */}
          <div className="relative hidden sm:block" ref={workspaceRef}>
            <button
              type="button"
              onClick={() => setWorkspaceOpen((open) => !open)}
              aria-expanded={workspaceOpen}
              aria-haspopup="menu"
              aria-label="Open workspace menu"
              title="My Workspace"
              className={`inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1.5 text-sm font-medium text-ink-soft shadow-sm transition-colors duration-150 hover:bg-subtle hover:text-ink ${focusRing}`}
            >
              <UserCircle2 size={17} className="text-brand-600 dark:text-brand-400" aria-hidden="true" />
              <span className="hidden max-w-32 truncate md:inline">My Workspace</span>
              <ChevronDown
                size={14}
                aria-hidden="true"
                className={`transition-transform duration-200 ${workspaceOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {workspaceOpen && (
              <div
                role="menu"
                className="absolute right-0 z-40 mt-2.5 w-64 origin-top-right rounded-2xl border border-line bg-surface/95 p-1.5 shadow-2xl backdrop-blur-xl"
              >
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white"
                  >
                    {workspaceInitial}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{workspaceIdentity}</p>
                    <p className="truncate text-xs text-ink-muted">
                      {admin?.username ? `@${admin.username}` : 'Signed in'}
                    </p>
                  </div>
                </div>
                <div className="mx-2 my-1 h-px bg-line" />
                {navItems.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    role="menuitem"
                    onClick={() => setWorkspaceOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-150 ${focusRing} ${
                        isActive
                          ? 'bg-brand-600/10 text-brand-700 dark:text-brand-400'
                          : 'text-ink-soft hover:bg-subtle hover:text-ink'
                      }`
                    }
                  >
                    <Icon size={15} aria-hidden="true" /> {label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>

          {/* Logout — bordered pill so it reads as a peer of the controls. */}
          <button
            type="button"
            onClick={handleLogout}
            className={`hidden items-center gap-1.5 rounded-full border border-rose-300/60 bg-rose-50/60 px-3 py-1.5 text-sm font-medium text-rose-600 transition-colors duration-150 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-950/50 dark:text-rose-400 dark:hover:bg-rose-900/60 sm:inline-flex ${focusRing}`}
          >
            <LogOut size={15} aria-hidden="true" /> Logout
          </button>

          {/* Hamburger — everything below xl folds into this panel.
              44px tap target for comfortable touch use. */}
          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            className={`inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface/70 p-2 text-ink-soft transition-colors duration-150 hover:bg-subtle hover:text-ink active:bg-subtle active:scale-95 xl:hidden ${focusRing}`}
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
          >
            {mobileOpen ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </nav>

    {/* ── Bottom sheet drawer: links + controls for < xl ───────────────────
        iOS action-sheet pattern: dimmed backdrop that taps closed, panel
        slides up from the bottom edge, respects the Home Indicator via
        safe-area padding, and rubber-bands internally via overscroll
        containment. Rendered as a sibling of <nav> so the bar's
        backdrop-filter/backdrop-blur can never clip or re-position this
        fixed overlay (WebKit turns filtered ancestors into containing
        blocks for fixed children). */}
    {mobileOpen && (
      <div className="fixed inset-0 z-40 xl:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
        <div
          className="animate-sheet-fade fixed inset-0 top-16 bg-slate-900/45 backdrop-blur-[2px]"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
        <div
          id="mobile-navigation"
          className="ios-scroll animate-sheet-up fixed bottom-0 left-0 right-0 max-h-[calc(100dvh-4.5rem)] overflow-y-auto rounded-t-3xl border-t border-line bg-surface shadow-2xl"
        >
          {/* Grabber — standard sheet affordance. */}
          <div className="flex justify-center pt-2.5" aria-hidden="true">
            <span className="h-1.5 w-10 rounded-full bg-line-strong" />
          </div>

          <div className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
            {/* Theme row — only while the top-bar toggle is hidden (< sm). */}
            <div className="mb-3 flex items-center justify-between gap-3 sm:hidden">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Theme</span>
              <ThemeToggle showLabels />
            </div>

            {/* Workspace identity — only while the dropdown is hidden (< sm). */}
            {admin ? (
              <div className="mb-3 flex items-center gap-3 rounded-xl border border-line bg-subtle/60 px-3 py-2 sm:hidden">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white"
                >
                  {workspaceInitial}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{workspaceIdentity}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {admin.username ? `@${admin.username}` : 'Signed in'}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="grid gap-1.5">
              {navItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex min-h-[44px] items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors duration-150 active:bg-subtle ${focusRing} ${
                      isActive
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'text-ink-soft hover:bg-subtle hover:text-ink'
                    }`
                  }
                >
                  <Icon size={17} aria-hidden="true" /> <span>{label}</span>
                </NavLink>
              ))}
              <button
                type="button"
                onClick={handleLogout}
                className={`flex min-h-[44px] items-center gap-2 rounded-xl border border-rose-300/60 bg-rose-50/60 px-3.5 py-2.5 text-left text-sm font-medium text-rose-600 transition-colors duration-150 hover:bg-rose-100 active:bg-rose-200 dark:border-rose-500/40 dark:bg-rose-950/50 dark:text-rose-400 dark:hover:bg-rose-900/60 dark:active:bg-rose-900 ${focusRing}`}
              >
                <LogOut size={17} aria-hidden="true" /> Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default Navbar;

