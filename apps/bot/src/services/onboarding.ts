import type {
  ClanRankName,
  GuildMemberRecord,
  GuildState,
  OnboardingMemberRecord,
} from '../../../../packages/shared/src/types.ts';
import { LEGACY_ROLE_SPECS } from '../../../../packages/shared/src/legacy-template.ts';

export interface DerivedOnboardingStatus {
  userId: string;
  username: string;
  step1RulesVerified: boolean;
  step2LanguageSelected: string | null;
  step3ClassSelected: string | null;
  step4NotificationsCount: number;
  step5RecruitGranted: boolean;
  readyForActivePlayerRecruit: boolean;
  completed: boolean;
  currentClanRank: ClanRankName | null;
  missingSteps: string[];
  rulesVerifiedAt: string | null;
  activePlayerGrantedAt: string | null;
  discordScreeningCompleted: boolean | null;
}

const LANGUAGE_ROLE_NAMES = new Set(['🇬🇧 English', '🇷🇺 Русский']);
const CLASS_ROLE_NAMES = new Set(['⚔️ Warrior', '🔮 Sorcerer', '🗡️ Swordsman']);
const NOTIFICATION_ROLE_NAMES = new Set(['📢 Event Pings', '🐉 Boss Pings', '🏆 PvP Pings']);
const CLAN_RANK_NAMES = new Set<string>([
  '👑 Shadow King',
  '🛡️ Shadow Council',
  '⚔️ Warlord',
  '🔥 Elite Warrior',
  '🖤 ShadowSlayer',
  '🌱 Recruit',
]);

function normalizeRoleSet(roleNames: string[]): Set<string> {
  const out = new Set<string>();
  for (const raw of roleNames) {
    const trimmed = raw.trim();
    const spec = LEGACY_ROLE_SPECS.find(
      (s) => s.name.toLowerCase() === trimmed.toLowerCase() || s.aliases.some((a) => a.toLowerCase() === trimmed.toLowerCase()),
    );
    out.add(spec ? spec.name : trimmed);
  }
  return out;
}

/**
 * Derives a member's 5-step onboarding status from ACTUAL Discord roles + persisted onboarding records.
 * Never returns simulated or hardcoded completion booleans.
 */
