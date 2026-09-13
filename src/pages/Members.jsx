import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import Navbar from '../components/Navbar';
import MemberForm from '../components/MemberForm';
import ConfirmModal from '../components/ConfirmModal';
import api from '../api/axios';

const Members = () => {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState(null);

  const fetchMembers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/members');
      setMembers(res.data.members);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const openAddForm = () => {
    setEditingMember(null);
    setFormOpen(true);
  };

  const openEditForm = (member) => {
    setEditingMember(member);
    setFormOpen(true);
  };

  const handleFormSubmit = async (data) => {
    if (editingMember) {
      await api.put(`/members/${editingMember._id}`, data);
    } else {
      await api.post('/members', data);
    }
    setFormOpen(false);
    fetchMembers();
  };

  const requestDelete = (member) => {
    setMemberToDelete(member);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    try {
      await api.delete(`/members/${memberToDelete._id}`);
      setConfirmOpen(false);
      setMemberToDelete(null);
      fetchMembers();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete member');
      setConfirmOpen(false);
    }
  };

  const filtered = members.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.jNo.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Manage Members</h1>
            <p className="text-sm text-gray-500">Add, edit, or remove members from the ledger</p>
          </div>
          <button
            onClick={openAddForm}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700"
          >
            <Plus size={16} /> Add Member
          </button>
        </div>

        <div className="mb-4 relative max-w-sm">
          <Search size={16} className="absolute left-3 top-3 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or J.No..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">S.No</th>
                <th className="px-4 py-3 text-left">J.No</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Village</th>
                <th className="px-4 py-3 text-left">Phone</th>
                <th className="px-4 py-3 text-left">Actions</th>
                <th className="px-4 py-3 text-right">Edite / Delete</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-500">
                    Loading members...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-500">
                    No members found.
                  </td>
                </tr>
              ) : (
                filtered.map((m, idx) => (
                  <tr key={m._id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 text-gray-600">{m.sNo}</td>
                    <td className="px-4 py-3 font-medium text-gray-700">{m.jNo}</td>
                    <td className="px-4 py-3">
                      <Link to={`/users/${m._id}`} className="text-brand-700 hover:underline font-medium">
                        {m.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{m.villageName || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{m.phone || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{m.createdByWorker || '—'}</td>
                    
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEditForm(m)}
                          className="p-2 text-gray-500 hover:text-brand-700 hover:bg-brand-50 rounded-lg"
                          title="Edit"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => requestDelete(m)}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      <MemberForm
        open={formOpen}
        initialData={editingMember}
        onSubmit={handleFormSubmit}
        onClose={() => setFormOpen(false)}
      />

      <ConfirmModal
        open={confirmOpen}
        title="Delete Member"
        message={`Are you sure you want to delete "${memberToDelete?.name}"? This will also permanently delete all their transaction history.`}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};

export default Members;
