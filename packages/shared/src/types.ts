export type ClanRankName =
  | '👑 Shadow King'
  | '🛡️ Shadow Council'
  | '⚔️ Warlord'
  | '🔥 Elite Warrior'
  | '🖤 ShadowSlayer'
  | '🌱 Recruit';

export const CLAN_RANK_ORDER: ClanRankName[] = [
  '👑 Shadow King',
  '🛡️ Shadow Council',
  '⚔️ Warlord',
  '🔥 Elite Warrior',
  '🖤 ShadowSlayer',
  '🌱 Recruit',
];

export type RoleCategory = 'clan_rank' | 'language' | 'class' | 'notification' | 'system' | 'verified';

export type ResourceLifecycleState =
  | 'discovered'
  | 'mapped'
  | 'missing'
  | 'conflicting'
  | 'proposed'
  | 'confirmed'
  | 'applying'
  | 'applied'
  | 'failed'
  | 'requires_manual_setup';

export interface PermissionOverwriteSnapshot {
  targetId: string;
  targetType: 'role' | 'member';
  targetName: string;
  allow: string[];
  deny: string[];
}

export interface GuildRoleRecord {
  id: string;
  discordRoleId: string | null;
  name: string;
  aliases: string[];
  category: RoleCategory;
  rankOrder: number; // Higher = higher privilege for clan_rank; 0 for language/class/notification
  position: number;
  permissionsBitfield: string;
  intendedPermissions: string[];
  colorHex: string | null; // Null when legacy color is unverified/unknown
  hoist: boolean | null;
  selfAssignable: boolean;
  exclusiveGroupId: string | null;
  discoveredFromExisting: boolean;
  mapped: boolean;
  mentionable: boolean;
  excludeFromAutoSetup?: boolean;
  requiresAdminReview?: boolean;
  unknownLegacyProperties?: string[];
  lifecycleState: ResourceLifecycleState;
  conflictCandidates?: { id: string; name: string }[];
}

export interface DiscoveredChannel {
  id: string;
  discordChannelId: string | null;
  name: string;
  type: 'text' | 'voice' | 'announcement' | 'forum';
  expectedType?: 'text' | 'voice' | 'announcement' | 'forum';
  categoryId: string | null;
  expectedCategoryId?: string | null;
  actualParentCategoryName?: string | null;
  topic: string;
  isPrivateLeadership: boolean;
  readOnlyForMembers: boolean;
  accessClassification: 'public_onboarding' | 'verified_member' | 'clan_member' | 'class_hall' | 'leadership_only';
  languageCode: string | null;
  mappedRolePurpose: string | null;
  discoveredFromExisting: boolean;
  required: boolean;
  misplacedCategory?: boolean;
  typeMismatch?: boolean;
  permissionOverwrites: PermissionOverwriteSnapshot[];
  lifecycleState: ResourceLifecycleState;
  conflictCandidates?: { id: string; name: string }[];
}

export interface DiscoveredCategory {
  id: string;
  discordCategoryId: string | null;
  name: string;
  position: number;
  isPrivateLeadership: boolean;
  discoveredFromExisting: boolean;
  lifecycleState: ResourceLifecycleState;
  permissionOverwrites: PermissionOverwriteSnapshot[];
  conflictCandidates?: { id: string; name: string }[];
  channels: DiscoveredChannel[];
}

export interface ChannelPlacementDiff {
  channelName: string;
  discordChannelId: string;
  expectedCategoryName: string;
  actualCategoryName: string | null;
}

export interface ChannelTypeDiff {
  channelName: string;
  discordChannelId: string;
  expectedType: DiscoveredChannel['type'];
  actualType: DiscoveredChannel['type'];
}

export interface PermissionAuditFinding {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  targetType: 'category' | 'channel' | 'role';
  targetName: string;
  summary: string;
  expectedPolicy: string;
  actualState: string;
}

