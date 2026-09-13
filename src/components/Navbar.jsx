import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutGrid, Users, PlusCircle, UserSearch, LogOut, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Navbar = () => {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const linkClass = ({ isActive }) =>
    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-brand-50 hover:text-brand-700'
    }`;

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-2 text-brand-700 font-bold text-lg">
            <Wallet size={22} />
            Ledger Tracker
          </div>

          <div className="hidden md:flex items-center gap-1">
            <NavLink to="/dashboard" className={linkClass}>
              <LayoutGrid size={16} /> Dashboard
            </NavLink>
            <NavLink to="/members" className={linkClass}>
              <Users size={16} /> Manage Members
            </NavLink>
            <NavLink to="/transactions/new" className={linkClass}>
              <PlusCircle size={16} /> Record Transaction
            </NavLink>
            <NavLink to="/users" className={linkClass}>
              <UserSearch size={16} /> User Detail View
            </NavLink>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-sm text-gray-500">
              {admin?.name || admin?.username}
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <LogOut size={16} /> Logout
            </button>
          </div>
        </div>

        <div className="flex md:hidden justify-between pb-2 gap-1 overflow-x-auto">
          <NavLink to="/dashboard" className={linkClass}>
            <LayoutGrid size={16} />
          </NavLink>
          <NavLink to="/members" className={linkClass}>
            <Users size={16} />
          </NavLink>
          <NavLink to="/transactions/new" className={linkClass}>
            <PlusCircle size={16} />
          </NavLink>
          <NavLink to="/users" className={linkClass}>
            <UserSearch size={16} />
          </NavLink>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
