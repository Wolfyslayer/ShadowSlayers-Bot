import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialGuildSeed } from '../packages/database/src/seed.ts';
import { anonymizeGuildUserData } from '../packages/shared/src/guild-privacy.ts';
import {
  signPrivacyDeletionToken,
  verifyPrivacyDeletionToken,
} from '../packages/permissions/src/privacy-deletion-token.ts';

test('privacy deletion tokens are purpose-specific, signed, and expire after ten minutes', () => {
  const issuedAt = 1_800_000_000_000;
  const secret = 'privacy-test-secret';
  const token = signPrivacyDeletionToken('12345678901234567', secret, issuedAt);

  assert.equal(verifyPrivacyDeletionToken(token, secret, issuedAt)?.userId, '12345678901234567');
  assert.equal(verifyPrivacyDeletionToken(token, 'wrong-secret', issuedAt), null);
  assert.equal(verifyPrivacyDeletionToken(`${token}x`, secret, issuedAt), null);
  assert.equal(verifyPrivacyDeletionToken(token, secret, issuedAt + 10 * 60_000), null);
  assert.throws(() => signPrivacyDeletionToken('not-a-discord-id', secret, issuedAt));
});

test('guild privacy scrub removes profile data and anonymizes retained activity by Discord ID', () => {
  const userId = '12345678901234567';
  const otherUserId = '22345678901234567';
  const guild = createInitialGuildSeed('guild-privacy');
  guild.members = [
    { ...guild.members[0], userId },
    { ...guild.members[1], userId: otherUserId },
  ];
  guild.onboardingRecords = [
    {
      userId,
      username: 'PrivacyUser',
      rulesVerified: true,
      rulesVerifiedAt: null,
      languageSelected: null,
      classSelected: null,
      notificationRolesCount: 0,
      activePlayerRecruitGranted: false,
      activePlayerGrantedAt: null,
      discordScreeningCompleted: null,
      updatedAt: new Date().toISOString(),
    },
  ];
  guild.logs = [
    {
      id: 'privacy-user-log',
      guildId: guild.guildId,
      category: 'moderation',
      actorId: userId,
      actorName: 'PrivacyUser',
      targetId: userId,
      targetName: 'PrivacyUser',
      summary: 'Contains private information',
      details: { userId, note: 'Private note' },
      createdAt: new Date().toISOString(),
    },
  ];
  guild.warnings = [
    {
      id: 'privacy-warning',
      caseId: 'privacy-case',
      userId,
      username: 'PrivacyUser',
      moderatorUsername: 'Moderator',
      reason: 'Private reason',
      active: true,
      createdAt: new Date().toISOString(),
    },
  ];
  guild.reminders = [
    {
      id: 'privacy-reminder',
      userId,
      username: 'PrivacyUser',
      channelName: 'general',
      message: 'Private reminder',
      remindAt: new Date().toISOString(),
      completed: false,
      createdAt: new Date().toISOString(),
    },
  ];
  guild.scheduledTasks = [
    {
      id: 'privacy-reminder-task',
      guildId: guild.guildId,
      type: 'reminder',
      targetId: 'privacy-reminder',
      description: 'Private reminder task',
      runAt: new Date().toISOString(),
      status: 'pending',
      attempts: 0,
      lastError: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
    },
  ];
  guild.tickets = [
    {
      id: 'privacy-ticket',
      ticketNumber: 1,
      category: 'general_support',
      subject: 'Private subject',
      creatorUserId: userId,
      creatorUsername: 'PrivacyUser',
      status: 'closed',
      claimedByUserId: null,
      claimedByUsername: null,
      channelName: 'ticket-1',
      feedbackRating: 5,
      feedbackComment: 'Private feedback',
      messages: [
        { id: 'own-message', authorId: userId, authorName: 'PrivacyUser', authorRole: 'member', content: 'Private message', createdAt: new Date().toISOString() },
        { id: 'other-message', authorId: otherUserId, authorName: 'OtherUser', authorRole: 'member', content: 'Keep this message', createdAt: new Date().toISOString() },
      ],
      createdAt: new Date().toISOString(),
      closedAt: new Date().toISOString(),
    },
  ];

  const scrubbed = anonymizeGuildUserData(guild, userId);

  assert.deepEqual(scrubbed.members.map((member) => member.userId), [otherUserId]);
  assert.equal(scrubbed.onboardingRecords.length, 0);
  assert.equal(scrubbed.warnings[0].userId, '');
  assert.equal(scrubbed.warnings[0].reason.includes('Private'), false);
  assert.equal(scrubbed.logs[0].actorId, '');
  assert.equal(scrubbed.logs[0].targetId, null);
  assert.deepEqual(scrubbed.logs[0].details, {});
  assert.equal(scrubbed.reminders.length, 0);
  assert.equal(scrubbed.scheduledTasks.length, 0);
  assert.equal(scrubbed.tickets[0].creatorUserId, '');
  assert.equal(scrubbed.tickets[0].messages[0].content, '');
  assert.equal(scrubbed.tickets[0].messages[1].content, 'Keep this message');
});
