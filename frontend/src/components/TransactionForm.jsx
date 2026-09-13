import React, { useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Search, X } from 'lucide-react';

const today = () => new Date().toISOString().slice(0, 10);

const TransactionForm = ({ members, onSubmit }) => {
  const [form, setForm] = useState({
    member: '',
    villageName: '',
    date: today(),
    type: 'deposit',
    amount: '',
    note: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');

  const filteredMembers = members.filter((member) => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) return true;

    const searchableText = [
      member.name,
      member.phone,
      member.email,
      member.jNo,
      member.userId,
      member.id,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return searchableText.includes(query);
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'member') {
      const selectedMember = members.find((m) => m._id === value);
      setForm({
        ...form,
        member: value,
        villageName: selectedMember?.villageName || '',
      });
      return;
    }

    setForm({ ...form, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!form.member) {
      setError('Please select a member');
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      setError('Please enter a valid amount greater than 0');
      return;
    }

    setSaving(true);
    try {
      await onSubmit({
        ...form,
        villageName: form.villageName || members.find((m) => m._id === form.member)?.villageName || '',
        amount: Number(form.amount),
      });
      setSuccess('Transaction recorded successfully!');
      setForm({
        member: form.member,
        villageName: members.find((m) => m._id === form.member)?.villageName || '',
        date: today(),
        type: 'deposit',
        amount: '',
        note: '',
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to record transaction');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 max-w-xl space-y-4">
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}
      {success && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          {success}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Member</label>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            placeholder="Search by name, phone, email or ID"
            className="w-full border border-gray-300 rounded-lg pl-9 pr-9 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
            aria-label="Search members"
          />
          {memberSearch && (
            <button
              type="button"
              onClick={() => setMemberSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Clear member search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mt-2">
          <select
            name="member"
            value={form.member}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
          >
            <option value="">Select a member</option>
            {filteredMembers.map((m) => (
              <option key={m._id} value={m._id}>
                {m.jNo} — {m.name}
              </option>
            ))}
          </select>
        </div>

        {memberSearch && filteredMembers.length === 0 && (
          <div className="mt-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-4 text-sm text-gray-500 text-center">
            No users found
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Village Name</label>
        <input
          name="villageName"
          value={form.villageName}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
          placeholder="Village name"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input
            type="date"
            name="date"
            value={form.date}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
          <input
            type="number"
            name="amount"
            min="0.01"
            step="0.01"
            value={form.amount}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
            placeholder="0.00"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Transaction Type</label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setForm({ ...form, type: 'deposit' })}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
              form.type === 'deposit'
                ? 'bg-green-600 border-green-600 text-white'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <ArrowDownCircle size={16} /> Deposit
          </button>
          <button
            type="button"
            onClick={() => setForm({ ...form, type: 'withdrawal' })}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
              form.type === 'withdrawal'
                ? 'bg-amber-600 border-amber-600 text-white'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <ArrowUpCircle size={16} /> Withdrawal / Received
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
        <input
          name="note"
          value={form.note}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
          placeholder="Remarks"
        />
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-60"
      >
        {saving ? 'Recording...' : 'Record Transaction'}
      </button>
    </form>
  );
};

export default TransactionForm;