export interface ProposedSetupChange {
  id: string;
  kind:
    | 'map_existing_category'
    | 'map_existing_role'
    | 'map_existing_channel'
    | 'create_category'
    | 'create_channel'
    | 'create_role'
    | 'resolve_conflict'
    | 'manual_review_required'
    | 'incorrect_category_placement'
    | 'incorrect_channel_type'
    | 'permission_diff'
    | 'link_permission_guard';
  targetName: string;
  parentCategoryName?: string;
  reason: string;
  nonDestructive: true;
  status: ResourceLifecycleState;
  verifiedDiscordId: string | null;
  error: string | null;
}

export interface ServerDiscoverySnapshot {
  guildId: string;
  guildName: string;
  lastDiscoveredAt: string;
  categories: DiscoveredCategory[];
  uncategorizedChannels: DiscoveredChannel[];
  optionalChannels: DiscoveredChannel[];
  roles: GuildRoleRecord[];
  incorrectPlacements: ChannelPlacementDiff[];
  incorrectTypes: ChannelTypeDiff[];
  permissionDifferences: PermissionAuditFinding[];
  proposedChanges: ProposedSetupChange[];
  conflictsCount: number;
  missingCount: number;
  setupConfirmedBy: string | null;
  setupConfirmedAt: string | null;
}

export interface LanguageChannelTemplate {
  key: string;
  slug: string;
  purpose: 'welcome' | 'rules' | 'announcements' | 'general' | 'support' | 'guides';
  type: 'text' | 'announcement';
  readOnlyForMembers: boolean;
}

export interface TranslationReviewInfo {
  status: 'draft' | 'in_review' | 'approved';
  reviewedBy: string | null;
  reviewedAt: string | null;
  notes: string;
}

export interface LanguageConfig {
  code: string; // e.g., 'en', 'ru', 'sv'
  name: string; // e.g., 'English', 'Russian', 'Swedish'
  nativeName: string; // e.g., 'English', 'Русский', 'Svenska'
  flagEmoji: string; // e.g., '🇬🇧', '🇷🇺', '🇸🇪'
  enabled: boolean;
  isDefault: boolean;
  roleId: string | null;
  roleName: string;
  categoryName: string; // e.g., '🇸🇪 Swedish'
  categoryId: string | null;
  channelsCreated: boolean;
  channelTemplates: LanguageChannelTemplate[];
  createdChannels: { key: string; name: string; channelId: string | null }[];
  version: number;
  review: TranslationReviewInfo;
  welcomeMessage: string;
  rulesSummary: string;
  announcementBanner: string;
  updatedAt: string;
}

export interface TranslationBundle {
  code: string;
  version: number;
  entries: Record<string, string>;
  updatedBy: string;
  updatedAt: string;
}

export interface OnboardingConfig {
  enabled: boolean;
  welcomeChannelName: string;
  rulesChannelName: string;
  rulesMessageId: string | null;
  rulesReactionEmoji: string;
  rulesPublishedAt: string | null;
  roleSelectionChannelNames: string[];
  verifiedRoleName: string;
  recruitRoleName: string;
  requireExplicitRulesAcceptance: boolean;
  autoAssignRecruitOnVerify: false; // Never grant 🌱 Recruit automatically on rules verification; requires Step 5 active-player action
  allowMultipleLanguages: boolean;
  protectInnerSanctum: boolean;
  welcomeLogChannelName: string;
  defaultWelcomeTemplate: string;
  rulesTitle: string;
  rulesBody: string;
}

export interface OnboardingMemberRecord {
  userId: string;
  username: string;
  rulesVerified: boolean;
  rulesVerifiedAt: string | null;
  languageSelected: string | null;
  classSelected: string | null;
  notificationRolesCount: number;
  activePlayerRecruitGranted: boolean;
  activePlayerGrantedAt: string | null;
  discordScreeningCompleted: boolean | null;
  updatedAt: string;
}

