import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { ERROR_CODES } from "../../../src/shared/errorCodes.ts";
import { PaymentError, respondWithError } from "../../../src/shared/errorResponse.ts";
import { ErrorCategory } from "../../../src/shared/statusCodeMap.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return respondWithError(new PaymentError(ErrorCategory.AUTHENTICATION, ERROR_CODES.INTERNAL_ERROR, 'Unauthorized', false), { ...corsHeaders, 'Content-Type': 'application/json' });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return respondWithError(new PaymentError(ErrorCategory.AUTHENTICATION, ERROR_CODES.INTERNAL_ERROR, 'Unauthorized', false), { ...corsHeaders, 'Content-Type': 'application/json' });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin, error: roleErr } = await admin.rpc('has_role', {
      _user_id: userData.user.id,
      _role: 'admin',
    });
    if (roleErr || !isAdmin) {
      return respondWithError(new PaymentError(ErrorCategory.AUTHORIZATION, ERROR_CODES.INTERNAL_ERROR, 'Forbidden: admin only', false), { ...corsHeaders, 'Content-Type': 'application/json' });
    }

    const { error } = await admin.rpc('calculate_dynamic_prices');
    if (error) throw error;

    return new Response(JSON.stringify({ success: true, message: 'Dynamic prices recalculated' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('recalculate-prices error:', (err as Error).message);
    return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, 'Internal server error', false), { ...corsHeaders, 'Content-Type': 'application/json' });
  }
});
