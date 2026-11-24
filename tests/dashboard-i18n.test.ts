import assert from 'node:assert/strict';
import test from 'node:test';
import { translate } from '../src/lib/i18n.ts';

test('dashboard translations fall back to the source language', () => {
  assert.equal(translate('Unknown dashboard message', 'sv'), 'Unknown dashboard message');
  assert.equal(translate('Dashboard', 'en'), 'Dashboard');
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
