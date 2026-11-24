import type { DatabaseRoot } from '../packages/shared/src/types.ts';
import { CURRENT_SCHEMA_VERSION } from '../packages/database/src/seed.ts';

/**
 * Deterministic schema migration runner.
 * Ensures stored snapshots upgrade safely across releases without losing guild or language records.
 */
export function migrateDatabaseRoot(raw: DatabaseRoot): DatabaseRoot {
  const root: DatabaseRoot = {
    schemaVersion: raw.schemaVersion ?? 1,
    adminAuth: raw.adminAuth ?? null,
    guilds: raw.guilds ?? {},
  };

  for (const [guildId, guild] of Object.entries(root.guilds)) {
    if (!guild.schemaVersion || guild.schemaVersion < CURRENT_SCHEMA_VERSION) {
      guild.schemaVersion = CURRENT_SCHEMA_VERSION;
    }
    if (!guild.scheduledTasks) guild.scheduledTasks = [];
    if (!guild.temporaryRoles) guild.temporaryRoles = [];
    if (!guild.birthdays) guild.birthdays = [];
    if (!guild.challenges) guild.challenges = [];
    if (!guild.scheduledAnnouncements) guild.scheduledAnnouncements = [];
    root.guilds[guildId] = guild;
  }

  root.schemaVersion = CURRENT_SCHEMA_VERSION;
  return root;
}
