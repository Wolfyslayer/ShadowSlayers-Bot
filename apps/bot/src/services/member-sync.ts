import type { GuildMemberRecord } from '../../../../packages/shared/src/types.ts';

type LiveProfile = Pick<GuildMemberRecord, 'userId' | 'username' | 'displayName' | 'avatarUrl' | 'joinedAt'>;

export function markMemberDeparted(member: GuildMemberRecord): GuildMemberRecord {
  return { ...member, isDeparted: true, clanRank: null, hasClanRank: false, verified: false };
}

export class GuildMemberSyncQueue {
  private readonly pending = new Map<string, Promise<void>>();

  async run(guildId: string, operation: () => Promise<void>): Promise<void> {
    const previous = this.pending.get(guildId);
    const next = (previous?.catch(() => undefined) ?? Promise.resolve()).then(operation);
    this.pending.set(guildId, next);
    try {
      await next;
    } finally {
      if (this.pending.get(guildId) === next) this.pending.delete(guildId);
    }
  }
}

export async function enumerateGuildMembers<T extends { id: string }>(
  listPage: (options: { limit: number; after?: string }) => Promise<ReadonlyMap<string, T>>,
  limit = 1000,
): Promise<Map<string, T>> {
  const members = new Map<string, T>();
  let after: string | undefined;
  while (true) {
    const page = await listPage({ limit, after });
    let next = after;
    for (const member of page.values()) {
      members.set(member.id, member);
      if (!next || BigInt(member.id) > BigInt(next)) next = member.id;
    }
    if (page.size < limit) return members;
    if (next === after) throw new Error('Discord member cursor did not advance');
    after = next;
  }
}

export function synchronizeMemberProfile(
  previous: GuildMemberRecord | undefined,
  profile: LiveProfile,
): GuildMemberRecord {
  return {
    clanRank: null, hasClanRank: false, verified: false,
    languageCodes: [], gamingClasses: [], notificationRoles: [],
    xp: 0, level: 0, messagesCount: 0, voiceMinutes: 0, achievements: [],
    customBio: '', lastXpAt: null, lastMessageHash: null,
    lastActiveAt: profile.joinedAt, deletedAt: null,
    ...previous,
    ...profile,
    isDeparted: false,
  };
}
