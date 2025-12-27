# 🧪 Testing Guide

## Quick Validation (No External Dependencies)

### 1. Structure Tests
```bash
cd apps/worker
bun run test-structure.ts
```

Expected output:
```
✅ Config loader exports
✅ File utils exports
✅ Prefix extraction regex
✅ R2 key generation
✅ Retry backoff calculation
✅ Documentation files exist
✅ Docker files exist
📊 Results: 7 passed, 0 failed
```

---

## Manual Integration Testing (Requires Setup)

### Prerequisites
1. PostgreSQL database (Supabase or local)
2. Cloudflare R2 bucket and credentials
3. WebDAV directories created

### Setup

```bash
# 1. Install dependencies (from monorepo root)
cd /path/to/axp
bun install

# 2. Setup database
cd packages/database
cp .env.example .env
# Edit .env with real DATABASE_URL
bun run prisma:push

# 3. Configure worker
cd ../../apps/worker
cp .env.example .env
cp prefix-map.example.json prefix-map.json

# Edit .env:
# - DATABASE_URL (same as above)
# - R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
# - WEBDAV_DIR=/tmp/axp-test/data (for testing)
# - PROCESSED_DIR=/tmp/axp-test/processed
# - FAILED_DIR=/tmp/axp-test/failed

# 4. Create test cliente in DB
cd ../..
bun run packages/database/seed-test-cliente.ts  # TODO: Create this script
# Or manually insert:
# INSERT INTO "Cliente" (id, nombre, cuit, ...) VALUES 
#   ('00000000-0000-0000-0000-000000000001', 'Test Cliente', '33712152449', ...);

# 5. Edit prefix-map.json with real clienteId from DB
vim apps/worker/prefix-map.json

# 6. Create test directories
mkdir -p /tmp/axp-test/{data,processed,failed}
```

### Test Watcher

```bash
# Terminal 1: Run watcher
cd apps/worker
bun run dev:watcher

# Terminal 2: Upload test file
echo "test PDF content" > /tmp/axp-test/data/weiss_test.pdf

# Expected logs in Terminal 1:
# [WATCHER] 📄 Found new file: weiss_test.pdf
# [WATCHER] ⏳ Waiting for file to be stable: weiss_test.pdf
# [WATCHER] 🏢 Detected prefix: weiss
# [WATCHER] ✅ Cliente: 33712152449 (00000000-0000-0000-0000-000000000001)
# [WATCHER] 🔐 Calculating SHA256...
# [WATCHER] 🔐 SHA256: abc123...
# [WATCHER] 📝 Enqueuing file for processing...
# [WATCHER] ✅ File enqueued: weiss_test.pdf (queue id: xyz)
# [WATCHER] 📦 File moved to processed: /tmp/axp-test/processed/weiss_test.pdf

# Verify in DB:
psql $DATABASE_URL -c "SELECT * FROM \"IngestQueue\" WHERE \"sourceRef\" = 'weiss_test.pdf';"

# Expected:
# status = 'PENDING'
# sha256 = 'abc123...'
# attempts = 0
```

### Test Processor

```bash
# Terminal 1: Run processor (watcher should still be running from above)
cd apps/worker
bun run dev:processor

# Expected logs:
# [PROCESSOR] 🚀 Queue Processor starting...
# [PROCESSOR] 📋 Found 1 pending item(s)
# [PROCESSOR] 🔄 Processing queue item: xyz (weiss_test.pdf)
# [PROCESSOR] 📖 Reading file: /tmp/axp-test/processed/weiss_test.pdf
# [PROCESSOR] 🏢 Cliente: 33712152449
# [PROCESSOR] 🔑 R2 key: cuit=33712152449/2025/01/26/weiss_test.pdf
# [PROCESSOR] ☁️  Uploading to R2...
# [PROCESSOR] ✅ Upload successful: cuit=33712152449/2025/01/26/weiss_test.pdf (1234ms)
# [PROCESSOR] ✅ Queue item processed successfully: xyz

# Verify in DB:
psql $DATABASE_URL -c "SELECT status FROM \"IngestQueue\" WHERE \"sourceRef\" = 'weiss_test.pdf';"

# Expected:
# status = 'DONE'

# Verify in R2:
# Log into Cloudflare dashboard → R2 → axp-documents bucket
# Navigate to: cuit=33712152449/2025/01/26/weiss_test.pdf
# Should exist with correct size
```

### Test Error Handling

```bash
# 1. Test invalid prefix
echo "test" > /tmp/axp-test/data/invalid.pdf

# Expected:
# [WATCHER] ❌ Could not extract prefix from filename: invalid.pdf
# File moved to: /tmp/axp-test/failed/invalid.pdf

# 2. Test unknown prefix
echo "test" > /tmp/axp-test/data/unknown_client_file.pdf

# Expected:
# [WATCHER] ❌ No client configuration found for prefix: unknown_client
# File moved to: /tmp/axp-test/failed/unknown_client_file.pdf

# 3. Test duplicate file
cp /tmp/axp-test/processed/weiss_test.pdf /tmp/axp-test/data/weiss_test.pdf

# Expected:
# [WATCHER] ⚠️  File already queued: weiss_test.pdf (queue id: xyz)
# File still moved to processed (no error)

# 4. Test duplicate SHA256 (different filename)
cp /tmp/axp-test/processed/weiss_test.pdf /tmp/axp-test/data/weiss_duplicate.pdf

# Expected:
# [WATCHER] ⚠️  Duplicate file by SHA256: weiss_duplicate.pdf (original: weiss_test.pdf)
# File moved to: /tmp/axp-test/processed/DUPLICATE_weiss_duplicate.pdf
```

### Test Retry Logic

