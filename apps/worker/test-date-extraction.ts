/**
 * Test para extractDateFromFilename
 */

import { extractDateFromFilename } from './src/utils/fileUtils';

console.log('🧪 Testing extractDateFromFilename...\n');

// Test 1: Archivo con fecha válida
const test1 = 'weiss_20251226_231633.pdf';
const date1 = extractDateFromFilename(test1);
console.log(`Test 1: ${test1}`);
console.log(`  Resultado: ${date1.toISOString()}`);
console.log(`  Fecha: ${date1.getFullYear()}/${String(date1.getMonth() + 1).padStart(2, '0')}/${String(date1.getDate()).padStart(2, '0')}`);
console.log(`  ✅ Esperado: 2025/12/26`);
console.log();

// Test 2: Archivo de hoy (08/01/2026)
const test2 = 'weiss_20260108_120000.pdf';
const date2 = extractDateFromFilename(test2);
console.log(`Test 2: ${test2}`);
console.log(`  Resultado: ${date2.toISOString()}`);
console.log(`  Fecha: ${date2.getFullYear()}/${String(date2.getMonth() + 1).padStart(2, '0')}/${String(date2.getDate()).padStart(2, '0')}`);
console.log(`  ✅ Esperado: 2026/01/08`);
console.log();

// Test 3: Archivo sin fecha (fallback a hoy)
const test3 = 'documento_sin_fecha.pdf';
const date3 = extractDateFromFilename(test3);
console.log(`Test 3: ${test3}`);
console.log(`  Resultado: ${date3.toISOString()}`);
console.log(`  Fecha: ${date3.getFullYear()}/${String(date3.getMonth() + 1).padStart(2, '0')}/${String(date3.getDate()).padStart(2, '0')}`);
console.log(`  ⚠️  Fallback a fecha actual`);
console.log();

console.log('✅ Tests completados');
