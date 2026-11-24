import React, { useState } from 'react';
import { CheckCircle2, Plus, Send, ShieldCheck } from 'lucide-react';
import type { GuildState, RoleCategory } from '../../../packages/shared/src/types';

interface RolesViewProps {
  guild: GuildState;
  onCreatePanel: (payload: {
    title: string;
    description: string;
    channelName: string;
    mode: 'buttons' | 'select_menu' | 'reactions';
    groupType: 'exclusive' | 'multiple';
    category: RoleCategory;
    items: { roleId: string; label: string; emoji: string; description: string }[];
  }) => Promise<void>;
  onPublishPanel: (panelId: string) => Promise<void>;
  onPublishRules: () => Promise<void>;
  onVerifyRules: (userId: string, verified: boolean) => Promise<void>;
  onGrantActivePlayer: (userId: string) => Promise<void>;
}

export const RolesView: React.FC<RolesViewProps> = ({
  guild,
  onCreatePanel,
  onPublishPanel,
  onPublishRules,
  onVerifyRules,
  onGrantActivePlayer,
}) => {
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('Notification Alerts');
  const [description, setDescription] = useState('Opt in or out of optional community notifications.');
  const [channelName, setChannelName] = useState('🎭・choose-your-role');
  const [mode, setMode] = useState<'buttons' | 'select_menu' | 'reactions'>('buttons');
  const [groupType, setGroupType] = useState<'exclusive' | 'multiple'>('multiple');
  const [category, setCategory] = useState<RoleCategory>('notification');
  const [selectedRoleId, setSelectedRoleId] = useState(guild.discovery.roles.find((r) => r.selfAssignable)?.id || '');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selfAssignableRoles = guild.discovery.roles.filter((r) => r.selfAssignable);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    const role = guild.discovery.roles.find((r) => r.id === selectedRoleId) ?? selfAssignableRoles[0];
    if (!role) {
      setError('Select at least one self-assignable role.');
      return;
    }
    try {
      await onCreatePanel({
        title,
        description,
        channelName,
        mode,
        groupType,
        category,
        items: [
          {
            roleId: role.id,
            label: role.name,
            emoji: role.category === 'language' ? '🌐' : '🛡️',
            description: `Toggle ${role.name}`,
          },
        ],
      });
      setShowCreate(false);
      setFeedback(`Created role panel "${title}". Click Publish Panel to run /roles publish.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create role panel');
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-[#121620] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-100">Role Panels & 5-Step Onboarding</h2>
          <p className="text-sm text-slate-400 mt-1">
            Language (exclusive), Class (exclusive), and Notification (multiple) panels in #🎭・choose-your-role & #🎭・выбор-ролей. Clan ranks stay leadership-only; 🌱 Recruit requires Step 5 active-player confirmation after Steps 1–3.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setFeedback(null);
              onPublishRules()
                .then(() => setFeedback(`Published 📜・rules verification gate (${guild.onboarding.rulesReactionEmoji}).`))
                .catch((err) => setError(err.message));
            }}
            className="px-4 py-2 rounded-lg border border-emerald-500/40 bg-emerald-950/30 hover:bg-emerald-950/50 text-emerald-300 font-medium text-sm flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Publish 📜・rules Gate</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>New Role Panel</span>
          </button>
        </div>
      </div>

      {error && <div className="p-3 rounded-lg border border-red-500/40 bg-red-950/30 text-sm text-red-200">{error}</div>}
      {feedback && <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-950/20 text-sm text-amber-200">{feedback}</div>}

      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4">
          <h3 className="font-display text-lg font-semibold text-slate-100">Create Role Selection Panel</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Panel Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Target Channel</label>
              <input value={channelName} onChange={(e) => setChannelName(e.target.value)} required className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Interaction Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value as 'buttons' | 'select_menu' | 'reactions')} className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100">
                <option value="buttons">Buttons</option>
                <option value="select_menu">Select Menu</option>
                <option value="reactions">Reactions</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Group Behavior</label>
              <select value={groupType} onChange={(e) => setGroupType(e.target.value as 'exclusive' | 'multiple')} className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100">
                <option value="multiple">Multiple Selection</option>
                <option value="exclusive">Exclusive (One at a time)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Role Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as RoleCategory)} className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100">
                <option value="language">Language Roles</option>
                <option value="class">Gaming Classes</option>
                <option value="notification">Notification Roles</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Included Role</label>
              <select value={selectedRoleId} onChange={(e) => setSelectedRoleId(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100">
                {selfAssignableRoles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name} ({r.category})</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Panel Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} required className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm text-slate-100" />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-300 cursor-pointer">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm cursor-pointer">Save Panel</button>
          </div>
        </form>
      )}

      {/* Role Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {guild.rolePanels.map((panel) => (
          <div key={panel.id} className="rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-lg font-semibold text-slate-100">{panel.title}</h3>
                <p className="text-xs text-slate-400 mt-1">
                  #{panel.channelName} · {panel.mode} · {panel.groupType} · {panel.category}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onPublishPanel(panel.id)
                    .then(() => setFeedback(`Published "${panel.title}" via /roles publish.`))
                    .catch((err) => setError(err.message))
                }
                className="px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{panel.published ? 'Republish Panel' : 'Publish Panel'}</span>
              </button>
            </div>
            <p className="text-sm text-slate-300">{panel.description}</p>
            <div className="divide-y divide-slate-800/70">
              {panel.items.map((item) => (
                <div key={item.roleId} className="py-2 flex items-center justify-between text-xs">
                  <span className="text-slate-200 font-medium">{item.emoji} {item.label}</span>
                  <span className="text-slate-400">{item.description}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 5-Step Onboarding Gate Tracker */}
      <div className="rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-lg font-semibold text-slate-100">5-Step Onboarding Tracker</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              1) #{guild.onboarding.rulesChannelName} {guild.onboarding.rulesReactionEmoji} → ✅ Verified · 2) Language · 3) Class · 4) Notifications (optional) · 5) Active-Player → 🌱 Recruit
            </p>
          </div>
          <span className="text-xs font-mono-tabular text-slate-400">
            {guild.onboarding.rulesPublishedAt
              ? `Rules published ${new Date(guild.onboarding.rulesPublishedAt).toLocaleString()}`
              : 'Rules gate awaiting publish'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400">
                <th className="py-2 pr-3 font-medium">Member</th>
                <th className="py-2 pr-3 font-medium">Step 1 (Rules ✅)</th>
                <th className="py-2 pr-3 font-medium">Step 2 (Lang)</th>
                <th className="py-2 pr-3 font-medium">Step 3 (Class)</th>
                <th className="py-2 pr-3 font-medium">Step 4 (Pings)</th>
                <th className="py-2 pr-3 font-medium">Step 5 (Rank)</th>
                <th className="py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {guild.members.map((m) => {
                const hasRank = m.hasClanRank !== false;
                const readyForStep5 = m.verified && m.languageCodes.length > 0 && m.gamingClasses.length > 0;
                return (
                  <tr key={m.userId} className="h-11">
                    <td className="py-2 pr-3 text-slate-200 font-medium">{m.displayName}</td>
                    <td className="py-2 pr-3 text-xs font-mono-tabular">
                      <span className={m.verified ? 'text-emerald-400' : 'text-amber-400'}>
                        {m.verified ? '✅ Verified' : 'Pending'}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-300">{m.languageCodes.join(', ') || 'Missing'}</td>
                    <td className="py-2 pr-3 text-xs text-slate-300">{m.gamingClasses.join(', ') || 'Missing'}</td>
                    <td className="py-2 pr-3 text-xs font-mono-tabular text-slate-400">{m.notificationRoles.length}</td>
                    <td className="py-2 pr-3 text-xs text-amber-300">
                      {hasRank ? m.clanRank : 'Unranked'}
                    </td>
                    <td className="py-2 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() =>
                          onVerifyRules(m.userId, !m.verified)
                            .then(() => setFeedback(`Updated rules verification for ${m.username}.`))
                            .catch((err) => setError(err.message))
                        }
                        className="px-2.5 py-1 rounded border border-slate-700 bg-[#171C28] text-xs text-slate-200 cursor-pointer"
                      >
                        {m.verified ? 'Revoke ✅' : 'Grant ✅'}
                      </button>
                      {!hasRank && (
                        <button
                          type="button"
                          disabled={!readyForStep5}
                          onClick={() =>
                            onGrantActivePlayer(m.userId)
                              .then(() => setFeedback(`Granted 🌱 Recruit to ${m.username}.`))
                              .catch((err) => setError(err.message))
                          }
                          className="px-2.5 py-1 rounded border border-emerald-500/40 bg-emerald-950/30 disabled:opacity-40 text-xs text-emerald-300 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3 h-3 inline mr-1" />
                          Grant 🌱 Recruit
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Temporary Roles */}
      <div className="rounded-xl border border-slate-800 bg-[#121620] p-6">
        <h3 className="font-display text-lg font-semibold text-slate-100 mb-3">Temporary Role Grants</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400">
                <th className="py-2 pr-3 font-medium">Member</th>
                <th className="py-2 pr-3 font-medium">Role</th>
                <th className="py-2 pr-3 font-medium">Granted By</th>
                <th className="py-2 pr-3 font-medium">Expires</th>
                <th className="py-2 font-medium text-right">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {guild.temporaryRoles.map((tr) => (
                <tr key={tr.id} className="h-10">
                  <td className="py-2 pr-3 text-slate-200">{tr.username}</td>
                  <td className="py-2 pr-3 text-slate-300">{tr.roleName}</td>
                  <td className="py-2 pr-3 text-xs text-slate-400">{tr.grantedBy}</td>
                  <td className="py-2 pr-3 font-mono-tabular text-xs text-slate-400">
                    {new Date(tr.expiresAt).toLocaleString()}
                  </td>
                  <td className="py-2 text-xs text-right font-mono-tabular text-amber-400">
                    {tr.active ? 'Active' : 'Expired'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
