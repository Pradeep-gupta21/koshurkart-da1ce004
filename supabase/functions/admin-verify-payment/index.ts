import { createClient } from '@supabase/supabase-js';
import { ERROR_CODES } from "../../../src/shared/errorCodes.ts";
import { PaymentError, respondWithError } from "../../../src/shared/errorResponse.ts";
import { ErrorCategory } from "../../../src/shared/statusCodeMap.ts";
import { validateActionRequest } from '../_shared/validation.ts';
import { normalizeRpcError } from '../../../src/shared/rpcErrorNormalizer.ts';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Body {
  paymentId: string;
  orderId: string;
  action: 'approve' | 'reject';
  transactionId?: string;
  note?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return respondWithError(new PaymentError(ErrorCategory.AUTHENTICATION, ERROR_CODES.INTERNAL_ERROR, 'Unauthorized', false), { ...corsHeaders, 'Content-Type': 'application/json' });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Validate JWT and extract user
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return respondWithError(new PaymentError(ErrorCategory.AUTHENTICATION, ERROR_CODES.INTERNAL_ERROR, 'Unauthorized', false), { ...corsHeaders, 'Content-Type': 'application/json' });
    }
    const userId = userData.user.id;

    // Service-role client for admin check + writes
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: isAdmin, error: roleErr } = await admin.rpc('has_role', {
      _user_id: userId,
      _role: 'admin',
    });
    if (roleErr) {
      const mappedErr = normalizeRpcError(roleErr);
      return respondWithError(mappedErr, { ...corsHeaders, 'Content-Type': 'application/json' });
    }
    if (!isAdmin) {
      return respondWithError(new PaymentError(ErrorCategory.AUTHORIZATION, ERROR_CODES.INTERNAL_ERROR, 'Forbidden: admin only', false), { ...corsHeaders, 'Content-Type': 'application/json' });
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return respondWithError(new PaymentError(ErrorCategory.VALIDATION, ERROR_CODES.INTERNAL_ERROR, 'Invalid JSON', false), { ...corsHeaders, 'Content-Type': 'application/json' });
    }

    const valErr = validateActionRequest(body, true);
    if (valErr) {
      return new Response(JSON.stringify(valErr), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Call atomic RPC
    const { data: result, error: rpcErr } = await admin.rpc('admin_process_payment', {
      p_payment_id: body.paymentId,
      p_admin_id: userId,
      p_action: body.action,
      p_transaction_id: body.transactionId ?? null,
      p_note: body.note ?? null,
    });

    if (rpcErr) {
      const mappedErr = normalizeRpcError(rpcErr);
      return respondWithError(mappedErr, { ...corsHeaders, 'Content-Type': 'application/json' });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('admin-verify-payment error:', message);
    return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, 'Internal server error', false), { ...corsHeaders, 'Content-Type': 'application/json' });
  }
});