```bash
# 1. Stop processor (Ctrl+C)

# 2. Upload new file
echo "retry test" > /tmp/axp-test/data/weiss_retry.pdf

# Watcher will enqueue it (status = PENDING)

# 3. Simulate R2 failure by setting invalid R2 credentials
vim apps/worker/.env
# Set R2_ACCESS_KEY_ID="invalid"

# 4. Start processor
bun run dev:processor

# Expected:
# [PROCESSOR] 🔄 Processing queue item: abc (weiss_retry.pdf)
# [PROCESSOR] ❌ Error processing queue item abc: ...
# [PROCESSOR] ⚠️  Retry 1/5 for abc. Next retry at: 2025-01-26T12:36:00.000Z

# Verify in DB:
psql $DATABASE_URL -c "SELECT status, attempts, \"nextRetryAt\" FROM \"IngestQueue\" WHERE \"sourceRef\" = 'weiss_retry.pdf';"

# Expected:
# status = 'PENDING'
# attempts = 1
# nextRetryAt = <2 minutes from now>

# 5. Processor will automatically retry after 2 minutes
# After 5 failed attempts:
# status = 'ERROR'
# attempts = 5
# lastError = '...' (truncated to 5000 chars)
```

---

## Docker Testing

### Build and Run

```bash
cd apps/worker

# 1. Build
docker-compose build

# 2. Run both services
docker-compose up

# 3. Test file upload
docker exec -it axp-watcher bash
echo "docker test" > /srv/webdav/data/weiss_docker_test.pdf
exit

# 4. Watch logs
docker-compose logs -f

# Expected: Same logs as manual testing above
```

### Test Container Restart

```bash
# 1. Upload file
docker exec -it axp-watcher bash -c "echo 'restart test' > /srv/webdav/data/weiss_restart.pdf"

# 2. Immediately restart watcher
docker-compose restart axp-watcher

# Expected:
# - Watcher restarts
# - File is detected after restart
# - No duplicate processing (idempotency works)

# 3. Restart processor during upload
docker-compose restart axp-processor

# Expected:
# - Processor restarts
# - Picks up PENDING items
# - Continues processing (no data loss)
```

---

## Performance Testing

### Throughput Test (Watcher)

```bash
# Generate 100 test files
for i in {1..100}; do
  echo "test $i" > /tmp/axp-test/data/weiss_perf_${i}.pdf
done

# Watch processing time
time bun run dev:watcher

# Expected: ~30 files/min (depending on disk I/O)
```

### Concurrency Test (Processor)

```bash
# 1. Generate 20 test files and enqueue them (run watcher once)
for i in {1..20}; do
  echo "concurrent test $i" > /tmp/axp-test/data/weiss_concurrent_${i}.pdf
done

# Wait for watcher to enqueue all

# 2. Start processor with MAX_CONCURRENT_JOBS=10
MAX_CONCURRENT_JOBS=10 bun run dev:processor

# Expected: Processes 10 files simultaneously
# Check logs for parallel uploads
```

---

## Cleanup

```bash
# Stop all processes
docker-compose down

# Delete test directories
rm -rf /tmp/axp-test

# Clean test data from DB
psql $DATABASE_URL -c "DELETE FROM \"IngestQueue\" WHERE \"sourceRef\" LIKE 'weiss_test%' OR \"sourceRef\" LIKE 'weiss_perf%' OR \"sourceRef\" LIKE 'weiss_concurrent%';"

# Delete test files from R2 (via Cloudflare dashboard or CLI)
```

---

## Monitoring Queries

### Queue Status
```sql
SELECT status, COUNT(*) as count, 
       MIN("createdAt") as oldest,
       MAX("createdAt") as newest
FROM "IngestQueue" 
GROUP BY status;
```

### Error Analysis
```sql
SELECT "sourceRef", attempts, "lastError", "updatedAt"
FROM "IngestQueue"
WHERE status = 'ERROR'
ORDER BY "updatedAt" DESC
LIMIT 10;
```

### Processing Times
```sql
-- Average time from enqueue to done
SELECT AVG(EXTRACT(EPOCH FROM ("updatedAt" - "createdAt"))) as avg_seconds
FROM "IngestQueue"
WHERE status = 'DONE'
  AND "createdAt" > NOW() - INTERVAL '1 hour';
```

### Retry Statistics
```sql
SELECT attempts, COUNT(*) as count
FROM "IngestQueue"
WHERE status IN ('PENDING', 'ERROR')
GROUP BY attempts
ORDER BY attempts;
```

---

## Troubleshooting

### Watcher not detecting files
1. Check directory permissions: `ls -la /srv/webdav/data`
2. Check WEBDAV_DIR env var matches
3. Check prefix-map.json is valid JSON
4. Increase WATCHER_POLL_INTERVAL for debugging

### Processor not uploading to R2
1. Verify R2 credentials: `echo $R2_ACCESS_KEY_ID`
2. Test R2 connection manually (AWS CLI)
3. Check PROCESSED_DIR has the files
4. Check IngestQueue has PENDING records

### Files stuck in PROCESSING
1. Query DB: `SELECT * FROM "IngestQueue" WHERE status = 'PROCESSING';`
2. This indicates processor crashed mid-upload
3. Manually reset to PENDING: `UPDATE "IngestQueue" SET status = 'PENDING' WHERE status = 'PROCESSING';`
4. Processor will retry on next poll

### TypeScript errors in editor
- **This is normal!** Bun runtime provides these APIs
- Errors are: `process`, `console`, `Buffer`, `setTimeout`, `fs`, `crypto`
- Files run perfectly with `bun run`
- Ignore editor errors or add `@types/node` (not recommended)
