#!/usr/bin/env bun

/**
 * Test Script - Valida la estructura del worker sin necesitar DB/R2
 */

import { existsSync } from 'fs';
import { join } from 'path';

console.log('🧪 Running Worker Structure Tests...\n');

const CHECKS = [
  {
    name: 'Config loader exports',
    fn: async () => {
      const { loadPrefixMap, getClienteByPrefix, clearPrefixMapCache } = await import(
        './src/config/prefixMap'
      );
      if (!loadPrefixMap || !getClienteByPrefix || !clearPrefixMapCache) {
        throw new Error('Missing exports');
      }
    },
  },
  {
    name: 'File utils exports',
    fn: async () => {
      const {
        calculateFileSHA256,
        waitForFileStable,
        moveFileSafe,
        extractPrefixFromFilename,
        generateR2Key,
        calculateNextRetry,
        createLogger,
        sleep,
      } = await import('./src/utils/fileUtils');
      if (
        !calculateFileSHA256 ||
        !waitForFileStable ||
        !moveFileSafe ||
        !extractPrefixFromFilename ||
        !generateR2Key ||
        !calculateNextRetry ||
        !createLogger ||
        !sleep
      ) {
        throw new Error('Missing exports');
      }
    },
  },
  {
    name: 'Prefix extraction regex',
    fn: async () => {
      const { extractPrefixFromFilename } = await import('./src/utils/fileUtils');
      const tests = [
        { input: 'weiss_20251226.pdf', expected: 'weiss' },
        { input: 'acme_invoice_001.pdf', expected: 'acme' },
        { input: 'client123_doc.pdf', expected: 'client123' },
        { input: 'noprefix.pdf', expected: null },
        { input: 'no-underscore.pdf', expected: null },
      ];

      for (const test of tests) {
        const result = extractPrefixFromFilename(test.input);
        if (result !== test.expected) {
          throw new Error(
            `extractPrefixFromFilename('${test.input}') = '${result}', expected '${test.expected}'`
          );
        }
      }
    },
  },
  {
    name: 'R2 key generation',
    fn: async () => {
      const { generateR2Key } = await import('./src/utils/fileUtils');
      const date = new Date('2025-01-26T12:34:56Z');
      const key = generateR2Key('cuit=33712152449', 'test.pdf', date);
      const expected = 'cuit=33712152449/2025/01/26/test.pdf';
      if (key !== expected) {
        throw new Error(`generateR2Key() = '${key}', expected '${expected}'`);
      }
    },
  },
  {
    name: 'Retry backoff calculation',
    fn: async () => {
      const { calculateNextRetry } = await import('./src/utils/fileUtils');
      const tests = [
        { attempts: 1, expectedMinutes: 2 },
        { attempts: 2, expectedMinutes: 4 },
        { attempts: 3, expectedMinutes: 8 },
        { attempts: 4, expectedMinutes: 16 },
      ];

      const now = new Date();
      for (const test of tests) {
        const result = calculateNextRetry(test.attempts);
        const diffMs = result.getTime() - now.getTime();
        const diffMinutes = Math.round(diffMs / 1000 / 60);
        if (diffMinutes !== test.expectedMinutes) {
          throw new Error(
            `calculateNextRetry(${test.attempts}) = +${diffMinutes} min, expected +${test.expectedMinutes} min`
          );
        }
      }
    },
  },
  {
    name: 'Documentation files exist',
    fn: async () => {
      const files = ['README.md', 'IMPLEMENTATION-STATUS.md', '.env.example', 'prefix-map.example.json'];
      for (const file of files) {
        if (!existsSync(join(process.cwd(), file))) {
          throw new Error(`Missing file: ${file}`);
        }
      }
    },
  },
  {
    name: 'Docker files exist',
    fn: async () => {
      const files = ['Dockerfile', 'docker-compose.yml', '.dockerignore'];
      for (const file of files) {
        if (!existsSync(join(process.cwd(), file))) {
          throw new Error(`Missing file: ${file}`);
        }
      }
    },
  },
];

let passed = 0;
let failed = 0;

for (const check of CHECKS) {
  try {
    await check.fn();
    console.log(`✅ ${check.name}`);
    passed++;
  } catch (error) {
    console.error(`❌ ${check.name}: ${error instanceof Error ? error.message : error}`);
    failed++;
  }
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
