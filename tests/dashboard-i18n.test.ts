import assert from 'node:assert/strict';
import test from 'node:test';
import { translate } from '../src/lib/i18n.ts';

test('dashboard translations fall back to the source language', () => {
  assert.equal(translate('Unknown dashboard message', 'sv'), 'Unknown dashboard message');
  assert.equal(translate('Dashboard', 'en'), 'Dashboard');
});

test('rate limit errors are localized in Swedish', () => {
  assert.equal(
    translate('Rate limit exceeded. Please wait briefly before retrying.', 'sv'),
    'För många förfrågningar. Vänta en stund och försök igen.',
  );
  assert.equal(
    translate('Rate limiter is temporarily at capacity. Please retry shortly.', 'sv'),
    'Begränsningstjänsten har tillfälligt nått sin kapacitet. Försök igen om en stund.',
  );
});

test('dashboard translations interpolate values without changing dynamic content', () => {
  assert.equal(
    translate('Updated independent language roles for {{username}}.', 'sv', { username: 'Wolfy' }),
    'Fristående språkroller för Wolfy har uppdaterats.',
  );
  assert.equal(
    translate('Hello {{username}}', 'sv', {}),
    'Hello {{username}}',
  );
});

test('dashboard translates data-driven labels used by route views', () => {
  assert.equal(translate('select_menu', 'sv'), 'valmeny');
  assert.equal(translate('verified_live', 'sv'), 'verifierad i Discord');
});

test('dashboard sign-in copy is localized to Swedish', () => {
  assert.equal(translate('Sign in to ShadowSlayers Bot', 'sv'), 'Logga in på ShadowSlayers Bot');
  assert.equal(translate('One bot for your Discord community', 'sv'), 'En bot för din Discord-community');
  assert.equal(
    translate(
      'Manage onboarding, roles, moderation, AutoMod, tickets, and community tools. Add game-specific ranks and classes only when your server needs them.',
      'sv',
    ),
    'Hantera introduktion, roller, moderering, AutoMod, ärenden och communityverktyg. Lägg bara till spelspecifika ranker och klasser om servern behöver dem.',
  );
});

test('privacy deletion controls are localized in Swedish', () => {
  assert.equal(translate('Delete my ShadowSlayers data', 'sv'), 'Radera mina ShadowSlayers-uppgifter');
  assert.equal(translate('Verify with Discord', 'sv'), 'Verifiera med Discord');
  assert.equal(translate('Type DELETE to confirm', 'sv'), 'Skriv DELETE för att bekräfta');
  assert.equal(translate('Discord authorization was cancelled.', 'sv'), 'Discord-auktoriseringen avbröts.');
});
