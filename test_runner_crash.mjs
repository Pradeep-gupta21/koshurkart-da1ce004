import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runTests() {
  console.log("Starting comprehensive Phase 4 testing...");

  // Setup user and test data
  const email = `testuser_${Date.now()}@example.com`;
  const password = 'Password123!';
  const { data: userCreated, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { terms_accepted: true }
  });
  if (createErr) throw createErr;
  
  const { data: authData, error: signInErr } = await supabase.auth.signInWithPassword({
    email, password
  });
  if (signInErr) throw signInErr;
  
  const jwt = authData.session.access_token;
  const fixtures = {
    vendorId: crypto.randomUUID(),
    productId: crypto.randomUUID(),
    storeSlug: `test-store-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
  };
  
  const { error: vendorErr } = await admin.from('vendors').upsert({
    id: fixtures.vendorId, user_id: authData.user.id, store_name: 't', store_slug: fixtures.storeSlug, business_name: 't', withdrawable_balance: 0
  });
  if (vendorErr) throw new Error(`Vendor upsert: ${vendorErr.message}`);

  const orderId = crypto.randomUUID();
  const orderItemId = crypto.randomUUID();
  
  const { error: orderErr } = await admin.from('orders').insert({
    id: orderId, user_id: authData.user.id, order_status: 'delivered'
  });
  if (orderErr) throw new Error(`Orders insert: ${orderErr.message}`);

  const { error: productErr } = await admin.from('products').upsert({
    id: fixtures.productId, vendor_id: fixtures.vendorId, title: 'test item',
    slug: `test-product-${Date.now()}`, price: 100
  });
  if (productErr) throw new Error(`Product insert: ${productErr.message}`);

  const { error: orderItemErr } = await admin.from('order_items').insert({
    id: orderItemId, order_id: orderId, vendor_id: fixtures.vendorId, product_id: fixtures.productId,
    quantity: 1, price: 100, return_status: 'none', title: 'test item'
  });
  if (orderItemErr) throw new Error(`Order items insert: ${orderItemErr.message}`);

  const callEdgeFunction = async (payload, customJwt = jwt) => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/customer-request-return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${customJwt}` },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: res.status, body };
  };

  // Issue 5: Storage Integration Verification
  console.log("Test 1: Storage Integration (Upload & RLS)");
  const dummyFile = new Blob(['dummy content'], { type: 'image/jpeg' });
  const fileName = `return_${Date.now()}.jpg`;
  
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } }
  });
  
  // Create bucket if missing — idempotent: 'Bucket already exists' is not an error.
  const { error: bucketErr } = await admin.storage.createBucket('return-photos', { public: false });
  if (bucketErr && !bucketErr.message.toLowerCase().includes('already exists')) {
    throw new Error(`Storage bucket creation failed: ${bucketErr.message}`);
  }
  
  const { data: uploadData, error: uploadErr } = await authClient.storage
    .from('return-photos')
    .upload(`${authData.user.id}/${fileName}`, dummyFile);
    
  if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);
  console.log("  - Upload successful:", uploadData.path);
  const photoPath = uploadData.path;

  const errorCodeOf = (res) =>
    res.body && typeof res.body === 'object'
      ? (res.body.errorCode ?? res.body.error?.code)
      : undefined;

  // Issue 6: Validation Boundary Testing
  console.log("Test 2: Validation boundaries");
  const missingReason = await callEdgeFunction({ order_item_id: orderItemId, return_description: "t", return_photos: [] });
  assert.equal(missingReason.status, 400);
  assert.equal(errorCodeOf(missingReason), 'MISSING_REQUIRED_FIELDS');

  // Issue 3: Expand Runtime Integration Assertions (Success)
  console.log("Test 3: Successful initial request & atomic persistence");
  const payload = {
    order_item_id: orderItemId,
    return_reason: "damaged",
    return_description: "The item was completely broken.",
    return_photos: [photoPath]
  };
  const successRes = await callEdgeFunction(payload);
  assert.equal(successRes.status, 200, JSON.stringify(successRes.body));
  
  const { data: persisted, error: persistedErr } = await admin.from('order_items').select('*').eq('id', orderItemId).single();
  if (persistedErr) {
    throw new Error(`Test 3 read-back failed: ${persistedErr.message}`);
  }
  assert.equal(persisted.return_status, 'requested');
  assert.equal(persisted.return_reason, payload.return_reason);
  assert.equal(persisted.return_description, payload.return_description);
  assert.deepEqual(persisted.return_photos, payload.return_photos);
  assert.ok(persisted.return_requested_at, "return_requested_at should be set");
  console.log("  - Persistence verified. Timestamp:", persisted.return_requested_at);

  // Issue 4: Replay Immutability Verification
  console.log("Test 4: Idempotent replay immutability");
  const replayRes = await callEdgeFunction(payload);
  assert.equal(replayRes.status, 200);
  assert.equal(replayRes.body?.isIdempotentReplay, true);
  
  const { data: replayed, error: replayedErr } = await admin.from('order_items').select('*').eq('id', orderItemId).single();
  if (replayedErr) {
    throw new Error(`Test 4 read-back failed: ${replayedErr.message}`);
  }
  assert.equal(replayed.return_status, persisted.return_status);
  assert.equal(replayed.return_reason, persisted.return_reason);
  assert.equal(replayed.return_description, persisted.return_description);
  assert.deepEqual(replayed.return_photos, persisted.return_photos);
  assert.equal(replayed.return_requested_at, persisted.return_requested_at, "Timestamp must not mutate on replay");
  console.log("  - Immutability verified. Timestamp remains:", replayed.return_requested_at);

  // Issue 1: Canonical Error Taxonomy (Invalid State)
  console.log("Test 5: Canonical Error Taxonomy for invalid state (HTTP 400)");
  // Mutate to an invalid state (e.g. approved) first using admin client
  const { error: test5UpdateErr } = await admin.from('order_items').update({ return_status: 'approved' }).eq('id', orderItemId);
  if (test5UpdateErr) {
    throw new Error(`Test 5 SETUP FAILED: unable to force return_status to approved. DB Error: ${test5UpdateErr.message}`);
  }

  const { data: test5VerifyRow, error: test5VerifyErr } = await admin.from('order_items').select('return_status').eq('id', orderItemId).single();
  if (test5VerifyErr) {
    throw new Error(`Test 5 SETUP FAILED: unable to read back forced state. DB Error: ${test5VerifyErr.message}`);
  }
  if (test5VerifyRow.return_status !== 'approved') {
    throw new Error(`Test 5 SETUP FAILED: expected return_status='approved' but found '${test5VerifyRow.return_status}'. Business assertions were intentionally skipped because the fixture was not prepared correctly.`);
  }

  const invalidStateRes = await callEdgeFunction({
    order_item_id: orderItemId,
    return_reason: "wrong_item",
    return_description: "Another reason entirely",
    return_photos: []
  });
  assert.equal(invalidStateRes.status, 400, "Test 5 BUSINESS FAILURE: invalid state did not produce the expected HTTP 400 response. Got: " + JSON.stringify(invalidStateRes.body));
  assert.equal(errorCodeOf(invalidStateRes), 'BAD_REQUEST');
  console.log("  - Error mapping verified");

  // Issue 5: Direct Database Mutation Protection (HTTP — authenticated user)
  console.log("Test 6: Direct Database Mutation Protection (HTTP, authenticated user → blocked)");
  
  // Attempt to mutate the state to 'none' (fixture is currently 'approved')
  const { data: mutationRows, error: directMutationErr } = await authClient
    .from('order_items')
    .update({ return_status: 'none' })
    .eq('id', orderItemId)
    .select();
    
  const { data: verifyData, error: verifyErr } = await admin.from('order_items').select('return_status').eq('id', orderItemId).single();

  if (verifyErr) {
    throw new Error(`Test 6 VERIFICATION FAILED:\nUnable to read the order_item after the unauthorized mutation attempt.\n\nDatabase Error:\n${verifyErr.message}`);
  }

  if (verifyData.return_status !== 'approved') {
    throw new Error(`Test 6 BUSINESS FAILURE:\nUnauthorized direct database mutation succeeded.\nExpected return_status to remain 'approved' but found '${verifyData.return_status}' after an authenticated client update.\nThe protection layer failed to block the mutation.`);
  }

  const diagnostics = [];
  if (directMutationErr) {
    const msg = directMutationErr.message || '';
    if (msg.match(/gateway|trigger/i)) diagnostics.push("✓ Trigger rejected the mutation");
    else if (msg.match(/row-level security|rls/i)) diagnostics.push("✓ RLS rejected the mutation");
    else if (msg.match(/permission/i)) diagnostics.push("✓ Permission denied");
    else diagnostics.push(`✓ Database error: ${msg}`);
  } else if (mutationRows && mutationRows.length === 0) {
    diagnostics.push("✓ Zero rows updated");
  }
  diagnostics.push("✓ Row remained unchanged");

  console.log("  - Protection verified:\n    " + diagnostics.join("\n    "));

  // =====================================================================
  // NEW: Native Execution Tests
  // Simulate the 'postgres' (migration/psql/pg_cron) native context by
  // using the service_role admin client WITHOUT PostgREST JWT injection.
  // The admin client bypasses RLS, but the trigger must still allow the
  // mutation because in native context request.jwt.claims is NULL/empty.
  //
  // Note: In Supabase's local stack, the service_role HTTP client still
  // injects a JWT. To test the *native* path (request.jwt.claims = NULL),
  // we use npx supabase db query which connects as the postgres superuser.
  // =====================================================================

  // Test 7A: Native path — supabase db query (postgres superuser, no JWT)
  console.log("Test 7: Native execution context (postgres superuser, no JWT claims) → allowed");
  const nativeOrderItemId = crypto.randomUUID();
  const nativeOrderId = crypto.randomUUID();
  
  const { error: nativeOrderErr } = await admin.from('orders').insert({
    id: nativeOrderId, user_id: authData.user.id, order_status: 'delivered'
  });
  if (nativeOrderErr) {
    throw new Error(`Test 7 SETUP FAILED [Fixture Error]: Could not insert native order fixture. ${nativeOrderErr.message}`);
  }

  // Use explicit UUIDs to prevent cross-test contamination rather than subqueries
  const buildNativeInsertSql = (itemId, ordId, vendId, prodId) => 
    `INSERT INTO public.order_items (id, order_id, vendor_id, product_id, quantity, price, return_status, title) VALUES ('${itemId}', '${ordId}', '${vendId}', '${prodId}', 1, 100, 'requested', 'native test item');`;
  const buildNativeUpdateSql = (itemId) => 
    `UPDATE public.order_items SET return_status = 'approved' WHERE id = '${itemId}';`;
  const buildNativeCleanupSql = (itemId) => 
    `DELETE FROM public.order_items WHERE id = '${itemId}';`;
    
  const nativeInsertSql = buildNativeInsertSql(nativeOrderItemId, nativeOrderId, fixtures.vendorId, fixtures.productId);
  const nativeUpdateSql = buildNativeUpdateSql(nativeOrderItemId);
  const nativeCleanupSql = buildNativeCleanupSql(nativeOrderItemId);
  
  const { execSync } = await import('node:child_process');
  
  // 1. Verify Supabase CLI Compatibility
  try {
    execSync('npx supabase db query --help', { cwd: process.cwd(), stdio: 'pipe' });
  } catch (e) {
    const cliOutput = e.stdout?.toString() || '';
    const cliError = e.stderr?.toString() || e.message;
    throw new Error(
      `Test 7 SETUP FAILED [CLI Verification Error]:\n` +
      `The installed Supabase CLI does not support the 'db query' command.\n` +
      `Output: ${cliOutput.trim()}\n` +
      `Error: ${cliError.trim()}\n` +
      `Remediation: Update the Supabase CLI to v2.79.0 or later, which supports 'supabase db query'.`
    );
  }
  
  const runNativeSql = (sql, stepName) => {
    try {
      execSync(`npx supabase db query "${sql}"`, { cwd: process.cwd(), stdio: 'pipe' });
      // 5. Remove unused return value (now void)
    } catch (e) {
      const stdout = e.stdout?.toString() || '';
      const stderr = e.stderr?.toString() || '';
      const exitCode = e.status ?? 'unknown';
      
      let failCategory = "Unexpected database error";
      const errLower = stderr.toLowerCase();
      
      // 4. Reduce Brittle String Matching via SQLSTATE
      const sqlStateMatch = stderr.match(/SQLSTATE[ :]*([A-Z0-9]+)/i);
      const sqlState = sqlStateMatch ? sqlStateMatch[1].toUpperCase() : null;

      if (exitCode !== 0 && !sqlState && !stderr.includes('ERROR:')) {
        failCategory = "CLI execution failure";
      } else if (sqlState === '42601') {
        failCategory = "SQL syntax error";
      } else if (sqlState === '23503' || sqlState === '23502' || sqlState === '23505') {
        failCategory = "Fixture creation failure";
      } else if ((sqlState === 'P0001' || !sqlState) && errLower.includes('must use gateway')) {
        // 3. Improve Authorization Failure Classification
        failCategory = "Trigger rejection";
      } else if (sqlState === '42501') {
        if (errLower.includes('row-level security') || errLower.includes('rls')) {
          failCategory = "RLS rejection";
        } else if (errLower.includes('permission denied for table')) {
          failCategory = "Missing table privilege";
        } else if (errLower.includes('permission denied for schema')) {
          failCategory = "Schema privilege issue";
        } else {
          failCategory = "Generic authorization failure";
        }
      }

      const diagnosticMessage = `
=== Native Execution Diagnostic ===
Category: ${failCategory}
Step: ${stepName}
Command: npx supabase db query "<sql>"
SQL Statement: ${sql}
SQLSTATE: ${sqlState || 'N/A'}
Exit Code: ${exitCode}
--- STDOUT ---
${stdout.trim() || '(empty)'}
--- STDERR ---
${stderr.trim() || '(empty)'}
===================================
`;
      throw new Error(`Test 7 FAILED: ${failCategory}\n${diagnosticMessage}`);
    }
  };

  // 2. Guarantee Cleanup Using finally
  let nativeTestErr = null;
  try {
    runNativeSql(nativeInsertSql, "Native Insert");
    runNativeSql(nativeUpdateSql, "Native Update (Auth check)");
    console.log("  - Native postgres mutation correctly ALLOWED (trigger passed native context check)");
  } catch (e) {
    nativeTestErr = e;
  } finally {
    try {
      runNativeSql(nativeCleanupSql, "Native Cleanup");
    } catch (cleanupErr) {
      if (nativeTestErr) {
        console.error(`\n[Cleanup Failure] Note: Cleanup also failed after the primary error:\n${cleanupErr.message}`);
      } else {
        nativeTestErr = cleanupErr;
      }
    }
  }

  if (nativeTestErr) {
    throw nativeTestErr;
  }

  // Test 7B: Customer HTTP Edge Function path → internal service-role database access remains allowed
  // This is already proven by Test 3 (successful initial request via Edge Function).
  // Explicitly restate the assertion here for clarity.
  console.log("Test 8: Customer HTTP Edge Function path → internal service-role database access remains allowed");
  // Create a fresh order_item for a clean Edge Function internal service_role test
  const serviceRoleItemId = crypto.randomUUID();
  const { error: srInsertErr } = await admin.from('order_items').insert({
    id: serviceRoleItemId, order_id: orderId, vendor_id: fixtures.vendorId,
    product_id: fixtures.productId,
    quantity: 1, price: 100, return_status: 'none', title: 'internal service_role test item'
  });
  if (srInsertErr) throw new Error(`Internal service_role item insert: ${srInsertErr.message}`);

  const serviceRoleRes = await callEdgeFunction({
    order_item_id: serviceRoleItemId,
    return_reason: 'damaged',
    return_description: 'Verifying internal service_role database access is still allowed post-trigger-fix.',
    return_photos: []
  });
  assert.equal(serviceRoleRes.status, 200, "Customer Edge Function (internal service_role) must succeed. Got: " + JSON.stringify(serviceRoleRes.body));
  const { data: srItem, error: srItemErr } = await admin.from('order_items').select('return_status').eq('id', serviceRoleItemId).single();
  if (srItemErr) {
    throw new Error(`Test 8 read-back failed: ${srItemErr.message}`);
  }
  assert.equal(srItem.return_status, 'requested', "return_status must be 'requested' after Customer Edge Function call");
  console.log("  - Customer HTTP Edge Function path → internal service-role database access correctly ALLOWED");

  console.log("\n=== ALL TESTS PASSED. ===");
}

process.on('unhandledRejection', (reason) => {
  console.error('\n[FATAL] Unhandled Promise Rejection:');
  console.error(reason);
  process.exitCode = 1;
});

process.on('uncaughtException', (error) => {
  console.error('\n[FATAL] Uncaught Exception:');
  console.error(error);
  process.exit(1);
});

runTests()
  .then(() => {
    process.exitCode ??= 0;
  })
  .catch((error) => {
    console.error('\n[FATAL] Test suite failed:');
    console.error(error);
    process.exitCode = 1;
  });
