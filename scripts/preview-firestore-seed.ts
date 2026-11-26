import { isDeepStrictEqual } from 'node:util';
import { applicationDefault, initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createInitialGuildSeed } from '../tests/guild-seed-fixture.ts';

const projectId = 'shadowslayers-7f48f';
const guildIds = ['1478687765863600148', '1574012487114956902'];
const apply = process.argv[2] === '--apply-confirmed-test-seed';
if (process.argv.length !== (apply ? 3 : 2)) throw new Error('Invalid arguments.');
if (apply && process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Unset FIRESTORE_EMULATOR_HOST before applying the reviewed production inventory.');
}
const reviewedCounts = [17, 8];
const reviewed = [
  new Set([
    'onboardingRecords:u-106', 'customResponses:cr-welcome-help', 'warnings:warn-1',
    'appeals:appeal-1', 'achievements:ach-founder', 'achievements:ach-raid-veteran',
    'recruitmentForms:form-clan', 'recruitmentForms:form-staff',
    'recruitmentApplications:app-1', 'tickets:ticket-101', 'suggestions:sug-1',
    'polls:poll-1', 'giveaways:giveaway-1', 'birthdays:bday-1',
    'scheduledTasks:task-giveaway-1', 'logs:log-1:document',
    'scheduledTasks:task-giveaway-1:document',
  ]),
  new Set([
    'customResponses:cr-welcome-help', 'warnings:warn-1', 'achievements:ach-founder',
    'recruitmentForms:form-clan', 'recruitmentForms:form-staff', 'suggestions:sug-1',
    'polls:poll-1', 'birthdays:bday-1',
  ]),
];
const fields = [
  'members', 'onboardingRecords', 'customResponses', 'moderationCases',
  'warnings', 'appeals', 'logs', 'achievements', 'recruitmentForms',
  'recruitmentApplications', 'tickets', 'suggestions', 'polls', 'giveaways',
  'birthdays', 'scheduledTasks',
] as const;
const timestampFields = new Set([
  'createdAt', 'updatedAt', 'joinedAt', 'lastActiveAt', 'rulesVerifiedAt',
  'activePlayerGrantedAt', 'expiresAt', 'endsAt', 'runAt', 'submittedAt',
]);

function normalize(value: unknown, key = ''): unknown {
  if (typeof value === 'string' && timestampFields.has(key) &&
      /^\d{4}-\d{2}-\d{2}T.*Z$/.test(value) && Number.isFinite(Date.parse(value))) {
    return '<generated timestamp>';
  }
  if (Array.isArray(value)) return value.map((item) => normalize(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([name, item]) => [name, normalize(item, name)]));
  }
  return value;
}

function identity(record: unknown): string | null {
  if (!record || typeof record !== 'object') return null;
  const data = record as Record<string, unknown>;
  const key = data.id ?? data.userId;
  return typeof key === 'string' ? key : null;
}

const app = initializeApp({
  projectId,
  credential: applicationDefault(),
});

try {
  const db = getFirestore(app);
  const report = await db.runTransaction(async (tx) => {
  const report: object[] = [];
  const writes: Array<() => void> = [];
  for (const [index, guildId] of guildIds.entries()) {
    const ref = db.collection('guilds').doc(guildId);
    const root = (await tx.get(ref)).data();
    const name = typeof root?.guildName === 'string' ? root.guildName : guildId;
    const fixture = createInitialGuildSeed(guildId, name);
    let candidates = 0;

    function inspect(field: typeof fields[number], value: unknown, path: string) {
      const key = identity(value);
      if (!key) return;
      const expected = fixture[field].find((record) => identity(record) === key);
      if (!expected) return;
      const match = isDeepStrictEqual(normalize(value), normalize(expected));
      if (apply && match && !reviewed[index].has(`${field}:${key}${path === ref.path ? '' : ':document'}`)) {
        throw new Error(`Unreviewed match for ${guildId}: ${field}/${key}. No changes applied.`);
      }
      if (match) candidates += 1;
      report.push({ guildId, path, field, key, match: match ? 'candidate' : 'review-only' });
      return match;
    }

    const updates: Record<string, unknown[]> = {};
    for (const field of fields) {
      const records: unknown = root?.[field];
      if (Array.isArray(records)) {
        const retained = records.filter((record) => !inspect(field, record, ref.path));
        if (retained.length !== records.length) updates[field] = retained;
      }
    }
    if (Object.keys(updates).length) writes.push(() => { tx.update(ref, updates); });
    for (const field of ['logs', 'scheduledTasks'] as const) {
      for (const record of fixture[field]) {
        const snap = await tx.get(ref.collection(field).doc(record.id));
        if (snap.exists && inspect(field, snap.data(), snap.ref.path)) {
          writes.push(() => { tx.delete(snap.ref); });
        }
      }
    }
    if (apply && (!root || candidates !== reviewedCounts[index])) {
      throw new Error(`Inventory changed for ${guildId}. Run the read-only preview again. No changes applied.`);
    }
    report.push({ guildId, guildDocumentExists: Boolean(root), candidates });
  }
  if (apply) for (const write of writes) write();
  return report;
  }, apply ? { readOnly: false } : { readOnly: true });
  for (const line of report) console.log(JSON.stringify(line));
  if (apply) console.log('Committed cleanup of matching records for both reviewed test guilds.');
} finally {
  await deleteApp(app);
}
