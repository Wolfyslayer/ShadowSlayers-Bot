import type {
  LanguageChannelTemplate,
  LanguageConfig,
  TranslationBundle,
} from '../../shared/src/types.ts';

export const BASE_TRANSLATION_KEYS: Record<string, string> = {
  'onboarding.welcome_title': 'Welcome to ShadowSlayers – Legends of Elements',
  'onboarding.welcome_body':
    'Step past the Gate of Shadows. Read the realm rules, accept the covenant, and choose your languages and elemental class.',
  'onboarding.rules_accept_button': 'Accept Rules & Verify',
  'onboarding.verified_success': 'You have been granted the ✅ Verified role and access to the Common Hall.',
  'onboarding.language_prompt': 'Select one or more languages to unlock your Language Realms:',
  'commands.help_header': 'ShadowSlayers Command Codex',
  'commands.no_permission': 'You lack the required clan rank to execute this command.',
  'commands.hierarchy_blocked': 'You cannot moderate a member of equal or higher clan rank.',
  'moderation.warn_issued': 'Formal warning logged under Case #{caseId}.',
  'moderation.timeout_issued': 'Member timed out for {duration} minutes (Case #{caseId}).',
  'moderation.tempban_issued': 'Temporary ban issued until {expiresAt} (Case #{caseId}).',
  'tickets.panel_title': 'Inner Sanctum Support Desk',
  'tickets.created': 'Ticket #{ticketNumber} opened. A council member will respond shortly.',
  'tickets.closed': 'Ticket #{ticketNumber} has been closed and archived.',
  'recruitment.submitted': 'Your application has been submitted for council review.',
  'recruitment.approved': 'Congratulations! Your application has been approved.',
  'clan.raid_reminder': 'Raid assembly begins soon. Confirm attendance in the Legends of Elements hall.',
};

export const RUSSIAN_TRANSLATIONS: Record<string, string> = {
  'onboarding.welcome_title': 'Добро пожаловать в ShadowSlayers – Legends of Elements',
  'onboarding.welcome_body':
    'Пройдите через Врата Теней. Ознакомьтесь с правилами, примите устав и выберите языки и класс стихий.',
  'onboarding.rules_accept_button': 'Принять правила и подтвердить',
  'onboarding.verified_success': 'Вам выдана роль ✅ Verified и открыт доступ в Общий зал.',
  'onboarding.language_prompt': 'Выберите один или несколько языков для доступа к языковым разделам:',
  'commands.help_header': 'Кодекс команд ShadowSlayers',
  'commands.no_permission': 'У вас недостаточно прав кланового ранга для выполнения этой команды.',
  'commands.hierarchy_blocked': 'Вы не можете применять модерацию к участнику равного или более высокого ранга.',
  'moderation.warn_issued': 'Предупреждение зарегистрировано под делом #{caseId}.',
  'moderation.timeout_issued': 'Участник отправлен в тайм-аут на {duration} мин. (Дело #{caseId}).',
  'moderation.tempban_issued': 'Временный бан выдан до {expiresAt} (Дело #{caseId}).',
  'tickets.panel_title': 'Служба поддержки Внутреннего Святилища',
  'tickets.created': 'Тикет #{ticketNumber} открыт. Совет скоро ответит.',
  'tickets.closed': 'Тикет #{ticketNumber} закрыт и сохранён в архив.',
  'recruitment.submitted': 'Ваша заявка отправлена на рассмотрение совета.',
  'recruitment.approved': 'Поздравляем! Ваша заявка одобрена.',
  'clan.raid_reminder': 'Скоро сбор в рейд. Подтвердите участие в зале Legends of Elements.',
};

export const DEFAULT_CHANNEL_TEMPLATES: LanguageChannelTemplate[] = [
  { key: 'welcome', slug: 'welcome', purpose: 'welcome', type: 'text', readOnlyForMembers: true },
  { key: 'rules', slug: 'rules', purpose: 'rules', type: 'text', readOnlyForMembers: true },
  { key: 'announcements', slug: 'announcements', purpose: 'announcements', type: 'announcement', readOnlyForMembers: true },
  { key: 'general', slug: 'general', purpose: 'general', type: 'text', readOnlyForMembers: false },
  { key: 'support', slug: 'support', purpose: 'support', type: 'text', readOnlyForMembers: false },
  { key: 'guides', slug: 'guides', purpose: 'guides', type: 'text', readOnlyForMembers: false },
];

