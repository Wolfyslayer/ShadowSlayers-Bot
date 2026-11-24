import { z } from 'zod';
import { CLAN_RANK_ORDER } from './types.ts';

export const safeIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/, 'Identifier may only contain letters, numbers, underscores, and hyphens');

export const languageCreateSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(8)
    .regex(/^[a-z]{2,8}(-[a-z]{2,4})?$/i, 'Invalid ISO language code'),
  name: z.string().min(2).max(60),
  nativeName: z.string().min(1).max(60),
  flagEmoji: z.string().min(1).max(16),
  welcomeMessage: z.string().min(1).max(2000).optional(),
  rulesSummary: z.string().min(1).max(2000).optional(),
  announcementBanner: z.string().min(1).max(500).optional(),
});

export const translationUpdateSchema = z.object({
  entries: z.record(z.string().min(1).max(120), z.string().max(4000)),
  welcomeMessage: z.string().max(2000).optional(),
  rulesSummary: z.string().max(2000).optional(),
  announcementBanner: z.string().max(500).optional(),
});

export const languageReviewSchema = z.object({
  status: z.enum(['draft', 'in_review', 'approved']),
  notes: z.string().max(500).default(''),
});

export const moderationActionSchema = z.object({
  action: z.enum(['warn', 'timeout', 'untimeout', 'kick', 'ban', 'tempban', 'unban', 'purge', 'slowmode', 'lock', 'unlock']),
  targetUserId: z.string().min(1).max(64),
  targetUsername: z.string().min(1).max(100),
  reason: z.string().min(2).max(500),
  durationMinutes: z.number().int().min(1).max(525600).nullable().optional(),
  channelName: z.string().max(100).nullable().optional(),
});

export const appealReviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  reviewNotes: z.string().min(2).max(500),
});

export const automodUpdateSchema = z.object({
  enabled: z.boolean(),
  spamThresholdCount: z.number().int().min(2).max(50),
  spamWindowSeconds: z.number().int().min(2).max(120),
  repeatedMessageThreshold: z.number().int().min(2).max(20),
  maxMentionsPerMessage: z.number().int().min(1).max(50),
  blockDiscordInvites: z.boolean(),
  blockSuspiciousLinks: z.boolean(),
  suspiciousDomains: z.array(z.string().min(3).max(120)).max(200),
  allowedDomains: z.array(z.string().min(3).max(120)).max(200),
  blockedWords: z.array(z.string().min(1).max(64)).max(500),
  raidJoinThreshold: z.number().int().min(3).max(200),
  raidWindowSeconds: z.number().int().min(5).max(600),
  minAccountAgeHours: z.number().int().min(0).max(720),
  autoSlowmodeSeconds: z.number().int().min(0).max(21600),
  emergencyLockdown: z.boolean(),
  exemptRoleNames: z.array(z.string().max(80)).max(50),
  exemptChannelNames: z.array(z.string().max(80)).max(50),
  escalationActions: z.array(z.enum(['delete', 'warn', 'timeout', 'notify_mods', 'temp_restrict'])).min(1).max(5),
});

export const ticketCreateSchema = z.object({
  category: z.enum(['general_support', 'clan_issue', 'ban_appeal', 'language_help', 'report']),
  subject: z.string().min(3).max(140),
  initialMessage: z.string().min(3).max(2000),
});

export const ticketMessageSchema = z.object({
  content: z.string().min(1).max(2000),
});

export const ticketActionSchema = z.object({
  action: z.enum(['claim', 'transfer', 'close', 'reopen', 'feedback']),
  transferToUserId: z.string().max(64).optional(),
  transferToUsername: z.string().max(100).optional(),
  feedbackRating: z.number().int().min(1).max(5).optional(),
  feedbackComment: z.string().max(500).optional(),
});

export const recruitmentSubmitSchema = z.object({
  formId: z.string().min(1).max(80),
  answers: z.record(z.string().min(1).max(100), z.string().min(1).max(1500)),
});

export const recruitmentReviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  reviewNotes: z.string().min(2).max(500),
});

export const rolePanelCreateSchema = z.object({
  title: z.string().min(2).max(100),
  description: z.string().min(2).max(500),
  channelName: z.string().min(2).max(80),
  mode: z.enum(['buttons', 'select_menu', 'reactions']),
  groupType: z.enum(['exclusive', 'multiple']),
  category: z.enum(['clan_rank', 'language', 'class', 'notification', 'system', 'verified']),
  items: z
    .array(
      z.object({
        roleId: z.string().min(1).max(80),
        label: z.string().min(1).max(60),
        emoji: z.string().min(1).max(16),
        description: z.string().max(120),
      }),
    )
    .min(1)
    .max(25),
});

export const memberUpdateSchema = z.object({
  clanRank: z.enum(CLAN_RANK_ORDER as [import('./types.ts').ClanRankName, ...import('./types.ts').ClanRankName[]]).optional(),
  languageCodes: z.array(z.string().min(2).max(12)).max(20).optional(),
  gamingClasses: z.array(z.string().min(1).max(50)).max(10).optional(),
  notificationRoles: z.array(z.string().min(1).max(60)).max(20).optional(),
  verified: z.boolean().optional(),
  customBio: z.string().max(300).optional(),
});

export const commandExecuteSchema = z.object({
  command: z.string().min(1).max(60),
  args: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  channelName: z.string().min(1).max(80).default('💬・general-chat'),
});

export const customResponseCreateSchema = z.object({
  trigger: z.string().min(1).max(80),
  matchMode: z.enum(['exact', 'contains', 'startsWith']).default('contains'),
  response: z.string().min(1).max(1500),
  languageCode: z.string().max(12).nullable().optional(),
});

export const falsePositiveCreateSchema = z.object({
  channelName: z.string().min(1).max(100),
  sampleContent: z.string().min(1).max(1000),
  ruleHits: z.array(z.string().max(60)).max(20).default([]),
  notes: z.string().min(2).max(500),
});

