import React, { useEffect, useState } from 'react';
import type { GameDefinition, GuildState } from '../../../packages/shared/src/types';
import { useLocale } from '../../lib/LocaleProvider';

type GameConfigurationPatch = Partial<Pick<GameDefinition, 'ranks'>> & { classes?: string[] };

interface ClanViewProps {
  guild: GuildState;
  onCreateGame: (name: string, shortCode: string) => Promise<void>;
  onUpdateGame: (gameId: string, patch: GameConfigurationPatch) => Promise<void>;
  onCreateTeam: (name: string, gameId: string, description: string, maxSize: number) => Promise<void>;
  onCreateRaid: (title: string, kind: 'raid' | 'dungeon', gameId: string) => Promise<void>;
}

export const ClanView: React.FC<ClanViewProps> = ({
  guild,
  onCreateGame,
  onUpdateGame,
  onCreateTeam,
  onCreateRaid,
}) => {
  const { locale, t } = useLocale();
  const [gameName, setGameName] = useState('');
  const [gameCode, setGameCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamDesc, setTeamDesc] = useState('');
  const [raidTitle, setRaidTitle] = useState('');
  const [raidKind, setRaidKind] = useState<'raid' | 'dungeon'>('raid');
  const [selectedGameId, setSelectedGameId] = useState(guild.games[0]?.id ?? '');
  const [rankDrafts, setRankDrafts] = useState<Record<string, string>>({});
  const [classDrafts, setClassDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!guild.games.some((game) => game.id === selectedGameId)) {
      setSelectedGameId(guild.games[0]?.id ?? '');
    }
  }, [guild.games, selectedGameId]);

  const classDistribution = guild.gamingClasses.map((cls) => ({
    ...cls,
    gameName: guild.games.find((game) => game.id === cls.gameId)?.name ?? t('Unassigned game'),
    count: guild.members.filter((m) => m.gamingClasses.includes(cls.name)).length,
  }));

  const addGameLabel = async (game: GameDefinition, kind: 'rank' | 'class') => {
    const draft = (kind === 'rank' ? rankDrafts[game.id] : classDrafts[game.id])?.trim();
    if (!draft) return;
    const currentClasses = guild.gamingClasses.filter((item) => item.gameId === game.id).map((item) => item.name);
    const current = kind === 'rank' ? game.ranks ?? [] : currentClasses;
    if (current.some((item) => item.toLowerCase() === draft.toLowerCase())) {
      setError(t('That name is already configured for this game.'));
      return;
    }
    setError(null);
    try {
      await onUpdateGame(game.id, kind === 'rank'
        ? { ranks: [...current, draft] }
        : { classes: [...current, draft] });
      if (kind === 'rank') {
        setRankDrafts((drafts) => ({ ...drafts, [game.id]: '' }));
      } else {
        setClassDrafts((drafts) => ({ ...drafts, [game.id]: '' }));
      }
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t('Action failed'));
    }
  };

  const removeGameLabel = async (game: GameDefinition, kind: 'rank' | 'class', label: string) => {
    if (!window.confirm(t('Remove this game label? Existing member assignments are not changed.'))) return;
    const currentClasses = guild.gamingClasses.filter((item) => item.gameId === game.id).map((item) => item.name);
    setError(null);
    try {
      await onUpdateGame(game.id, kind === 'rank'
        ? { ranks: (game.ranks ?? []).filter((item) => item !== label) }
        : { classes: currentClasses.filter((item) => item !== label) });
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t('Action failed'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-[#121620] p-6">
        <h2 className="font-display text-xl font-semibold text-slate-100">{t('Clan & Multi-Game Operations')}</h2>
        <p className="text-sm text-slate-400 mt-1">
          {t('Manage game catalogs, game-specific ranks and classes, squads, and event schedules. Game ranks never grant bot permissions.')}
        </p>
      </div>

      {error && <div className="p-3 rounded-lg border border-red-500/40 bg-red-950/30 text-sm text-red-200" role="alert">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {classDistribution.map((cls) => (
          <div key={cls.id} className="p-5 rounded-xl border border-slate-800 bg-[#121620]">
            <p className="text-xs text-slate-400">{cls.gameName}{cls.roleArchetype ? ` · ${cls.roleArchetype}` : ''}</p>
            <p className="text-base font-semibold text-slate-100 mt-1">{cls.name}</p>
            <p className="font-mono-tabular text-xl font-semibold text-amber-400 mt-2">{t('{{count}} members', { count: cls.count })}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Teams & Games */}
        <div className="lg:col-span-6 space-y-6">
          <div className="rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4">
            <h3 className="font-display text-lg font-semibold text-slate-100">{t('Supported Games')} ({guild.games.length})</h3>
            {guild.games.length === 0 ? (
              <p className="text-sm text-slate-400">{t('No games are configured yet. Add a game below to define its own ranks and classes.')}</p>
            ) : (
              <div className="space-y-4">
                {guild.games.map((game) => {
                  const gameClasses = guild.gamingClasses.filter((item) => item.gameId === game.id);
                  return (
                    <section key={game.id} className="rounded-xl border border-slate-800 bg-[#0B0D12] p-4 space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h4 className="font-semibold text-slate-100">{game.name}</h4>
                          <p className="text-xs text-slate-400">{t('Game code')}: {game.shortCode}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {([
                          { kind: 'rank' as const, label: t('Game ranks'), values: game.ranks ?? [], draft: rankDrafts[game.id] ?? '', setDraft: (value: string) => setRankDrafts((drafts) => ({ ...drafts, [game.id]: value })) },
                          { kind: 'class' as const, label: t('Game classes'), values: gameClasses.map((item) => item.name), draft: classDrafts[game.id] ?? '', setDraft: (value: string) => setClassDrafts((drafts) => ({ ...drafts, [game.id]: value })) },
                        ]).map((group) => (
                          <div key={group.kind} className="space-y-2">
                            <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{group.label}</h5>
                            <div className="flex flex-wrap gap-2">
                              {group.values.map((label, index) => (
                                <span key={label} className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-[#151124] px-2.5 py-1 text-xs text-slate-200">
                                  {group.kind === 'rank' ? `${index + 1}. ` : ''}{label}
                                  <button
                                    type="button"
                                    onClick={() => void removeGameLabel(game, group.kind, label)}
                                    className="ml-1 rounded px-1 text-slate-400 hover:bg-white/10 hover:text-white"
                                    aria-label={`${t('Remove')} ${label}`}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                              {group.values.length === 0 && <span className="text-xs text-slate-500">{t('None configured')}</span>}
                            </div>
                            <form
                              className="flex gap-2"
                              onSubmit={(event) => {
                                event.preventDefault();
                                void addGameLabel(game, group.kind);
                              }}
                            >
                              <input
                                value={group.draft}
                                onChange={(event) => group.setDraft(event.target.value)}
                                maxLength={50}
                                required
                                placeholder={group.kind === 'rank' ? t('Add a rank') : t('Add a class')}
                                aria-label={`${group.label} ${game.name}`}
                                className="app-input min-w-0 flex-1 px-3 py-2 text-sm"
                              />
                              <button type="submit" className="rounded-lg border border-violet-300/20 bg-violet-500/15 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-500/25">
                                {t('Add')}
                              </button>
                            </form>
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onCreateGame(gameName, gameCode)
                  .then(() => { setError(null); setGameName(''); setGameCode(''); })
                  .catch((err) => setError(err instanceof Error ? t(err.message) : t('Action failed')));
              }}
              className="flex flex-wrap gap-2 pt-2 border-t border-slate-800"
            >
              <input value={gameName} onChange={(e) => setGameName(e.target.value)} required maxLength={80} placeholder={t('Add new game title')} aria-label={t('Game name')} className="flex-1 min-w-[160px] px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
              <input value={gameCode} onChange={(e) => setGameCode(e.target.value)} required maxLength={12} placeholder={t('Code')} aria-label={t('Game code')} className="w-24 px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm uppercase font-mono-tabular" />
              <button type="submit" className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm cursor-pointer">
                {t('Add Game')}
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4">
            <h3 className="font-display text-lg font-semibold text-slate-100">{t('Clan Squads & Teams')} ({guild.teams.length})</h3>
            <div className="divide-y divide-slate-800/70">
              {guild.teams.map((team) => (
                <div key={team.id} className="py-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-100">{team.name}</span>
                    <span className="font-mono-tabular text-xs text-amber-400">
                      {team.memberIds.length}/{team.maxSize} {t('members')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{t('Leader')}: {team.leaderUsername} · {team.description}</p>
                </div>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onCreateTeam(teamName, selectedGameId, teamDesc, 10)
                  .then(() => { setTeamName(''); setTeamDesc(''); })
                  .catch((err) => setError(err instanceof Error ? t(err.message) : t('Action failed')));
              }}
              className="space-y-2 pt-3 border-t border-slate-800"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input value={teamName} onChange={(e) => setTeamName(e.target.value)} required placeholder={t('New team name')} className="px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
                <select value={selectedGameId} onChange={(e) => setSelectedGameId(e.target.value)} required disabled={guild.games.length === 0} className="px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm">
                  {guild.games.length === 0 && <option value="">{t('Add a game first')}</option>}
                  {guild.games.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <input value={teamDesc} onChange={(e) => setTeamDesc(e.target.value)} placeholder={t('Squad objective')} className="flex-1 px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
                <button type="submit" disabled={guild.games.length === 0} className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm cursor-pointer whitespace-nowrap">
                  {t('Form Team')}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Raid & Dungeon Scheduling */}
        <div className="lg:col-span-6 rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4">
          <h3 className="font-display text-lg font-semibold text-slate-100">{t('Raid & Dungeon Schedules')}</h3>
          <div className="divide-y divide-slate-800/70">
            {guild.raidSchedules.map((r) => (
              <div key={r.id} className="py-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-100">{r.title}</span>
                  <span className="font-mono-tabular text-xs text-amber-400">{t(r.kind)} · {t(r.status)}</span>
                </div>
                <p className="text-xs text-slate-400">
                  {t('Leader')}: {r.leaderUsername} · {new Date(r.scheduledFor).toLocaleString(locale === 'sv' ? 'sv-SE' : 'en-US')} · {t('Attendance logged')}: {r.attendance.length}
                </p>
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onCreateRaid(raidTitle, raidKind, selectedGameId)
                .then(() => setRaidTitle(''))
                .catch((err) => setError(err instanceof Error ? t(err.message) : t('Action failed')));
            }}
            className="flex flex-wrap gap-2 pt-3 border-t border-slate-800"
          >
            <input value={raidTitle} onChange={(e) => setRaidTitle(e.target.value)} required placeholder={t('Raid or Dungeon title')} className="flex-1 min-w-[160px] px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm" />
            <select value={selectedGameId} onChange={(e) => setSelectedGameId(e.target.value)} required disabled={guild.games.length === 0} className="px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm">
              {guild.games.length === 0 && <option value="">{t('Add a game first')}</option>}
              {guild.games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}
            </select>
            <select value={raidKind} onChange={(e) => setRaidKind(e.target.value as 'raid' | 'dungeon')} className="px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm">
              <option value="raid">{t('Raid')}</option>
              <option value="dungeon">{t('Dungeon')}</option>
            </select>
            <button type="submit" disabled={guild.games.length === 0} className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm cursor-pointer">
              {t('Schedule')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