export interface CompletenessReport {
  code: string;
  totalKeys: number;
  translatedKeys: number;
  missingKeys: string[];
  completenessPercent: number;
  readyForPublication: boolean;
}

export function calculateCompleteness(
  language: LanguageConfig,
  bundle: TranslationBundle | undefined,
): CompletenessReport {
  const requiredKeys = Object.keys(BASE_TRANSLATION_KEYS);
  const entries = bundle?.entries ?? {};
  const missingKeys = requiredKeys.filter((k) => !entries[k] || entries[k].trim().length === 0);
  const translatedKeys = requiredKeys.length - missingKeys.length;
  const completenessPercent =
    requiredKeys.length === 0 ? 100 : Math.round((translatedKeys / requiredKeys.length) * 100);

  return {
    code: language.code,
    totalKeys: requiredKeys.length,
    translatedKeys,
    missingKeys,
    completenessPercent,
    readyForPublication:
      missingKeys.length === 0 &&
      language.review.status === 'approved' &&
      language.welcomeMessage.trim().length > 0 &&
      language.rulesSummary.trim().length > 0,
  };
}

export function previewLanguageChannels(language: LanguageConfig): {
  categoryName: string;
  roleName: string;
  channels: { key: string; name: string; type: 'text' | 'announcement'; readOnly: boolean }[];
} {
  const codeLower = language.code.toLowerCase();
  return {
    categoryName: language.categoryName || `${language.flagEmoji} ${language.name}`,
    roleName: language.roleName || language.nativeName,
    channels: language.channelTemplates.map((tpl) => ({
      key: tpl.key,
      name: `${language.flagEmoji}・${codeLower}-${tpl.slug}`,
      type: tpl.type,
      readOnly: tpl.readOnlyForMembers,
    })),
  };
}

/**
 * Creates a deterministic, non-AI draft language configuration and empty translation template
 * so administrators can enter and review translations manually before publication.
 */
export function createLanguageDraft(input: {
  code: string;
  name: string;
  nativeName: string;
  flagEmoji: string;
  welcomeMessage?: string;
  rulesSummary?: string;
  announcementBanner?: string;
  actorName: string;
}): { config: LanguageConfig; bundle: TranslationBundle } {
  const code = input.code.toLowerCase().trim();
  const now = new Date().toISOString();

  const emptyEntries: Record<string, string> = {};
  for (const key of Object.keys(BASE_TRANSLATION_KEYS)) {
    emptyEntries[key] = '';
  }

  const config: LanguageConfig = {
    code,
    name: input.name.trim(),
    nativeName: input.nativeName.trim(),
    flagEmoji: input.flagEmoji.trim(),
    enabled: false, // Must be reviewed/approved before enabling & publishing
    isDefault: false,
    roleId: null,
    roleName: input.name.trim(),
    categoryName: `${input.flagEmoji.trim()} ${input.name.trim()}`,
    categoryId: null,
    channelsCreated: false,
    channelTemplates: DEFAULT_CHANNEL_TEMPLATES.map((t) => ({ ...t })),
    createdChannels: [],
    version: 1,
    review: {
      status: 'draft',
      reviewedBy: null,
      reviewedAt: null,
      notes: 'Created from base translation template. Manual translation and review required.',
    },
    welcomeMessage: input.welcomeMessage?.trim() || '',
    rulesSummary: input.rulesSummary?.trim() || '',
    announcementBanner: input.announcementBanner?.trim() || '',
    updatedAt: now,
  };

  const bundle: TranslationBundle = {
    code,
    version: 1,
    entries: emptyEntries,
    updatedBy: input.actorName,
    updatedAt: now,
  };

  return { config, bundle };
}

export function formatLocalizedString(
  bundle: TranslationBundle | undefined,
  fallbackBundle: TranslationBundle | undefined,
  key: string,
  params: Record<string, string | number> = {},
): string {
  const raw =
    (bundle?.entries[key] && bundle.entries[key].trim().length > 0 ? bundle.entries[key] : null) ??
    fallbackBundle?.entries[key] ??
    BASE_TRANSLATION_KEYS[key] ??
    key;

  return raw.replace(/\{(\w+)\}/g, (_match, token) =>
    params[token] !== undefined ? String(params[token]) : `{${token}}`,
  );
}
