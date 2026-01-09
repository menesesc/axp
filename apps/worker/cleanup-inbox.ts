/**
 * Cleanup R2 Inbox - Elimina archivos corruptos/pequeños
 */

import { listR2Objects, deleteR2Object } from './src/processor/r2Client';
import { loadPrefixMap } from './src/config/prefixMap';

const MIN_PDF_SIZE = 1000; // 1 KB mínimo para un PDF válido

async function cleanupInbox() {
  console.log('🧹 Starting inbox cleanup...\n');

  const prefixMap = await loadPrefixMap();

  for (const [prefix, config] of Object.entries(prefixMap)) {
    const bucket = config.r2Bucket;
    if (!bucket) {
      console.log(`⏭️  Skipping ${prefix}: no bucket configured`);
      continue;
    }

    console.log(`\n📦 Checking bucket: ${bucket}`);
    console.log(`   Prefix: ${prefix}`);

    try {
      // Listar archivos en inbox
      const files = await listR2Objects(bucket, 'inbox/');
      
      if (files.length === 0) {
        console.log('   ✅ Inbox is empty\n');
        continue;
      }

      console.log(`   📋 Found ${files.length} file(s) in inbox:\n`);

      for (const file of files) {
        const key = file.Key || '';
        const size = file.Size || 0;
        const sizeKB = (size / 1024).toFixed(2);

        console.log(`   📄 ${key}`);
        console.log(`      Size: ${sizeKB} KB`);

        if (size < MIN_PDF_SIZE) {
          console.log(`      ⚠️  FILE TOO SMALL (< ${MIN_PDF_SIZE} bytes)`);
          console.log(`      🗑️  Deleting corrupted file...`);
          
          try {
            await deleteR2Object(bucket, key);
            console.log(`      ✅ Deleted successfully\n`);
          } catch (error) {
            console.log(`      ❌ Delete failed:`, error);
          }
        } else {
          console.log(`      ✅ File size OK\n`);
        }
      }
    } catch (error) {
      console.log(`   ❌ Error checking bucket ${bucket}:`, error);
    }
  }

  console.log('\n✅ Cleanup complete!');
}

cleanupInbox().catch(console.error);
