// One-shot migration script: rewrites src/pages/Members.jsx with the dark
// glassmorphic neon card redesign. Deleted immediately after a successful run.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('../src/pages/Members.jsx', import.meta.url));

const NEW = `import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, Search, X, Users, MapPin, ShieldCheck, ChevronRight } from 'lucide-react';
import Navbar from '../components/Navbar';
import MemberForm from '../components/MemberForm';
import ConfirmModal from '../components/ConfirmModal';
import api from '../api/axios';

/**
 * Neon accent palettes cycled across the member card grid. Each palette
 * provides a translucent border, a resting neon glow with an inner bevel
 * highlight (depth), and a stronger glow for the hover state.
 */
const cardPalettes = [
  {
    border: 'border-pink-500/40 hover:border-pink-400/60',
    glow: 'shadow-[0_0_15px_rgba(244,63,94,0.15),inset_0_1px_0_rgba(255,255,255,0.06)]',
    hoverGlow: 'hover:shadow-[0_0_28px_rgba(244,63,94,0.32),inset_0_1px_0_rgba(255,255,255,0.1)]',
    accent: 'text-pink-300',
  },
  {
    border: 'border-teal-400/40 hover:border-teal-300/60',
    glow: 'shadow-[0_0_15px_rgba(45,212,191,0.15),inset_0_1px_0_rgba(255,255,255,0.06)]',
    hoverGlow: 'hover:shadow-[0_0_28px_rgba(45,212,191,0.32),inset_0_1px_0_rgba(255,255,255,0.1)]',
    accent: 'text-teal-300',
  },
  {
    border: 'border-amber-400/40 hover:border-amber-300/60',
    glow: 'shadow-[0_0_15px_rgba(251,191,36,0.15),inset_0_1px_0_rgba(255,255,255,0.06)]',
    hoverGlow: 'hover:shadow-[0_0_28px_rgba(251,191,36,0.32),inset_0_1px_0_rgba(255,255,255,0.1)]',
    accent: 'text-amber-300',
  },
  {
    border: 'border-purple-400/40 hover:border-purple-300/60',
    glow: 'shadow-[0_0_15px_rgba(192,132,252,0.15),inset_0_1px_0_rgba(255,255,255,0.06)]',
    hoverGlow: 'hover:shadow-[0_0_28px_rgba(192,132,252,0.32),inset_0_1px_0_rgba(255,255,255,0.1)]',
    accent: 'text-purple-300',
  },
  {
    border: 'border-sky-400/40 hover:border-sky-300/60',
    glow: 'shadow-[0_0_15px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.06)]',
    hoverGlow: 'hover:shadow-[0_0_28px_rgba(56,189,248,0.32),inset_0_1px_0_rgba(255,255,255,0.1)]',
    accent: 'text-sky-300',
  },
];

/** Decorative ambient backdrop: glowing grid + soft neon orbs. */
const AmbientBackdrop = () => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
    <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.05)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,black_30%,transparent_100%)]" />
    <div className="absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
    <div className="absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />
    <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-pink-500/[0.07] blur-3xl" />
    <div className="absolute bottom-1/4 right-1/3 h-64 w-64 rounded-full bg-teal-500/[0.07] blur-3xl" />
  </div>
);

const statTints = {
  indigo: 'bg-indigo-500/10 text-indigo-300 border-indigo-400/20',
  emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-400/20',
  amber: 'bg-amber-500/10 text-amber-300 border-amber-400/20',
};

const StatTile = ({ icon: Icon, label, value, tint = 'indigo' }) => (
  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md transition-colors hover:bg-white/[0.06]">
    <div className="flex items-center gap-3">
      <span className={\`shrink-0 rounded-lg border p-2.5 \${statTints[tint]}\`}>
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
        <p className="font-mono text-xl font-bold tabular-nums text-white">{value}</p>
      </div>
    </div>
  </div>
);

const MemberCard = ({ member, palette, onEdit, onDelete }) => (
  <div
    className={\`group flex h-full min-h-[190px] flex-col rounded-2xl border bg-slate-900/40 backdrop-blur-md transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.02] \${palette.border} \${palette.glow} \${palette.hoverGlow}\`}
  >
    <div className="flex items-start justify-between gap-2">
      <p className="min-w-0 truncate text-sm font-semibold text-white" title={member.name}>
        {member.name}
      </p>
      <span className="shrink-0 rounded-full border border-white/10 bg-white/10 px-2 py-0.5 font-mono text-xs text-gray-300">
        {member.jNo || '\u2014'}
      </span>
    </div>

    <div className="mt-3 space-y-1.5">
      <p className="truncate text-xs text-gray-400" title={member.villageName || 'No village'}>
        {member.villageName || 'No village'}
      </p>
      <p
        className="truncate text-xs font-medium text-gray-300"
        title={String(member.createdByWorker || '').trim() || 'Unassigned'}
      >
        Admin:{' '}
        <span className={String(member.createdByWorker || '').trim() ? palette.accent : 'text-amber-300/90'}>
          {String(member.createdByWorker || '').trim() || 'Unassigned'}
        </span>
      </p>
      <p className="truncate font-mono text-xs text-gray-400">{member.phone || '\u2014'}</p>
    </div>

    <div className="mt-auto flex items-center gap-1.5 pt-4">
      <Link
        to={\`/users/\${member._id}\`}
        className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 py-1.5 text-xs text-gray-200 transition-colors hover:bg-white/10"
        title="Open member ledger"
      >
        Open ledger
        <ChevronRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
      </Link>
      <button
        type="button"
        onClick={() => onEdit(member)}
        title="Edit member"
        aria-label="Edit member"
        className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        onClick={() => onDelete(member)}
        title="Delete member"
        aria-label="Delete member"
        className="rounded-lg border border-red-500/20 bg-red-500/10 p-1.5 text-red-300 transition-colors hover:bg-red-500/20 hover:text-red-200"
      >
        <Trash2 size={14} />
      </button>
    </div>
  </div>
);
/*__APPEND__*/