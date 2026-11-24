import React, { useState } from 'react';
import type { GuildState } from '../../../packages/shared/src/types';

interface ClanViewProps {
  guild: GuildState;
  onCreateGame: (name: string, shortCode: string) => Promise<void>;
  onCreateTeam: (name: string, gameId: string, description: string, maxSize: number) => Promise<void>;
  onCreateRaid: (title: string, kind: 'raid' | 'dungeon', gameId: string) => Promise<void>;
}

export const ClanView: React.FC<ClanViewProps> = ({
  guild,
  onCreateGame,
  onCreateTeam,
  onCreateRaid,
}) => {
  const [gameName, setGameName] = useState('');
  const [gameCode, setGameCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamDesc, setTeamDesc] = useState('');
  const [raidTitle, setRaidTitle] = useState('');
  const [raidKind, setRaidKind] = useState<'raid' | 'dungeon'>('raid');
  const [selectedGameId, setSelectedGameId] = useState(guild.games[0]?.id || 'game-loe');
  const [error, setError] = useState<string | null>(null);

  const classDistribution = guild.gamingClasses.map((cls) => ({
    ...cls,
    count: guild.members.filter((m) => m.gamingClasses.includes(cls.name)).length,
  }));

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-[#121620] p-6">
        <h2 className="font-display text-xl font-semibold text-slate-100">Clan & Multi-Game Operations</h2>
        <p className="text-sm text-slate-400 mt-1">
          Game-agnostic squads, elemental class distribution, raid/dungeon scheduling, and attendance tracking.
        </p>
      </div>

      {error && <div className="p-3 rounded-lg border border-red-500/40 bg-red-950/30 text-sm text-red-200">{error}</div>}

      {/* Class Distribution */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {classDistribution.map((cls) => (
          <div key={cls.id} className="p-5 rounded-xl border border-slate-800 bg-[#121620]">
            <p className="text-xs text-slate-400">{cls.element} · {cls.roleArchetype}</p>
            <p className="text-base font-semibold text-slate-100 mt-1">{cls.name}</p>
            <p className="font-mono-tabular text-xl font-semibold text-amber-400 mt-2">{cls.count} members</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Teams & Games */}
        <div className="lg:col-span-6 space-y-6">
          <div className="rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4">
            <h3 className="font-display text-lg font-semibold text-slate-100">Supported Games ({guild.games.length})</h3>
            <div className="flex flex-wrap gap-2 text-xs font-mono-tabular">
              {guild.games.map((g) => (
                <span key={g.id} className="px-3 py-1.5 rounded-lg border border-slate-800 bg-[#0B0D12] text-slate-200">
                  {g.shortCode} · {g.name}
                </span>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onCreateGame(gameName, gameCode)
                  .then(() => { setGameName(''); setGameCode(''); })
                  .catch((err) => setError(err.message));
              }}
              className="flex flex-wrap gap-2 pt-2 border-t border-slate-800"
            >
              <input value={gameName} onChange={(e) => setGameName(e.target.value)} required placeholder="Add new game title" className="flex-1 min-w-[160px] px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
              <input value={gameCode} onChange={(e) => setGameCode(e.target.value)} required placeholder="Code" className="w-24 px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm uppercase font-mono-tabular" />
              <button type="submit" className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm cursor-pointer">
                Add Game
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4">
            <h3 className="font-display text-lg font-semibold text-slate-100">Clan Squads & Teams ({guild.teams.length})</h3>
            <div className="divide-y divide-slate-800/70">
              {guild.teams.map((t) => (
                <div key={t.id} className="py-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-100">{t.name}</span>
                    <span className="font-mono-tabular text-xs text-amber-400">
                      {t.memberIds.length}/{t.maxSize} members
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">Leader: {t.leaderUsername} · {t.description}</p>
                </div>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onCreateTeam(teamName, selectedGameId, teamDesc, 10)
                  .then(() => { setTeamName(''); setTeamDesc(''); })
                  .catch((err) => setError(err.message));
              }}
              className="space-y-2 pt-3 border-t border-slate-800"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input value={teamName} onChange={(e) => setTeamName(e.target.value)} required placeholder="New team name" className="px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
                <select value={selectedGameId} onChange={(e) => setSelectedGameId(e.target.value)} className="px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm">
                  {guild.games.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <input value={teamDesc} onChange={(e) => setTeamDesc(e.target.value)} placeholder="Squad objective" className="flex-1 px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
                <button type="submit" className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm cursor-pointer whitespace-nowrap">
                  Form Team
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Raid & Dungeon Scheduling */}
        <div className="lg:col-span-6 rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4">
          <h3 className="font-display text-lg font-semibold text-slate-100">Raid & Dungeon Schedules</h3>
          <div className="divide-y divide-slate-800/70">
            {guild.raidSchedules.map((r) => (
              <div key={r.id} className="py-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-100">{r.title}</span>
                  <span className="font-mono-tabular text-xs text-amber-400">{r.kind} · {r.status}</span>
                </div>
                <p className="text-xs text-slate-400">
                  Leader: {r.leaderUsername} · {new Date(r.scheduledFor).toLocaleString()} · Attendance logged: {r.attendance.length}
                </p>
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onCreateRaid(raidTitle, raidKind, selectedGameId)
                .then(() => setRaidTitle(''))
                .catch((err) => setError(err.message));
            }}
            className="flex flex-wrap gap-2 pt-3 border-t border-slate-800"
          >
            <input value={raidTitle} onChange={(e) => setRaidTitle(e.target.value)} required placeholder="Raid or Dungeon title" className="flex-1 min-w-[160px] px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
            <select value={raidKind} onChange={(e) => setRaidKind(e.target.value as 'raid' | 'dungeon')} className="px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm">
              <option value="raid">Raid</option>
              <option value="dungeon">Dungeon</option>
            </select>
            <button type="submit" className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm cursor-pointer">
              Schedule
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
