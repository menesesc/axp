#!/usr/bin/env bun
/**
 * Script para listar proveedores de un cliente
 * 
 * Uso:
 *   bun run list-proveedores.ts <clienteId>
 * 
 * Ejemplo:
 *   bun run list-proveedores.ts 081c9039-9236-4f33-a29a-c63f88bc2e58
 */

import { prisma } from 'database';

async function listProveedores() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('❌ Uso: bun run list-proveedores.ts <clienteId>');
    console.error('');
    console.error('Ejemplo:');
    console.error('  bun run list-proveedores.ts 081c9039-9236-4f33-a29a-c63f88bc2e58');
    process.exit(1);
  }

  const clienteId = args[0]!;

  // Validar que el cliente existe
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
  });

  if (!cliente) {
    console.error(`❌ Cliente no encontrado: ${clienteId}`);
    process.exit(1);
  }

  console.log('🏢 Cliente:', cliente.razonSocial);
  console.log('📋 CUIT:', cliente.cuit);
  console.log('');

  // Obtener proveedores
  const proveedores = await prisma.proveedor.findMany({
    where: { clienteId: clienteId },
    include: {
      _count: {
        select: { documentos: true },
      },
    },
    orderBy: {
      razonSocial: 'asc',
    },
  });

  if (proveedores.length === 0) {
    console.log('⚠️  No hay proveedores registrados');
    console.log('');
    console.log('💡 Para agregar uno, usa:');
    console.log(`   bun run add-proveedor.ts ${clienteId} "NOMBRE DEL PROVEEDOR" "CUIT"`);
    await prisma.$disconnect();
    return;
  }

  console.log(`📦 Total: ${proveedores.length} proveedor(es)`);
  console.log('─'.repeat(80));
  console.log('');

  for (const proveedor of proveedores) {
    const aliasArray = Array.isArray(proveedor.alias) ? proveedor.alias : [];
    
    console.log(`📌 ${proveedor.razonSocial}`);
    console.log(`   ID: ${proveedor.id}`);
    console.log(`   CUIT: ${proveedor.cuit || 'no especificado'}`);
    console.log(`   Documentos: ${proveedor._count.documentos}`);
    console.log(`   Estado: ${proveedor.activo ? '✅ Activo' : '❌ Inactivo'}`);
    
    if (aliasArray.length > 0) {
      console.log(`   Alias: ${aliasArray.join(', ')}`);
    }
    
    console.log('');
  }

  await prisma.$disconnect();
}

listProveedores().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
