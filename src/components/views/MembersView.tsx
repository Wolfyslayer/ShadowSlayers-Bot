import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { CLAN_RANK_ORDER, type ClanRankName, type GuildMemberRecord, type GuildState } from '../../../packages/shared/src/types';

interface MembersViewProps {
  guild: GuildState;
  onUpdateMember: (
    userId: string,
    patch: { clanRank?: ClanRankName; languageCodes?: string[]; verified?: boolean; customBio?: string },
  ) => Promise<void>;
}

export const MembersView: React.FC<MembersViewProps> = ({ guild, onUpdateMember }) => {
  const [query, setQuery] = useState('');
  const [rankFilter, setRankFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string>(guild.members[0]?.userId || '');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const filtered = guild.members.filter((m) => {
    const matchesQuery =
      !query ||
      m.username.toLowerCase().includes(query.toLowerCase()) ||
      m.displayName.toLowerCase().includes(query.toLowerCase());
    const matchesRank = rankFilter === 'all' || m.clanRank === rankFilter;
    return matchesQuery && matchesRank;
  });

  const selected: GuildMemberRecord | undefined =
    guild.members.find((m) => m.userId === selectedId) ?? filtered[0];

  const enabledLangs = guild.languages.filter((l) => l.enabled);

  const toggleMemberLanguage = async (member: GuildMemberRecord, code: string) => {
    setError(null);
    setFeedback(null);
    const next = member.languageCodes.includes(code)
      ? member.languageCodes.filter((c) => c !== code)
      : [...member.languageCodes, code];
    try {
      await onUpdateMember(member.userId, { languageCodes: next });
      setFeedback(`Updated independent language roles for ${member.username}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-[#121620] p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-100">Member Directory & Progression</h2>
          <p className="text-sm text-slate-400 mt-1">
            Clan ranks and multi-language roles are strictly decoupled. Members hold one clan rank and unlimited language roles.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search member..."
              className="pl-9 pr-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100"
            />
          </div>
          <select
            value={rankFilter}
            onChange={(e) => setRankFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100"
          >
            <option value="all">All Ranks</option>
            {CLAN_RANK_ORDER.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="p-3 rounded-lg border border-red-500/40 bg-red-950/30 text-sm text-red-200">{error}</div>}
      {feedback && <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-950/20 text-sm text-amber-200">{feedback}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-[#121620] p-6 overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400">
                <th className="py-2 pr-3 font-medium">Member</th>
                <th className="py-2 pr-3 font-medium">Clan Rank</th>
                <th className="py-2 pr-3 font-medium">Languages</th>
                <th className="py-2 pr-3 font-medium text-right">Level</th>
                <th className="py-2 font-medium text-right">XP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filtered.map((m) => (
                <tr
                  key={m.userId}
                  onClick={() => setSelectedId(m.userId)}
                  className={`h-11 cursor-pointer transition-colors ${
                    selected?.userId === m.userId ? 'bg-[#192030]' : 'hover:bg-[#161B26]'
                  }`}
                >
                  <td className="py-2 pr-3 font-medium text-slate-100">{m.displayName}</td>
                  <td className="py-2 pr-3 text-xs text-amber-300">{m.clanRank}</td>
                  <td className="py-2 pr-3 font-mono-tabular text-xs text-slate-300">
                    {m.languageCodes.join(', ') || 'none'}
                  </td>
                  <td className="py-2 pr-3 font-mono-tabular text-xs text-slate-200 text-right">{m.level}</td>
                  <td className="py-2 font-mono-tabular text-xs text-slate-300 text-right">
                    {m.xp.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-5">
          {selected ? (
            <>
              <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div>
                  <h3 className="font-display text-lg font-semibold text-slate-100">{selected.displayName}</h3>
                  <p className="text-xs text-slate-400">
                    @{selected.username} · Joined {new Date(selected.joinedAt).toLocaleDateString()} · {selected.verified ? '✅ Verified' : 'Unverified'}
                  </p>
                </div>
                <span className="font-mono-tabular text-sm text-amber-400">Lv. {selected.level}</span>
              </div>

              <p className="text-sm text-slate-300">{selected.customBio || 'No profile bio recorded.'}</p>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-lg bg-[#0B0D12] border border-slate-800">
                  <p className="text-xs text-slate-400">XP</p>
                  <p className="font-mono-tabular text-sm font-semibold text-slate-100 mt-1">{selected.xp.toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-lg bg-[#0B0D12] border border-slate-800">
                  <p className="text-xs text-slate-400">Messages</p>
                  <p className="font-mono-tabular text-sm font-semibold text-slate-100 mt-1">{selected.messagesCount}</p>
                </div>
                <div className="p-3 rounded-lg bg-[#0B0D12] border border-slate-800">
                  <p className="text-xs text-slate-400">Voice (m)</p>
                  <p className="font-mono-tabular text-sm font-semibold text-slate-100 mt-1">{selected.voiceMinutes}</p>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Clan Rank (Exclusive Hierarchy)</label>
                <select
                  value={selected.clanRank}
                  onChange={(e) =>
                    onUpdateMember(selected.userId, { clanRank: e.target.value as ClanRankName })
                      .then(() => setFeedback(`Updated clan rank for ${selected.username}.`))
                      .catch((err) => setError(err instanceof Error ? err.message : 'Rank update blocked'))
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100"
                >
                  {CLAN_RANK_ORDER.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-2">
                  Independent Language Roles (Multi-Select)
                </label>
                <div className="flex flex-wrap gap-2">
                  {enabledLangs.map((lang) => {
                    const has = selected.languageCodes.includes(lang.code);
                    return (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => toggleMemberLanguage(selected, lang.code)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                          has
                            ? 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                            : 'border-slate-800 bg-[#0B0D12] text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {lang.flagEmoji} {lang.nativeName}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 text-xs text-slate-400">
                <p>Classes: {selected.gamingClasses.join(', ') || 'None'}</p>
                <p className="mt-1">
                  Moderation Cases: {guild.moderationCases.filter((c) => c.targetUserId === selected.userId).length}
                </p>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400">Select a member to inspect their profile.</p>
          )}
        </div>
      </div>
    </div>
  );
};
