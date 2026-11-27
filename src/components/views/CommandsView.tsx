import React, { useState } from 'react';
import { Terminal, Play } from 'lucide-react';
import type { GuildState } from '../../../packages/shared/src/types';
import { useLocale } from '../../lib/LocaleProvider';

export interface CommandDesc {
  name: string;
  category: string;
  description: string;
  requiredCapability: string;
  optionsSummary: string[];
}

interface CommandsViewProps {
  guild: GuildState;
  commands: CommandDesc[];
  onExecuteCommand: (command: string, args: Record<string, string>) => Promise<{
    ok: boolean;
    title: string;
    message: string;
  }>;
}

export const CommandsView: React.FC<CommandsViewProps> = ({
  guild,
  commands,
  onExecuteCommand,
}) => {
  const { locale, t } = useLocale();
  const [selectedCmd, setSelectedCmd] = useState(commands[0]?.name || 'help');
  const [argsJson, setArgsJson] = useState('{}');
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const parsedArgs = JSON.parse(argsJson || '{}') as Record<string, string>;
      const res = await onExecuteCommand(selectedCmd, parsedArgs);
      setOutput(`[${res.ok ? 'OK' : 'DENIED'}] ${res.title}: ${res.message}`);
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t('Invalid JSON arguments or execution failed'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-[#121620] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-100">{t('Slash Command Codex & Task Queue')}</h2>
          <p className="text-sm text-slate-400 mt-1">
            {t('{{count}} deterministic slash commands registered. Test commands directly against the persistent guild database.', { count: commands.length })}
          </p>
        </div>
      </div>

      {error && <div className="p-3 rounded-lg border border-red-500/40 bg-red-950/30 text-sm text-red-200" role="alert">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form onSubmit={handleRun} className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#121620] p-6 space-y-4">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-medium">
            <Terminal className="w-4 h-4" />
            <span>{t('Interactive Slash Command Runner')}</span>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">{t('Command')}</label>
            <select
              value={selectedCmd}
              onChange={(e) => setSelectedCmd(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-sm font-mono-tabular text-slate-100"
            >
              {commands.map((c) => (
                <option key={c.name} value={c.name}>
                  /{c.name} ({c.category})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">{t('JSON Arguments')}</label>
            <textarea
              rows={3}
              value={argsJson}
              onChange={(e) => setArgsJson(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#0B0D12] border border-slate-800 text-xs font-mono-tabular text-slate-100"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play className="w-4 h-4" />
            <span>{t('Execute')} /{selectedCmd}</span>
          </button>
          {output && (
            <div className="p-3 rounded-lg bg-[#0B0D12] border border-slate-800 text-xs font-mono-tabular text-amber-300">
              {output}
            </div>
          )}
        </form>

        <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-[#121620] p-6 overflow-x-auto max-h-[520px] overflow-y-auto">
          <h3 className="font-display text-lg font-semibold text-slate-100 mb-4">{t('Registered Commands')} ({commands.length})</h3>
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400">
                <th className="py-2 pr-3 font-medium">{t('Command')}</th>
                <th className="py-2 pr-3 font-medium">{t('Category')}</th>
                <th className="py-2 font-medium">{t('Description')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {commands.map((c) => (
                <tr key={c.name} className="h-9">
                  <td className="py-1.5 pr-3 font-mono-tabular text-xs text-amber-400 whitespace-nowrap">
                    /{c.name}
                    {c.optionsSummary.length > 0 && (
                      <span className="text-slate-500 ml-1">({c.optionsSummary.join(', ')})</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-xs text-slate-400 whitespace-nowrap">{c.category}</td>
                  <td className="py-1.5 text-xs text-slate-300">{c.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Scheduled Tasks Queue */}
      <div className="rounded-xl border border-slate-800 bg-[#121620] p-6 overflow-x-auto">
        <h3 className="font-display text-lg font-semibold text-slate-100 mb-3">
          {t('Persistent Scheduled Tasks')} ({guild.scheduledTasks.length})
        </h3>
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs text-slate-400">
              <th className="py-2 pr-3 font-medium">{t('Type')}</th>
              <th className="py-2 pr-3 font-medium">{t('Description')}</th>
              <th className="py-2 pr-3 font-medium">{t('Run At')}</th>
              <th className="py-2 font-medium text-right">{t('Status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {guild.scheduledTasks.map((t) => (
              <tr key={t.id} className="h-10">
                <td className="py-2 pr-3 font-mono-tabular text-xs text-slate-200">{t.type}</td>
                <td className="py-2 pr-3 text-xs text-slate-300">{t.description}</td>
                <td className="py-2 pr-3 font-mono-tabular text-xs text-slate-400">{new Date(t.runAt).toLocaleString(locale === 'sv' ? 'sv-SE' : 'en-US')}</td>
                <td className="py-2 text-xs text-right font-mono-tabular text-amber-400">{t.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
