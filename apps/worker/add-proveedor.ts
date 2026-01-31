#!/usr/bin/env bun
/**
 * Script para agregar proveedores manualmente a la base de datos
 * 
 * Uso:
 *   bun run add-proveedor.ts <clienteId> <razonSocial> [cuit] [alias1,alias2,...]
 * 
 * Ejemplos:
 *   bun run add-proveedor.ts 081c9039-9236-4f33-a29a-c63f88bc2e58 "CARNES DEL SUDOESTE SRL" "30-12345678-9"
 *   bun run add-proveedor.ts 081c9039-9236-4f33-a29a-c63f88bc2e58 "FRIGORÍFICO LA PAMPA SA" "33-98765432-1" "LA PAMPA,FRIGORIFICO PAMPA"
 */

import { prisma } from 'database';

async function addProveedor() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('❌ Uso: bun run add-proveedor.ts <clienteId> <razonSocial> [cuit] [alias1,alias2,...]');
    console.error('');
    console.error('Ejemplos:');
    console.error('  bun run add-proveedor.ts 081c9039-9236-4f33-a29a-c63f88bc2e58 "CARNES DEL SUDOESTE SRL" "30-12345678-9"');
    console.error('  bun run add-proveedor.ts 081c9039-9236-4f33-a29a-c63f88bc2e58 "ACME Corp" "" "ACME,ACME SA"');
    process.exit(1);
  }

  const clienteId = args[0]!;
  const razonSocial = args[1]!;
  const cuit = args[2];
  const aliasStr = args[3];

  // Validar que el cliente existe
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
  });

  if (!cliente) {
    console.error(`❌ Cliente no encontrado: ${clienteId}`);
    process.exit(1);
  }

  console.log(`🏢 Cliente: ${cliente.razonSocial} (${cliente.cuit})`);
  console.log('');

  // Verificar si ya existe por CUIT
  if (cuit && cuit !== '') {
    const existing = await prisma.proveedor.findFirst({
      where: {
        clienteId: clienteId,
        cuit: cuit,
      },
    });

    if (existing) {
      console.error(`⚠️  Ya existe un proveedor con CUIT ${cuit}:`);
      console.error(`   ID: ${existing.id}`);
      console.error(`   Razón Social: ${existing.razonSocial}`);
      console.error('');
      console.error('¿Deseas actualizarlo? Usa el script update-proveedor.ts');
      process.exit(1);
    }
  }

  // Verificar si ya existe por razón social
  const existingByName = await prisma.proveedor.findFirst({
    where: {
      clienteId: clienteId,
      razonSocial: {
        equals: razonSocial,
        mode: 'insensitive',
      },
    },
  });

  if (existingByName) {
    console.error(`⚠️  Ya existe un proveedor con razón social "${razonSocial}":`);
    console.error(`   ID: ${existingByName.id}`);
    console.error(`   CUIT: ${existingByName.cuit || 'no especificado'}`);
    console.error('');
    console.error('¿Deseas actualizarlo? Usa el script update-proveedor.ts');
    process.exit(1);
  }

  // Parsear alias
  const alias = aliasStr && aliasStr !== '' ? aliasStr.split(',').map(a => a.trim()) : [];

  // Crear proveedor
  console.log('➕ Creando proveedor...');
  console.log(`   Razón Social: ${razonSocial}`);
  console.log(`   CUIT: ${cuit || 'no especificado'}`);
  if (alias.length > 0) {
    console.log(`   Alias: ${alias.join(', ')}`);
  }
  console.log('');

  const proveedor = await prisma.proveedor.create({
    data: {
      clienteId: clienteId,
      razonSocial: razonSocial,
      cuit: cuit && cuit !== '' ? cuit : null,
      alias: alias,
      activo: true,
    },
  });

  console.log('✅ Proveedor creado exitosamente!');
  console.log('');
  console.log(`   ID: ${proveedor.id}`);
  console.log(`   Razón Social: ${proveedor.razonSocial}`);
  console.log(`   CUIT: ${proveedor.cuit || 'no especificado'}`);
  if (alias.length > 0) {
    console.log(`   Alias: ${alias.join(', ')}`);
  }
  console.log('');
  console.log('💡 Tip: El sistema ahora buscará este proveedor por:');
  console.log('   1. CUIT (si fue especificado)');
  console.log('   2. Razón social exacta');
  console.log('   3. Alias (si fueron especificados)');
  console.log('   4. Similitud de texto (fuzzy matching) >= 60%');

  await prisma.$disconnect();
}

addProveedor().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
