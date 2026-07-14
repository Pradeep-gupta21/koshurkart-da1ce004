// Payment reconciliation audit – admin-only edge function.
// Returns structured audit data across vendors, orders, transfers, payouts, and ledger.
// deno-lint-ignore-file no-explicit-any ban-unused-ignore
// deno-lint-ignore no-import-prefix
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    /* ── Auth ─────────────────────────────────────────────────────────── */
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await anon.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: isAdmin } = await anon.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    /* ── Service client (bypasses RLS) ────────────────────────────────── */
    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    /* ── 1. All verified vendors ──────────────────────────────────────── */
    // deno-lint-ignore no-explicit-any
    const { data: vendors, error: vendorErr } = await (svc as any)
      .from("vendors")
      .select(
        "id, store_name, verification_status, razorpay_account_id, " +
        "bank_ifsc, bank_account_number_masked, direct_upi_id, " +
        "withdrawable_balance, total_earnings, is_commission_exempt",
      )
      .eq("verification_status", "verified");

    if (vendorErr) {
      console.error("vendors query failed:", vendorErr.message);
      return json({ error: "Failed to query vendors" }, 500);
    }

    const vendorIds = (vendors ?? []).map((v: any) => v.id);

    if (vendorIds.length === 0) {
      return json({
        summary: {
          vendors_missing_destination: { count: 0, total_balance_at_risk: 0 },
          cod_earnings: { count: 0, total_amount: 0 },
          payout_workflow_gaps: { count: 0 },
          balance_discrepancies: { count: 0 },
        },
        details: {
          missing_destination: [],
          cod_earnings: [],
          reconciliation: [],
          orphaned_requests: [],
        },
        generated_at: new Date().toISOString(),
      });
    }

    /* ── 2. COD delivered earnings per vendor ──────────────────────────── */
    // We need order_items joined with orders and payments where
    // payment_method = 'cod', shipping_status = 'delivered', payment_status = 'success'
    const { data: codItems, error: codErr } = await svc
      .from("order_items")
      .select("vendor_id, price, quantity, order_id, orders!inner(id, shipping_status, payment_status)")
      .in("vendor_id", vendorIds)
      .eq("orders.shipping_status", "delivered");

    if (codErr) {
      console.error("COD query failed:", codErr.message);
    }

    // Filter for COD payments – we need to check the payments table
    const { data: codPayments, error: codPayErr } = await svc
      .from("payments")
      .select("order_id, payment_method, payment_status")
      .eq("payment_method", "cod")
      .eq("payment_status", "success");

    if (codPayErr) {
      console.error("COD payments query failed:", codPayErr.message);
    }

    const codOrderIds = new Set((codPayments ?? []).map((p: any) => p.order_id));

    // Build vendor commission map
    const vendorMap = new Map<string, any>();
    for (const v of (vendors ?? [])) {
      vendorMap.set(v.id, v);
    }

    // COD earnings aggregation: only items whose order has a COD payment
    const codByVendor = new Map<string, { count: number; total: number }>();
    for (const item of (codItems ?? [])) {
      if (!item.vendor_id || !codOrderIds.has(item.order_id)) continue;
      const vendor = vendorMap.get(item.vendor_id);
      const commRate = vendor?.is_commission_exempt ? 1.0 : 0.95;
      const lineTotal = Number(item.price) * Number(item.quantity) * commRate;
      const prev = codByVendor.get(item.vendor_id) ?? { count: 0, total: 0 };
      prev.count += 1;
      prev.total += lineTotal;
      codByVendor.set(item.vendor_id, prev);
    }

    /* ── 3. Route transfer totals per vendor ───────────────────────────── */
    // order_items with transfer_status = 'processed', grouped by vendor_id
    // These columns were added in Phase 4 migration but may not be in generated types.
    // Use the svc client which doesn't enforce TS types on column names.
    const { data: transferItems, error: transferErr } = await (svc as any)
      .from("order_items")
      .select("vendor_id, price, quantity")
      .in("vendor_id", vendorIds)
      .eq("transfer_status", "processed");

    if (transferErr) {
      console.error("Transfer query failed:", transferErr.message);
    }

    const routeByVendor = new Map<string, number>();
    for (const item of (transferItems ?? [])) {
      if (!item.vendor_id) continue;
      const vendor = vendorMap.get(item.vendor_id);
      const commRate = vendor?.is_commission_exempt ? 1.0 : 0.95;
      const lineTotal = Number(item.price) * Number(item.quantity) * commRate;
      routeByVendor.set(item.vendor_id, (routeByVendor.get(item.vendor_id) ?? 0) + lineTotal);
    }

    /* ── 4. Payouts completed per vendor ───────────────────────────────── */
    const { data: payoutRows, error: payoutErr } = await svc
      .from("payouts")
      .select("vendor_id, amount")
      .in("vendor_id", vendorIds)
      .eq("status", "completed");

    if (payoutErr) {
      console.error("Payouts query failed:", payoutErr.message);
    }

    const payoutByVendor = new Map<string, number>();
    for (const row of (payoutRows ?? [])) {
      payoutByVendor.set(row.vendor_id, (payoutByVendor.get(row.vendor_id) ?? 0) + Number(row.amount));
    }

    /* ── 5. Ledger balance per vendor ──────────────────────────────────── */
    const { data: ledgerRows, error: ledgerErr } = await svc
      .from("vendor_wallet_ledger")
      .select("vendor_id, type, amount")
      .in("vendor_id", vendorIds);

    if (ledgerErr) {
      console.error("Ledger query failed:", ledgerErr.message);
    }

    const ledgerByVendor = new Map<string, number>();
    for (const row of (ledgerRows ?? [])) {
      // credits add, debits subtract
      const sign = row.type === "debit" || row.type === "payout" ? -1 : 1;
      ledgerByVendor.set(
        row.vendor_id,
        (ledgerByVendor.get(row.vendor_id) ?? 0) + sign * Number(row.amount),
      );
    }

    /* ── 6. In-flight payout_requests ──────────────────────────────────── */
    const { data: inflightReqs, error: reqErr } = await svc
      .from("payout_requests")
      .select("vendor_id, amount, status, requested_at")
      .in("vendor_id", vendorIds)
      .not("status", "in", '("completed","rejected","Completed","Rejected")');

    if (reqErr) {
      console.error("Payout requests query failed:", reqErr.message);
    }

    const reqByVendor = new Map<string, { count: number; total: number }>();
    for (const row of (inflightReqs ?? [])) {
      const prev = reqByVendor.get(row.vendor_id) ?? { count: 0, total: 0 };
      prev.count += 1;
      prev.total += Number(row.amount);
      reqByVendor.set(row.vendor_id, prev);
    }

    /* ── Build response ───────────────────────────────────────────────── */

    // Missing payment destination
    const missingDestination: any[] = [];
    for (const v of (vendors ?? [])) {
      const hasIfsc = !!(v.bank_ifsc && v.bank_account_number_masked);
      const hasUpi = !!v.direct_upi_id;
      if (!hasIfsc && !hasUpi) {
        missingDestination.push({
          vendor_id: v.id,
          store_name: v.store_name,
          verification_status: v.verification_status,
          withdrawable_balance: Number(v.withdrawable_balance ?? 0),
          razorpay_account_id: v.razorpay_account_id,
          has_ifsc: hasIfsc,
          has_upi_id: hasUpi,
        });
      }
    }

    // COD earnings detail
    const codEarningsDetail: any[] = [];
    let codTotalAmount = 0;
    let codTotalCount = 0;
    for (const [vendorId, data] of codByVendor.entries()) {
      const v = vendorMap.get(vendorId);
      codEarningsDetail.push({
        vendor_id: vendorId,
        store_name: v?.store_name ?? "Unknown",
        cod_order_count: data.count,
        cod_delivered_earnings: Math.round(data.total * 100) / 100,
        withdrawable_balance: Number(v?.withdrawable_balance ?? 0),
      });
      codTotalAmount += data.total;
      codTotalCount += data.count;
    }

    // Reconciliation
    const reconciliationDetail: any[] = [];
    let discrepancyCount = 0;
    for (const v of (vendors ?? [])) {
      const balance = Number(v.withdrawable_balance ?? 0);
      const routeTotal = routeByVendor.get(v.id) ?? 0;
      const codTotal = codByVendor.get(v.id)?.total ?? 0;
      const payoutsTotal = payoutByVendor.get(v.id) ?? 0;
      const ledgerTotal = ledgerByVendor.get(v.id) ?? 0;
      const expectedBalance = routeTotal + codTotal - payoutsTotal;
      const difference = balance - expectedBalance;

      // Only include if there's a discrepancy or balance > 0
      if (Math.abs(difference) > 0.01 || balance > 0) {
        const status = Math.abs(difference) <= 0.01 ? "clean" : "discrepancy";
        if (status === "discrepancy") discrepancyCount++;

        reconciliationDetail.push({
          vendor_id: v.id,
          store_name: v.store_name,
          withdrawable_balance: Math.round(balance * 100) / 100,
          route_transfer_total: Math.round(routeTotal * 100) / 100,
          cod_total: Math.round(codTotal * 100) / 100,
          payouts_total: Math.round(payoutsTotal * 100) / 100,
          ledger_total: Math.round(ledgerTotal * 100) / 100,
          expected_balance: Math.round(expectedBalance * 100) / 100,
          difference: Math.round(difference * 100) / 100,
          status,
        });
      }
    }

    // Orphaned payout requests
    const orphanedRequests: any[] = [];
    let orphanCount = 0;
    for (const [vendorId, data] of reqByVendor.entries()) {
      const v = vendorMap.get(vendorId);
      orphanedRequests.push({
        vendor_id: vendorId,
        store_name: v?.store_name ?? "Unknown",
        pending_request_count: data.count,
        total_requested: Math.round(data.total * 100) / 100,
        reason: "Payout request without completed payout",
      });
      orphanCount += data.count;
    }

    const response = {
      summary: {
        vendors_missing_destination: {
          count: missingDestination.length,
          total_balance_at_risk: Math.round(
            missingDestination.reduce((s, v) => s + v.withdrawable_balance, 0) * 100,
          ) / 100,
        },
        cod_earnings: {
          count: codTotalCount,
          total_amount: Math.round(codTotalAmount * 100) / 100,
        },
        payout_workflow_gaps: { count: orphanCount },
        balance_discrepancies: { count: discrepancyCount },
      },
      details: {
        missing_destination: missingDestination,
        cod_earnings: codEarningsDetail,
        reconciliation: reconciliationDetail,
        orphaned_requests: orphanedRequests,
      },
      generated_at: new Date().toISOString(),
    };

    return json(response);
  } catch (err) {
    console.error("audit-payment-reconciliation error:", (err as Error).message);
    return json({ error: "Internal server error" }, 500);
  }
});