export function computeMemberOnboardingStatus(
  member: Pick<
    GuildMemberRecord,
    'userId' | 'username' | 'verified' | 'clanRank' | 'hasClanRank' | 'languageCodes' | 'gamingClasses' | 'notificationRoles'
  >,
  actualDiscordRoleNames: string[] | null,
  record?: OnboardingMemberRecord | null,
): DerivedOnboardingStatus {
  const roleSet = actualDiscordRoleNames ? normalizeRoleSet(actualDiscordRoleNames) : null;

  const step1RulesVerified = roleSet
    ? roleSet.has('✅ Verified')
    : Boolean(member.verified);

  let step2LanguageSelected: string | null = null;
  if (roleSet) {
    for (const langRole of LANGUAGE_ROLE_NAMES) {
      if (roleSet.has(langRole)) {
        step2LanguageSelected = langRole;
        break;
      }
    }
  } else if (member.languageCodes.length > 0) {
    const first = member.languageCodes[0];
    step2LanguageSelected = first === 'en' ? '🇬🇧 English' : first === 'ru' ? '🇷🇺 Русский' : first;
  }

  let step3ClassSelected: string | null = null;
  if (roleSet) {
    for (const clsRole of CLASS_ROLE_NAMES) {
      if (roleSet.has(clsRole)) {
        step3ClassSelected = clsRole;
        break;
      }
    }
  } else if (member.gamingClasses.length > 0) {
    step3ClassSelected = member.gamingClasses[0];
  }

  let step4NotificationsCount = 0;
  if (roleSet) {
    for (const notifyRole of NOTIFICATION_ROLE_NAMES) {
      if (roleSet.has(notifyRole)) step4NotificationsCount += 1;
    }
  } else {
    step4NotificationsCount = member.notificationRoles.length;
  }

  let currentClanRank: ClanRankName | null = null;
  if (roleSet) {
    for (const rank of CLAN_RANK_NAMES) {
      if (roleSet.has(rank)) {
        currentClanRank = rank as ClanRankName;
        break;
      }
    }
  } else if (member.hasClanRank !== false) {
    currentClanRank = member.clanRank;
  }

  const step5RecruitGranted = currentClanRank !== null;

  const missingSteps: string[] = [];
  if (!step1RulesVerified) missingSteps.push('Step 1: React with ✅ in 📜・rules to earn ✅ Verified');
  if (!step2LanguageSelected) missingSteps.push('Step 2: Select a language role (🇬🇧 English or 🇷🇺 Русский)');
  if (!step3ClassSelected) missingSteps.push('Step 3: Select a class role (⚔️ Warrior, 🔮 Sorcerer, or 🗡️ Swordsman)');
  if (!step5RecruitGranted) missingSteps.push('Step 5: Complete active-player confirmation to earn 🌱 Recruit');

  const readyForActivePlayerRecruit = step1RulesVerified && Boolean(step2LanguageSelected) && Boolean(step3ClassSelected);
  const completed = readyForActivePlayerRecruit && step5RecruitGranted;

  return {
    userId: member.userId,
    username: member.username,
    step1RulesVerified,
    step2LanguageSelected,
    step3ClassSelected,
    step4NotificationsCount,
    step5RecruitGranted,
    readyForActivePlayerRecruit,
    completed,
    currentClanRank,
    missingSteps,
    rulesVerifiedAt: record?.rulesVerifiedAt ?? null,
    activePlayerGrantedAt: record?.activePlayerGrantedAt ?? null,
    discordScreeningCompleted: record?.discordScreeningCompleted ?? null,
  };
}

/**
 * Handles Step 1 (`📜・rules` ✅ reaction add/remove).
 * Deliberate removal policy: revoking ✅ reaction removes `✅ Verified` and marks `rulesVerified = false`
 * without wiping unrelated Language, Class, Notification, or Clan Rank roles.
 */
export function applyRulesVerificationReaction(
  guild: GuildState,
  input: { userId: string; username: string; added: boolean; nowIso?: string },
): { changed: boolean; verified: boolean; record: OnboardingMemberRecord } {
  const now = input.nowIso ?? new Date().toISOString();
  let member = guild.members.find((m) => m.userId === input.userId);
  if (!member) {
    member = {
      userId: input.userId,
      username: input.username,
      displayName: input.username,
      avatarUrl: null,
      clanRank: '🌱 Recruit',
      hasClanRank: false, // Unranked until Step 5 active-player action
      languageCodes: [],
      gamingClasses: [],
      notificationRoles: [],
      verified: false,
      xp: 0,
      level: 1,
      messagesCount: 0,
      voiceMinutes: 0,
      achievements: [],
      customBio: '',
      lastXpAt: null,
      lastMessageHash: null,
      joinedAt: now,
      lastActiveAt: now,
      isDeparted: false,
      deletedAt: null,
    };
    guild.members.push(member);
  }

  const prevVerified = member.verified;
  member.verified = input.added;
  member.lastActiveAt = now;

  let rec = guild.onboardingRecords.find((r) => r.userId === input.userId);
  if (!rec) {
    rec = {
      userId: input.userId,
      username: input.username,
      rulesVerified: input.added,
      rulesVerifiedAt: input.added ? now : null,
      languageSelected: member.languageCodes[0] ?? null,
      classSelected: member.gamingClasses[0] ?? null,
      notificationRolesCount: member.notificationRoles.length,
      activePlayerRecruitGranted: member.hasClanRank !== false,
      activePlayerGrantedAt: null,
      discordScreeningCompleted: null,
      updatedAt: now,
    };
    guild.onboardingRecords.push(rec);
  } else {
    rec.rulesVerified = input.added;
    rec.rulesVerifiedAt = input.added ? now : rec.rulesVerifiedAt;
    rec.updatedAt = now;
  }

  return {
    changed: prevVerified !== input.added,
    verified: input.added,
    record: rec,
  };
}

