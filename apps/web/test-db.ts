import { prisma } from './src/lib/prisma'

async function testConnection() {
  try {
    console.log('🔍 Probando conexión a la base de datos...')
    console.log('DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 50) + '...')
    
    // Intentar hacer una consulta simple
    const result = await prisma.$queryRaw`SELECT 1 as test`
    console.log('✅ Conexión exitosa!')
    console.log('Resultado:', result)
    
    // Contar documentos
    const count = await prisma.documentos.count()
    console.log(`📄 Total documentos en DB: ${count}`)
    
    // Contar documentos del cliente específico
    const clienteId = 'cm4lzn12q0000vgb3nkb9xq23'
    const countCliente = await prisma.documentos.count({
      where: { clienteId }
    })
    console.log(`📄 Documentos del cliente ${clienteId}: ${countCliente}`)
    
    // Obtener un documento de ejemplo
    const doc = await prisma.documento.findFirst({
      where: { clienteId },
      include: {
        proveedor: {
          select: {
            id: true,
            razonSocial: true,
          }
        }
      }
    })
    console.log('📋 Documento de ejemplo:', doc ? {
      id: doc.id,
      numeroDocumento: doc.numeroDocumento,
      proveedor: doc.proveedor?.razonSocial,
      total: doc.total,
      estadoRevision: doc.estadoRevision
    } : 'No hay documentos')
    
  } catch (error) {
    console.error('❌ Error de conexión:', error)
    if (error instanceof Error) {
      console.error('Mensaje:', error.message)
      console.error('Stack:', error.stack)
    }
  } finally {
    await prisma.$disconnect()
  }
}

testConnection()
