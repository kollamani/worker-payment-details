import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ChevronRight } from 'lucide-react';
import Navbar from '../components/Navbar';
import api from '../api/axios';

const UsersList = () => {
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const res = await api.get('/members');
        setMembers(res.data.members);
      } finally {
        setLoading(false);
      }
    };
    fetchMembers();
  }, []);

  const filtered = members.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.jNo.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">User Detail View</h1>
        <p className="text-sm text-gray-500 mb-6">Search and select a member to view their complete ledger history</p>

        <div className="mb-4 relative">
          <Search size={16} className="absolute left-3 top-3.5 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or J.No..."
            autoFocus
            className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 divide-y">
          {loading ? (
            <p className="p-4 text-sm text-gray-500">Loading members...</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">No members found.</p>
          ) : (
            filtered.map((m) => (
              <Link
                key={m._id}
                to={`/users/${m._id}`}
                className="flex items-center justify-between p-4 hover:bg-brand-50 transition-colors"
              >
                <div>
                  <p className="font-medium text-gray-800">{m.name}</p>
                  <p className="text-xs text-gray-500">J.No: {m.jNo} {m.villageName ? `• Village: ${m.villageName}` : ''}</p>
                </div>
                <ChevronRight size={18} className="text-gray-400" />
              </Link>
            ))
          )}
        </div>
      </main>
    </div>
  );
};

export default UsersList;
