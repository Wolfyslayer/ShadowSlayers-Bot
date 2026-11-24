#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

console.log('[Security Audit] Running automated security & AI-hygiene verification...');

const FORBIDDEN_AI_PACKAGES = [
  '@google/genai',
  'openai',
  'anthropic',
  '@anthropic-ai/sdk',
  'langchain',
  '@langchain/core',
  'ollama',
  'cohere-ai',
  '@google/generative-ai',
];

const ROOT_DIR = path.resolve(__dirname, '..');

// 1. Inspect package.json
const pkgPath = path.join(ROOT_DIR, 'package.json');
if (!fs.existsSync(pkgPath)) {
  console.error('[FAIL] package.json is missing.');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const allDeps = {
  ...(pkg.dependencies || {}),
  ...(pkg.devDependencies || {}),
  ...(pkg.peerDependencies || {}),
};

for (const forbidden of FORBIDDEN_AI_PACKAGES) {
  if (allDeps[forbidden]) {
    console.error(`[FAIL] Forbidden AI dependency detected in package.json: "${forbidden}"`);
    process.exit(1);
  }
}
console.log('✓ package.json contains 0 forbidden AI libraries.');

// 2. Inspect package-lock.json
const lockPath = path.join(ROOT_DIR, 'package-lock.json');
if (!fs.existsSync(lockPath)) {
  console.error('[FAIL] package-lock.json is missing. Run "npm install --package-lock-only" or "npm ci".');
  process.exit(1);
}

const lockfile = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const lockPackages = lockfile.packages || {};
for (const [pkgKey, pkgMeta] of Object.entries(lockPackages)) {
  const normalizedName = pkgKey.replace(/^node_modules\//, '');
  if (FORBIDDEN_AI_PACKAGES.includes(normalizedName)) {
    console.error(`[FAIL] Forbidden AI dependency detected in package-lock.json: "${normalizedName}"`);
    process.exit(1);
  }
}
console.log('✓ package-lock.json verified: 0 AI packages present.');

// 3. Verify no uncommitted live .env secret files exist
const liveEnvPath = path.join(ROOT_DIR, '.env');
if (fs.existsSync(liveEnvPath)) {
  console.warn('⚠️ Notice: .env file found in workspace. Ensuring it is listed in .gitignore.');
  const gitignorePath = path.join(ROOT_DIR, '.gitignore');
  const gitignoreContent = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
  if (!gitignoreContent.includes('.env')) {
    console.error('[FAIL] .env is not ignored in .gitignore! Secrets risk.');
    process.exit(1);
  }
}

// 4. Verify .env.example does not contain hardcoded private keys
const envExamplePath = path.join(ROOT_DIR, '.env.example');
if (fs.existsSync(envExamplePath)) {
  const envContent = fs.readFileSync(envExamplePath, 'utf8');
  if (envContent.includes('-----BEGIN PRIVATE KEY-----') || envContent.includes('AIzaSy')) {
    console.error('[FAIL] Real private key or API key found in .env.example!');
    process.exit(1);
  }
  console.log('✓ .env.example verified: clean templates without hardcoded private credentials.');
}

// 5. Verify 16 Legacy Roles integrity
const legacyFile = path.join(ROOT_DIR, 'packages/shared/src/legacy-template.ts');
if (fs.existsSync(legacyFile)) {
  const content = fs.readFileSync(legacyFile, 'utf8');
  const EXPECTED_ROLES = [
    '👑 Shadow King',
    '🛡️ Shadow Council',
    '⚔️ Warlord',
    '🔥 Elite Warrior',
    '🖤 ShadowSlayer',
    '🌱 Recruit',
    '⚔️ Warrior',
    '🔮 Sorcerer',
    '🗡️ Swordsman',
    '📢 Event Pings',
    '🐉 Boss Pings',
    '🏆 PvP Pings',
    '🇬🇧 English',
    '🇷🇺 Русский',
    '🤖 Bots',
    '✅ Verified',
  ];
  for (const role of EXPECTED_ROLES) {
    if (!content.includes(role)) {
      console.error(`[FAIL] Legacy role definition missing from legacy-template.ts: "${role}"`);
      process.exit(1);
    }
  }
  console.log('✓ Legacy role integrity verified: all 16 canonical roles preserved with exact names & emojis.');
}

console.log('[Security Audit] All security & AI-hygiene checks passed successfully.');
