import assert from 'node:assert/strict';
import test from 'node:test';
import type { BotControlCommand } from '../packages/shared/src/bot-control.ts';
import {
  signBotControlCommand,
  signBotControlResult,
  verifyBotControlCommand,
  verifyBotControlResult,
} from '../packages/shared/src/bot-control-signature.ts';

test('bot-control signatures authenticate immutable command fields and reject payload changes', () => {
  const command: BotControlCommand<'moderation.execute'> = {
    id: 'command-signature-001',
    guildId: 'guild-signature-1',
    operation: 'moderation.execute',
    payload: {
      action: 'timeout',
      targetUserId: '123456789012345678',
      reason: 'initial reason',
      durationMinutes: 10,
      channelName: 'general',
    },
    actorUserId: '987654321098765432',
    actorUsername: 'moderator',
    signature: '',
    status: 'queued',
    createdAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-01T00:01:00.000Z',
  };
  const secret = 'a sufficiently long bot-control secret for testing';
  command.signature = signBotControlCommand(command, secret);
  assert.equal(verifyBotControlCommand(command, secret), true);
  assert.equal(verifyBotControlCommand({
    ...command,
    status: 'processing',
    workerId: 'worker',
    claimedAt: '2026-01-01T00:00:01.000Z',
  }, secret), true);

  const changed = {
    ...command,
    payload: { ...command.payload, reason: 'altered reason' },
  };
  assert.equal(verifyBotControlCommand(changed, secret), false);
  assert.equal(verifyBotControlCommand(command, 'different secret'), false);

  const completed = {
    ...command,
    result: { ok: true },
    resultSignature: signBotControlResult(command, { ok: true }, secret),
  };
  assert.equal(verifyBotControlResult(completed, secret), true);
  assert.equal(verifyBotControlResult({ ...completed, result: { ok: false } }, secret), false);
});
