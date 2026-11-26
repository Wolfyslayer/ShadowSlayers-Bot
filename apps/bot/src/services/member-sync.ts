import type { GuildMemberRecord } from '../../../../packages/shared/src/types.ts';

type LiveProfile = Pick<GuildMemberRecord, 'userId' | 'username' | 'displayName' | 'avatarUrl' | 'joinedAt'>;

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
