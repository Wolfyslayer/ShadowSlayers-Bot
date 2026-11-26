import { isDeepStrictEqual } from 'node:util';
import { applicationDefault, initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createInitialGuildSeed } from '../tests/guild-seed-fixture.ts';

const projectId = 'shadowslayers-7f48f';
const guildIds = ['1478687765863600148', '1574012487114956902'];
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
  for (const guildId of guildIds) {
    const ref = db.collection('guilds').doc(guildId);
    const root = (await ref.get()).data();
    const name = typeof root?.guildName === 'string' ? root.guildName : guildId;
    const fixture = createInitialGuildSeed(guildId, name);
    let candidates = 0;

    function inspect(field: typeof fields[number], value: unknown, path: string) {
      const key = identity(value);
      if (!key) return;
      const expected = fixture[field].find((record) => identity(record) === key);
      if (!expected) return;
      const match = isDeepStrictEqual(normalize(value), normalize(expected));
      if (match) candidates += 1;
      console.log(JSON.stringify({ guildId, path, field, key, match: match ? 'candidate' : 'review-only' }));
    }

    for (const field of fields) {
      const records: unknown = root?.[field];
      if (Array.isArray(records)) {
        for (const record of records) inspect(field, record, ref.path);
      }
    }
    for (const field of ['logs', 'scheduledTasks'] as const) {
      for (const record of fixture[field]) {
        const snap = await ref.collection(field).doc(record.id).get();
        if (snap.exists) inspect(field, snap.data(), snap.ref.path);
      }
    }
    console.log(JSON.stringify({ guildId, guildDocumentExists: Boolean(root), candidates }));
  }
} finally {
  await deleteApp(app);
}
