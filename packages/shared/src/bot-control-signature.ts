import { createHmac, timingSafeEqual } from 'node:crypto';
import type { BotControlCommand } from './bot-control.ts';

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function commandSigningPayload(command: BotControlCommand): string {
  return stableSerialize({
    id: command.id,
    guildId: command.guildId,
    operation: command.operation,
    payload: command.payload,
    actorUserId: command.actorUserId,
    actorUsername: command.actorUsername,
    createdAt: command.createdAt,
    expiresAt: command.expiresAt,
  });
}

export function signBotControlCommand(command: BotControlCommand, secret: string): string {
  return createHmac('sha256', secret).update(commandSigningPayload(command)).digest('base64url');
}

export function verifyBotControlCommand(command: BotControlCommand, secret: string): boolean {
  if (!secret || typeof command.signature !== 'string') return false;
  const expected = Buffer.from(signBotControlCommand(command, secret));
  const received = Buffer.from(command.signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function signBotControlResult(command: BotControlCommand, result: unknown, secret: string): string {
  const signedResult = stableSerialize({
    commandId: command.id,
    guildId: command.guildId,
    operation: command.operation,
    result,
  });
  return createHmac('sha256', secret).update(signedResult).digest('base64url');
}

export function verifyBotControlResult(command: BotControlCommand, secret: string): boolean {
  if (!secret || typeof command.resultSignature !== 'string') return false;
  const expected = Buffer.from(signBotControlResult(command, command.result, secret));
  const received = Buffer.from(command.resultSignature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
