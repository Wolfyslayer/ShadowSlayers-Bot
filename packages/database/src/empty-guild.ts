import type { GuildState } from '../../shared/src/types.ts';

export const CURRENT_SCHEMA_VERSION = 3;

export function createEmptyGuild(guildId: string, guildName: string): GuildState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    guildId,
    guildName,
    updatedAt: new Date().toISOString(),
    discovery: {
      guildId, guildName, lastDiscoveredAt: '',
      setupConfirmedBy: null, setupConfirmedAt: null,
      categories: [], uncategorizedChannels: [], optionalChannels: [], roles: [],
      incorrectPlacements: [], incorrectTypes: [], permissionDifferences: [],
      proposedChanges: [], conflictsCount: 0, missingCount: 0,
    },
    modules: {
      discovery: false, multilingual: false, onboarding: false, roles: false,
      moderation: false, automod: false, logging: false, progression: false,
      recruitment: false, tickets: false, community: false, clan: false, scheduler: false,
    },
    languages: [],
    translations: {},
    onboarding: {
      enabled: false, welcomeChannelName: '', rulesChannelName: '', rulesMessageId: null,
      rulesReactionEmoji: '✅', rulesPublishedAt: null, roleSelectionChannelNames: [],
      verifiedRoleName: '', recruitRoleName: '', requireExplicitRulesAcceptance: true,
      autoAssignRecruitOnVerify: false, allowMultipleLanguages: false, protectInnerSanctum: true,
      welcomeLogChannelName: '', defaultWelcomeTemplate: '', rulesTitle: '', rulesBody: '',
    },
    automod: {
      enabled: false, spamThresholdCount: 6, spamWindowSeconds: 8,
      repeatedMessageThreshold: 3, maxMentionsPerMessage: 5,
      blockDiscordInvites: false, blockSuspiciousLinks: false, suspiciousDomains: [],
      allowedDomains: [], blockedWords: [], raidJoinThreshold: 12, raidWindowSeconds: 30,
      minAccountAgeHours: 24, autoSlowmodeSeconds: 10, emergencyLockdown: false,
      exemptRoleNames: [], exemptChannelNames: [], escalationActions: [], neverAutoPermaban: true,
    },
    logging: {
      enabled: false, retentionDays: 90,
      channels: {
        member_join: '', member_leave: '', member_update: '', message_edit: '', message_delete: '',
        role_change: '', channel_create: '', channel_delete: '', channel_update: '',
        permission_change: '', voice_activity: '', moderation: '', automod: '', ticket: '',
        recruitment: '', config_change: '', bot_error: '', dashboard_action: '',
      },
    },
    progression: {
      enabled: false, xpPerMessageMin: 15, xpPerMessageMax: 25, cooldownSeconds: 60,
      minMessageLength: 8, blockDuplicateMessages: true, blockBotCommands: true,
      levelCurveMultiplier: 100, inactivityThresholdDays: 21,
    },
    onboardingRecords: [], customResponses: [], falsePositiveReports: [], rolePanels: [],
    temporaryRoles: [], moderationCases: [], warnings: [], appeals: [], logs: [], members: [],
    achievements: [], recruitmentForms: [], recruitmentApplications: [], tickets: [],
    ticketSequence: 0, caseSequence: 0, suggestions: [], polls: [], giveaways: [], events: [],
    reminders: [], birthdays: [], challenges: [], scheduledAnnouncements: [], games: [],
    gamingClasses: [], teams: [], raidSchedules: [], scheduledTasks: [],
  };
}
