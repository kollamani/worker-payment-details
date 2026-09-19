import React, { useEffect, useState } from 'react';
import { Search, X, Wallet, HandCoins, CalendarDays, ArrowLeft } from 'lucide-react';
import { isFutureDateKey, isValidDateKey, todayKey } from '../utils/dates';
import api from '../api/axios';

const formatMoney = (v) =>
  `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const inputClass = (focus) =>
  `w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${focus}`;

const TransactionForm = ({ members, onSubmit }) => {
  const [form, setForm] = useState({
    member: '',
    villageName: '',
    date: todayKey(),
    type: '',
    amount: '',
    note: '',
    hasExtraFee: false,
    extraFee: 0,
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [balanceInfo, setBalanceInfo] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const transactionTotal = Number(form.amount || 0) + (form.hasExtraFee ? Number(form.extraFee || 0) : 0);

  const isDeposit = form.type === 'deposit';
  const isWithdrawal = form.type === 'withdrawal';
  const selectedMember = (members || []).find((m) => String(m._id || m.id) === String(form.member));

  useEffect(() => {
    if (!isValidDateKey(form.date)) {
      setForm((prev) => ({ ...prev, date: todayKey() }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadBalance = async () => {
      if (!isWithdrawal || !form.member) {
        setBalanceInfo(null);
        return;
      }
      setBalanceLoading(true);
      try {
        const res = await api.get(`/members/${form.member}/summary`);
        if (cancelled) return;
        const s = res.data?.summary || {};
        const half = Number(s.halfAmount ?? s.eligibleHalfAmountTotal ?? 0);
        const received = Number(s.totalWithdrawn ?? s.totalReceivedAmount ?? 0);
        setBalanceInfo({ available: half, received, remaining: half - received });
      } catch {
        if (!cancelled) setBalanceInfo(null);
      } finally {
        if (!cancelled) setBalanceLoading(false);
      }
    };
    loadBalance();
    return () => {
      cancelled = true;
    };
  }, [isWithdrawal, form.member]);

  const selectType = (type) => {
    setError('');
    setSuccess('');
    setForm((prev) => ({
      ...prev,
      type,
      hasExtraFee: false,
      extraFee: 0,
      date: isValidDateKey(prev.date) ? prev.date : todayKey(),
    }));
  };

  if (!form.type) {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 pb-5 pt-5 sm:px-6 sm:pt-6">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">Choose a workflow</h2>
          <p className="mt-1 text-sm text-slate-500">
            Pick an action to open a fully themed form. Deposit adds to the 50% pool; Received pays out from it.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 p-4 sm:gap-4 sm:p-6">
          <button
            type="button"
            onClick={() => selectType('deposit')}
            className="group rounded-2xl border-2 border-emerald-100 bg-emerald-50/70 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-md sm:p-6"
          >
            <span className="inline-flex rounded-xl bg-emerald-600 p-3 text-white shadow-sm transition-transform group-hover:scale-105">
              <Wallet size={24} />
            </span>
            <span className="mt-4 block text-lg font-semibold text-emerald-900">Deposit Cash</span>
            <span className="mt-1.5 block text-sm leading-relaxed text-emerald-800/75">
              Log cash collected from a member. 50% of the amount becomes available deposit balance, with an optional extra fee.
            </span>
          </button>
          <button
            type="button"
            onClick={() => selectType('withdrawal')}
            className="group rounded-2xl border-2 border-amber-100 bg-amber-50/70 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50 hover:shadow-md sm:p-6"
          >
            <span className="inline-flex rounded-xl bg-amber-500 p-3 text-white shadow-sm transition-transform group-hover:scale-105">
              <HandCoins size={24} />
            </span>
            <span className="mt-4 block text-lg font-semibold text-amber-900">Withdraw / Received</span>
            <span className="mt-1.5 block text-sm leading-relaxed text-amber-800/75">
              Pay out from the available 50% pool. Remaining deposit balance is checked live against the selected member.
            </span>
          </button>
        </div>
        <p className="border-t border-slate-100 bg-slate-50/80 px-4 py-3 text-xs text-slate-500 sm:px-6">
          Transaction date always defaults to today&apos;s local date ({todayKey()}) and is submitted as a plain YYYY-MM-DD key.
        </p>
      </div>
    );
  }

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
      member.villageName,
      member.createdByWorker,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return searchableText.includes(query);
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'member') {
      const nextMember = members.find((m) => String(m._id || m.id) === value);
      setForm({
        ...form,
        member: value,
        villageName: nextMember?.villageName || '',
      });
      return;
    }

    if (type === 'checkbox') {
      setForm({ ...form, [name]: checked, ...(name === 'hasExtraFee' && !checked ? { extraFee: 0 } : {}) });
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
    if (form.hasExtraFee && (!Number.isFinite(Number(form.extraFee)) || Number(form.extraFee) < 0)) {
      setError('Please enter a valid extra fee amount');
      return;
    }
    if (!isValidDateKey(form.date)) {
      setError('Please select a valid transaction date.');
      return;
    }
    if (isFutureDateKey(form.date)) {
      setError('Transaction date cannot be in the future.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        member: form.member,
        villageName: form.villageName || (members || []).find((m) => m._id === form.member)?.villageName || '',
        type: form.type,
        amount: Number(form.amount),
        note: form.note,
        date: form.date,
      };

      if (form.type === 'deposit') {
        payload.extraFee = form.hasExtraFee ? Number(form.extraFee) : 0;
      }

      await onSubmit(payload);
      setSuccess('Transaction recorded successfully!');
      setBalanceInfo(null);
      setForm({
        member: form.member,
        villageName: (members || []).find((m) => m._id === form.member)?.villageName || '',
        date: todayKey(),
        type: '',
        amount: '',
        note: '',
        hasExtraFee: false,
        extraFee: 0,
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to record transaction');
    } finally {
      setSaving(false);
    }
  };

  const theme = isDeposit
    ? {
        shell: 'border-emerald-200 ring-1 ring-emerald-100',
        header: 'bg-gradient-to-r from-emerald-700 via-emerald-600 to-emerald-500',
        focus: 'focus:ring-emerald-500/30 focus:border-emerald-500',
        submit: 'bg-emerald-600 hover:bg-emerald-700',
        toggleOn: 'peer-checked:bg-emerald-600',
        panel: 'border-emerald-200 bg-emerald-50/70',
        total: 'text-emerald-700',
      }
    : {
        shell: 'border-amber-200 ring-1 ring-amber-100',
        header: 'bg-gradient-to-r from-amber-700 via-amber-600 to-amber-500',
        focus: 'focus:ring-amber-500/30 focus:border-amber-500',
        submit: 'bg-amber-600 hover:bg-amber-700',
        toggleOn: 'peer-checked:bg-amber-500',
        panel: 'border-amber-200 bg-amber-50/70',
        total: 'text-amber-700',
      };

  return (
    <div className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-colors animate-fade-in ${theme.shell}`}>
      <div className={`px-6 py-5 text-white ${theme.header}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
              {isDeposit ? 'Deposit theme' : 'Withdrawal / received theme'}
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">
              {isDeposit ? 'Deposit Cash' : 'Withdraw / Received'}
            </h2>
            <p className="mt-1 max-w-xl text-sm text-white/85">
              {isDeposit
                ? 'Member, village auto-fill, transaction date, base amount, optional extra fee, and auto total.'
                : 'Member, payout date, withdrawal amount, live remaining-balance check, and notes.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setForm((prev) => ({ ...prev, type: '' }))}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-inset ring-white/30 transition-colors hover:bg-white/25"
          >
            <ArrowLeft size={14} /> Change type
          </button>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4 p-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        {success && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {success}
          </div>
        )}

        {isWithdrawal && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${theme.panel}`}>
            {balanceLoading ? (
              <span className="text-slate-500">Checking remaining deposit balance…</span>
            ) : balanceInfo ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Available pool</p>
                  <p className="mt-0.5 font-mono font-semibold tabular-nums text-slate-800">{formatMoney(balanceInfo.available)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Already received</p>
                  <p className="mt-0.5 font-mono font-semibold tabular-nums text-emerald-600">{formatMoney(balanceInfo.received)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Remaining deposit balance</p>
                  <p className="mt-0.5 font-mono font-semibold tabular-nums text-amber-700">{formatMoney(balanceInfo.remaining)}</p>
                </div>
              </div>
            ) : (
              <span className="text-slate-500">Select a member to see the live remaining deposit balance indicator.</span>
            )}
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Member</label>
          {selectedMember && (
            <p className="mb-2 text-xs text-slate-500">
              Selected: <span className="font-medium text-slate-700">{selectedMember.name}</span>
              {selectedMember.jNo ? ` · ${selectedMember.jNo}` : ''}
            </p>
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search by name, phone, email or ID"
              className={`${inputClass(theme.focus)} pl-9 pr-9`}
              aria-label="Search members"
            />
            {memberSearch && (
              <button
                type="button"
                onClick={() => setMemberSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
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
              className={inputClass(theme.focus)}
            >
              <option value="">Select a member</option>
              {filteredMembers.map((m) => (
                <option key={m._id || m.id} value={m._id || m.id}>
                  {m.jNo} — {m.name}
                </option>
              ))}
            </select>
          </div>

          {memberSearch && filteredMembers.length === 0 && (
            <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
              No users found
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Village Name</label>
            <input
              name="villageName"
              value={form.villageName}
              onChange={handleChange}
              className={inputClass(theme.focus)}
              placeholder="Village name (auto-filled from member)"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Transaction Date</label>
            <div className="relative">
              <CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="date"
                name="date"
                value={form.date}
                onChange={handleChange}
                max={todayKey()}
                className={`${inputClass(theme.focus)} pl-9`}
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Defaults to today ({todayKey()}). Future dates are blocked.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {isDeposit ? 'Base Amount (₹)' : 'Payout / Received Amount (₹)'}
            </label>
            <input
              type="number"
              name="amount"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={handleChange}
              className={`${inputClass(theme.focus)} font-mono tabular-nums`}
              placeholder="0.00"
            />
            {isDeposit && Number(form.amount) > 0 && (
              <p className="mt-1 text-xs text-emerald-700">
                50% of the entered amount ({formatMoney(Number(form.amount) * 0.5)}) will be allocated as available deposit balance
              </p>
            )}
          </div>
        </div>

        {isDeposit && (
          <div className={`space-y-3 rounded-xl border px-4 py-3.5 ${theme.panel}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-800">Extra Fee</p>
                <p className="text-xs text-slate-500">Add an optional charge to this deposit</p>
              </div>

              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  name="hasExtraFee"
                  checked={form.hasExtraFee}
                  onChange={handleChange}
                  className="peer sr-only"
                />
                <span className={`h-6 w-11 rounded-full bg-slate-200 transition-colors duration-200 peer-focus:outline-none ${theme.toggleOn}`} />
                <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform duration-200 peer-checked:translate-x-5" />
              </label>
            </div>

            {form.hasExtraFee && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="extraFee">
                  Extra Fee Amount (₹)
                </label>
                <input
                  id="extraFee"
                  type="number"
                  name="extraFee"
                  min="0"
                  step="0.01"
                  value={form.extraFee}
                  onChange={handleChange}
                  className={`${inputClass(theme.focus)} font-mono tabular-nums`}
                  placeholder="0.00"
                />
              </div>
            )}

            <div className="flex items-center justify-between border-t border-emerald-200/80 pt-2 text-sm">
              <span className="font-medium text-slate-700">Total transaction amount</span>
              <span className={`font-mono font-semibold tabular-nums ${theme.total}`}>
                {formatMoney(transactionTotal)}
              </span>
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Note (optional)</label>
          <input
            name="note"
            value={form.note}
            onChange={handleChange}
            className={inputClass(theme.focus)}
            placeholder="Remarks"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className={`w-full rounded-lg py-2.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-60 ${theme.submit}`}
        >
          {saving ? 'Recording...' : isDeposit ? 'Record Deposit' : 'Record Withdrawal / Received'}
        </button>
      </form>
    </div>
  );
};

export default TransactionForm;