export interface CustomResponseRule {
  id: string;
  trigger: string;
  matchMode: 'exact' | 'contains' | 'startsWith';
  response: string;
  enabled: boolean;
  languageCode: string | null;
  createdBy: string;
  createdAt: string;
}

export interface AutoModFalsePositiveReport {
  id: string;
  reporterUserId: string;
  reporterUsername: string;
  channelName: string;
  sampleContent: string;
  ruleHits: string[];
  notes: string;
  status: 'open' | 'resolved' | 'dismissed';
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface RolePanelItem {
  roleId: string;
  label: string;
  emoji: string;
  description: string;
}

export interface RolePanel {
  id: string;
  title: string;
  description: string;
  channelName: string;
  mode: 'buttons' | 'select_menu' | 'reactions';
  groupType: 'exclusive' | 'multiple';
  category: RoleCategory;
  published: boolean;
  publishedAt: string | null;
  publishedMessageId?: string | null;
  items: RolePanelItem[];
}

export interface TemporaryRoleGrant {
  id: string;
  userId: string;
  username: string;
  roleId: string;
  roleName: string;
  grantedBy: string;
  expiresAt: string;
  active: boolean;
}

export type ModerationActionType = 'warn' | 'timeout' | 'untimeout' | 'kick' | 'ban' | 'tempban' | 'unban' | 'purge' | 'slowmode' | 'lock' | 'unlock';

export interface ModerationCase {
  caseId: string;
  sequence: number;
  guildId: string;
  action: ModerationActionType;
  targetUserId: string;
  targetUsername: string;
  moderatorUserId: string;
  moderatorUsername: string;
  reason: string;
  durationMinutes: number | null;
  expiresAt: string | null;
  active: boolean;
  channelName: string | null;
  discordExecutionStatus: 'verified_live' | 'dry_run_no_bot' | 'failed';
  discordError: string | null;
  createdAt: string;
}

export interface WarningRecord {
  id: string;
  caseId: string;
  userId: string;
  username: string;
  moderatorUsername: string;
  reason: string;
  active: boolean;
  createdAt: string;
}

export interface ModerationAppeal {
  id: string;
  caseId: string;
  userId: string;
  username: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewerUsername: string | null;
  reviewNotes: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface AutoModConfig {
  enabled: boolean;
  spamThresholdCount: number;
  spamWindowSeconds: number;
  repeatedMessageThreshold: number;
  maxMentionsPerMessage: number;
  blockDiscordInvites: boolean;
  blockSuspiciousLinks: boolean;
  suspiciousDomains: string[];
  allowedDomains: string[];
  blockedWords: string[];
  raidJoinThreshold: number;
  raidWindowSeconds: number;
  minAccountAgeHours: number;
  autoSlowmodeSeconds: number;
  emergencyLockdown: boolean;
  exemptRoleNames: string[];
  exemptChannelNames: string[];
  escalationActions: ('delete' | 'warn' | 'timeout' | 'notify_mods' | 'temp_restrict')[];
  neverAutoPermaban: true;
}

export type LogCategory =
  | 'member_join'
  | 'member_leave'
  | 'member_update'
  | 'message_edit'
  | 'message_delete'
  | 'role_change'
  | 'channel_create'
  | 'channel_delete'
  | 'channel_update'
  | 'permission_change'
  | 'voice_activity'
  | 'moderation'
  | 'automod'
  | 'ticket'
  | 'recruitment'
  | 'config_change'
  | 'bot_error'
  | 'dashboard_action';

export interface AuditLogEntry {
  id: string;
  guildId: string;
  category: LogCategory;
  actorId: string;
  actorName: string;
  targetId: string | null;
  targetName: string | null;
  summary: string;
  details: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface LoggingConfig {
  enabled: boolean;
  retentionDays: number;
  channels: Record<LogCategory, string>;
}

export interface GuildMemberRecord {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  clanRank: ClanRankName | null;
  hasClanRank?: boolean;
  languageCodes: string[]; // Completely independent from clanRank
  gamingClasses: string[];
  notificationRoles: string[];
  verified: boolean;
  xp: number;
  level: number;
  messagesCount: number;
  voiceMinutes: number;
  achievements: string[];
  customBio: string;
  lastXpAt: string | null;
  lastMessageHash: string | null;
  joinedAt: string;
  lastActiveAt: string;
  isDeparted: boolean;
  deletedAt: string | null;
}

export interface ProgressionConfig {
  enabled: boolean;
  xpPerMessageMin: number;
  xpPerMessageMax: number;
  cooldownSeconds: number;
  minMessageLength: number;
  blockDuplicateMessages: boolean;
  blockBotCommands: boolean;
  levelCurveMultiplier: number;
  inactivityThresholdDays: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  criteriaType: 'level' | 'messages' | 'raids' | 'languages' | 'manual';
  threshold: number;
}

export interface RecruitmentField {
  id: string;
  label: string;
  type: 'short_text' | 'long_text' | 'select';
  required: boolean;
  options?: string[];
}

export interface RecruitmentForm {
  id: string;
  category: 'clan' | 'staff' | 'event';
  title: string;
  description: string;
  enabled: boolean;
  targetRoleName: string;
  fields: RecruitmentField[];
}

export interface RecruitmentApplication {
  id: string;
  formId: string;
  category: 'clan' | 'staff' | 'event';
  applicantUserId: string;
  applicantUsername: string;
  answers: Record<string, string>;
  status: 'pending' | 'approved' | 'rejected';
  reviewerUserId: string | null;
  reviewerUsername: string | null;
  reviewNotes: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface TicketMessage {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  content: string;
  createdAt: string;
}

export interface TicketRecord {
  id: string;
  ticketNumber: number;
  category: 'general_support' | 'clan_issue' | 'ban_appeal' | 'language_help' | 'report';
  subject: string;
  creatorUserId: string;
  creatorUsername: string;
  status: 'open' | 'claimed' | 'closed';
  claimedByUserId: string | null;
  claimedByUsername: string | null;
  channelName: string;
  feedbackRating: number | null;
  feedbackComment: string | null;
  messages: TicketMessage[];
  createdAt: string;
  closedAt: string | null;
}

export interface SuggestionItem {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  description: string;
  status: 'open' | 'under_review' | 'planned' | 'implemented' | 'declined';
  upvotes: string[];
  downvotes: string[];
  createdAt: string;
}

export interface PollItem {
  id: string;
  question: string;
  authorName: string;
  options: { id: string; label: string; voterIds: string[] }[];
  closed: boolean;
  endsAt: string;
  createdAt: string;
}

export interface GiveawayItem {
  id: string;
  prize: string;
  hostName: string;
  winnerCount: number;
  entrants: string[];
  winnerIds: string[];
  status: 'active' | 'ended';
  endsAt: string;
  createdAt: string;
}

export interface CommunityEvent {
  id: string;
  title: string;
  description: string;
  eventType: 'raid' | 'dungeon' | 'community' | 'tournament';
  gameId: string;
  hostName: string;
  startsAt: string;
  maxParticipants: number | null;
  rsvps: { userId: string; username: string; status: 'going' | 'tentative' | 'declined'; roleClass: string | null }[];
  createdAt: string;
}

export interface ReminderItem {
  id: string;
  userId: string;
  username: string;
  channelName: string;
  message: string;
  remindAt: string;
  completed: boolean;
  createdAt: string;
}

export interface BirthdayRecord {
  id: string;
  userId: string;
  username: string;
  month: number;
  day: number;
}

export interface ChallengeItem {
  id: string;
  title: string;
  description: string;
  rewardXp: number;
  active: boolean;
  completions: number;
  endsAt: string;
}

export interface ScheduledAnnouncement {
  id: string;
  title: string;
  channelName: string;
  languageCode: string;
  content: string;
  scheduledFor: string;
  sent: boolean;
  createdBy: string;
}

export interface GameDefinition {
  id: string;
  name: string;
  shortCode: string;
  active: boolean;
  ranks?: string[];
}

export interface GamingClassDef {
  id: string;
  gameId: string;
  name: string;
  roleArchetype?: string;
}

export interface ClanTeam {
  id: string;
  name: string;
  gameId: string;
  leaderUserId: string;
  leaderUsername: string;
  memberIds: string[];
  description: string;
  maxSize: number;
}

export interface RaidSchedule {
  id: string;
  title: string;
  kind: 'raid' | 'dungeon';
  gameId: string;
  teamId: string | null;
  leaderUsername: string;
  scheduledFor: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  attendance: { userId: string; username: string; state: 'present' | 'late' | 'absent' | 'excused' }[];
}

export type ScheduledTaskType =
  | 'tempban_expiry'
  | 'temprole_expiry'
  | 'reminder'
  | 'giveaway_draw'
  | 'event_notify'
  | 'birthday'
  | 'scheduled_announcement'
  | 'log_cleanup'
  | 'inactivity_report';

export interface ScheduledTask {
  id: string;
  guildId: string;
  type: ScheduledTaskType;
  targetId: string;
  description: string;
  runAt: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  attempts: number;
  lastError: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface GuildModulesConfig {
  discovery: boolean;
  multilingual: boolean;
  onboarding: boolean;
  roles: boolean;
  moderation: boolean;
  automod: boolean;
  logging: boolean;
  progression: boolean;
  recruitment: boolean;
  tickets: boolean;
  community: boolean;
  clan: boolean;
  scheduler: boolean;
}

export interface GuildState {
  schemaVersion: number;
  guildId: string;
  guildName: string;
  discovery: ServerDiscoverySnapshot;
  modules: GuildModulesConfig;
  languages: LanguageConfig[];
  translations: Record<string, TranslationBundle>;
  onboarding: OnboardingConfig;
  onboardingRecords: OnboardingMemberRecord[];
  customResponses: CustomResponseRule[];
  falsePositiveReports: AutoModFalsePositiveReport[];
  rolePanels: RolePanel[];
  temporaryRoles: TemporaryRoleGrant[];
  moderationCases: ModerationCase[];
  warnings: WarningRecord[];
  appeals: ModerationAppeal[];
  automod: AutoModConfig;
  logging: LoggingConfig;
  logs: AuditLogEntry[];
  members: GuildMemberRecord[];
  progression: ProgressionConfig;
  achievements: AchievementDef[];
  recruitmentForms: RecruitmentForm[];
  recruitmentApplications: RecruitmentApplication[];
  tickets: TicketRecord[];
  ticketSequence: number;
  caseSequence: number;
  suggestions: SuggestionItem[];
  polls: PollItem[];
  giveaways: GiveawayItem[];
  events: CommunityEvent[];
  reminders: ReminderItem[];
  birthdays: BirthdayRecord[];
  challenges: ChallengeItem[];
  scheduledAnnouncements: ScheduledAnnouncement[];
  games: GameDefinition[];
  gamingClasses: GamingClassDef[];
  teams: ClanTeam[];
  raidSchedules: RaidSchedule[];
  scheduledTasks: ScheduledTask[];
  updatedAt: string;
}

export interface AdminAuthRecord {
  passwordHash: string;
  salt: string;
  claimedAt: string;
  username: string;
}

export interface DatabaseRoot {
  schemaVersion: number;
  adminAuth: AdminAuthRecord | null;
  guilds: Record<string, GuildState>;
}

export interface AuthorizedDiscordGuild {
  guildId: string;
  name: string;
  owner: boolean;
  permissions: string;
}

export interface AuthUserSession {
  userId: string;
  username: string;
  avatarUrl: string | null;
  provider: 'discord_oauth';
  clanRank: ClanRankName | null;
  guildVerified: boolean;
  guildId?: string;
  authorizedGuildIds: string[];
  discordRoleIds: string[];
  permissions: string[];
  lastVerifiedAt?: string;
  expiresAt: string;
}
