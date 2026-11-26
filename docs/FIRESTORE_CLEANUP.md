# Firestore sample data inventory and cleanup

1. In Android Chrome, open the Google Cloud console for `shadowslayers-7f48f` in desktop mode. Open Firestore → Databases → the database used by the API → Data. Use an authorized read-only identity for the inventory.
2. Review each guild separately under `guilds/{guildId}`, including its embedded arrays and subcollections. Use `tests/guild-seed-fixture.ts` to identify candidates. A matching ID or display name alone is insufficient: compare the full fixture payload, provenance and real Discord IDs. Retain all ambiguous or modified records.
3. Keep a private inventory with exact document path or guild field and record key, matching evidence, dependencies, and a proposed retain or remove decision. Review references from members, onboarding, logs, tickets, cases and scheduled tasks. Do not paste real member data into GitHub or chat.
4. Before cleanup, take an owner-approved Firestore export to an existing authorized storage bucket via Firestore → Import/Export. Confirm billing, storage access and retention before exporting. Record the export URI and completed operation ID privately. Verify the backup can be read and restored in an approved isolated destination before scheduling cleanup.
5. Obtain explicit owner approval for the exact record inventory and backup. Recheck each candidate against the reviewed snapshot. Use narrow writes scoped to its guild and record, preserving unrelated concurrent writes. Skip changed records and record the result per candidate.
6. Verify real members, settings and activity remain available after an approved cleanup. If needed, restore only affected records from the verified backup using a reviewed recovery plan.

No production inventory, export, or cleanup has been performed as part of this PR.
