/**
 * Test AWS Textract Credentials
 * 
 * Verifica que las credenciales AWS sean válidas y tengan permisos de Textract
 */

import { TextractClient, GetDocumentAnalysisCommand } from '@aws-sdk/client-textract';

async function testCredentials() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';
  const region = process.env.TEXTRACT_REGION || 'us-east-1';

  console.log('🔍 Testing AWS Credentials...');
  console.log(`   Access Key ID: ${accessKeyId.substring(0, 4)}...${accessKeyId.substring(accessKeyId.length - 4)} (length: ${accessKeyId.length})`);
  console.log(`   Secret Access Key: ${secretAccessKey.substring(0, 4)}...${secretAccessKey.substring(secretAccessKey.length - 4)} (length: ${secretAccessKey.length})`);
  console.log(`   Region: ${region}`);
  console.log('');

  const client = new TextractClient({
    region,
    credentials: {
      accessKeyId: accessKeyId.trim(),
      secretAccessKey: secretAccessKey.trim(),
    },
  });

  try {
    // Intentar una operación simple que requiere permisos de Textract
    // Esto fallará porque no hay un JobId válido, pero nos dirá si las credenciales son correctas
    await client.send(new GetDocumentAnalysisCommand({ JobId: 'test-job-id' }));
  } catch (error: any) {
    console.log('🔍 Error recibido:', error.name);
    console.log('');
    
    if (error.name === 'InvalidSignatureException') {
      console.log('❌ CREDENCIALES INVÁLIDAS');
      console.log('   Las credenciales AWS son incorrectas o están mal formateadas.');
      console.log('   Verifica:');
      console.log('   1. Access Key ID es correcto');
      console.log('   2. Secret Access Key es correcto');
      console.log('   3. No hay espacios o caracteres extra');
      process.exit(1);
    } else if (error.name === 'InvalidJobIdException') {
      console.log('✅ CREDENCIALES VÁLIDAS');
      console.log('   Las credenciales AWS son correctas y tienen acceso a Textract.');
      console.log('   El error InvalidJobIdException es esperado (usamos un JobId de prueba).');
      process.exit(0);
    } else if (error.name === 'AccessDeniedException') {
      console.log('⚠️  CREDENCIALES VÁLIDAS PERO SIN PERMISOS');
      console.log('   Las credenciales son correctas pero el usuario no tiene permisos de Textract.');
      console.log('   Solución: Agregar policy AmazonTextractFullAccess al usuario IAM.');
      process.exit(1);
    } else {
      console.log('⚠️  ERROR INESPERADO');
      console.log('   Mensaje:', error.message);
      console.log('   Fault:', error.$fault);
      console.log('   Metadata:', error.$metadata);
      process.exit(1);
    }
  }
}

testCredentials();