/**
 * Handles Step 5 active-player action granting `🌱 Recruit` ONLY after Steps 1-3 are complete.
 * Never promotes above `🌱 Recruit` and never alters higher existing clan ranks.
 */
export function grantActivePlayerRecruit(
  guild: GuildState,
  input: { userId: string; username: string; actualDiscordRoleNames?: string[] | null; nowIso?: string },
): { ok: boolean; reason: string; grantedRole: '🌱 Recruit' | null; status: DerivedOnboardingStatus } {
  const now = input.nowIso ?? new Date().toISOString();
  const member = guild.members.find((m) => m.userId === input.userId);
  if (!member) {
    return {
      ok: false,
      reason: 'Member has not completed Step 1 (📜・rules ✅ verification) yet.',
      grantedRole: null,
      status: {
        userId: input.userId,
        username: input.username,
        step1RulesVerified: false,
        step2LanguageSelected: null,
        step3ClassSelected: null,
        step4NotificationsCount: 0,
        step5RecruitGranted: false,
        readyForActivePlayerRecruit: false,
        completed: false,
        currentClanRank: null,
        missingSteps: ['Step 1: React with ✅ in 📜・rules to earn ✅ Verified'],
        rulesVerifiedAt: null,
        activePlayerGrantedAt: null,
        discordScreeningCompleted: null,
      },
    };
  }

  const existingRec = guild.onboardingRecords.find((r) => r.userId === input.userId) ?? null;
  const status = computeMemberOnboardingStatus(member, input.actualDiscordRoleNames ?? null, existingRec);

  if (!status.readyForActivePlayerRecruit) {
    return {
      ok: false,
      reason: `Cannot grant 🌱 Recruit until required onboarding steps complete: ${status.missingSteps.filter((s) => !s.startsWith('Step 5')).join('; ')}`,
      grantedRole: null,
      status,
    };
  }

  if (status.currentClanRank && status.currentClanRank !== '🌱 Recruit') {
    return {
      ok: true,
      reason: `Member already holds higher clan rank (${status.currentClanRank}); preserved without demotion.`,
      grantedRole: null,
      status,
    };
  }

  member.clanRank = '🌱 Recruit';
  member.hasClanRank = true;
  member.lastActiveAt = now;

  let rec = existingRec;
  if (!rec) {
    rec = {
      userId: input.userId,
      username: input.username,
      rulesVerified: true,
      rulesVerifiedAt: now,
      languageSelected: status.step2LanguageSelected,
      classSelected: status.step3ClassSelected,
      notificationRolesCount: status.step4NotificationsCount,
      activePlayerRecruitGranted: true,
      activePlayerGrantedAt: now,
      discordScreeningCompleted: null,
      updatedAt: now,
    };
    guild.onboardingRecords.push(rec);
  } else {
    rec.languageSelected = status.step2LanguageSelected;
    rec.classSelected = status.step3ClassSelected;
    rec.notificationRolesCount = status.step4NotificationsCount;
    rec.activePlayerRecruitGranted = true;
    rec.activePlayerGrantedAt = now;
    rec.updatedAt = now;
  }

  const updatedStatus = computeMemberOnboardingStatus(member, input.actualDiscordRoleNames ? [...input.actualDiscordRoleNames, '🌱 Recruit'] : null, rec);

  return {
    ok: true,
    reason: 'Granted 🌱 Recruit upon active-player onboarding completion.',
    grantedRole: '🌱 Recruit',
    status: updatedStatus,
  };
}
