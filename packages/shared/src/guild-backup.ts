import type { GuildState } from './types.ts';

export interface GuildBackupExport {
  exportedAt: string;
  schemaVersion: number;
  guilds: Record<string, GuildState>;
}

export async function createGuildBackupExport(
  guildId: string,
  getGuild: (guildId: string) => Promise<GuildState | null>,
  exportedAt = new Date().toISOString(),
): Promise<GuildBackupExport | null> {
  const guild = await getGuild(guildId);
  if (!guild || guild.guildId !== guildId) return null;

  return {
    exportedAt,
    schemaVersion: guild.schemaVersion,
    guilds: { [guildId]: guild },
  };
}
