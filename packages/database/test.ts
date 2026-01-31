import { prisma } from './src/index'

console.log('Cliente Prisma:', prisma)
console.log('Modelos disponibles:', Object.keys(prisma).filter(k => !k.startsWith('_') && !k.startsWith('$')))
console.log('¿Tiene modelo documento?:', 'documento' in prisma)
console.log('Tipo de prisma.documento:', typeof (prisma as any).documento)
