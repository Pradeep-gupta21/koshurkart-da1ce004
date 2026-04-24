import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;

    // Service-role client for admin check + writes
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: isAdmin, error: roleErr } = await admin.rpc('has_role', {
      _user_id: userId,
      _role: 'admin',
    });
    if (roleErr || !isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as Body;
    if (!body?.paymentId || !body?.orderId || !['approve', 'reject'].includes(body?.action)) {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify payment exists and is UPI
    const { data: payment, error: payErr } = await admin
      .from('payments')
      .select('id, order_id, payment_method, payment_status')
      .eq('id', body.paymentId)
      .eq('order_id', body.orderId)
      .maybeSingle();
    if (payErr || !payment) {
      return new Response(JSON.stringify({ error: 'Payment not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (payment.payment_method !== 'upi') {
      return new Response(JSON.stringify({ error: 'Not a UPI payment' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (body.action === 'approve') {
      const updates: Record<string, unknown> = { payment_status: 'success' };
      if (body.transactionId) updates.transaction_id = body.transactionId;

      const { error: upErr } = await admin.from('payments').update(updates).eq('id', body.paymentId);
      if (upErr) throw upErr;

      const { error: ordErr } = await admin
        .from('orders')
        .update({ payment_status: 'paid', order_status: 'confirmed' })
        .eq('id', body.orderId);
      if (ordErr) throw ordErr;

      return new Response(JSON.stringify({ success: true, action: 'approved' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // reject
    const { error: upErr } = await admin
      .from('payments')
      .update({ payment_status: 'failed' })
      .eq('id', body.paymentId);
    if (upErr) throw upErr;

    await admin
      .from('orders')
      .update({ payment_status: 'failed', order_status: 'cancelled' })
      .eq('id', body.orderId);

    // Release reserved stock for each line item
    const { data: items } = await admin
      .from('order_items')
      .select('product_id, quantity')
      .eq('order_id', body.orderId);

    for (const it of items ?? []) {
      if (it.product_id) {
        await admin.rpc('release_stock', { p_product_id: it.product_id, p_quantity: it.quantity });
      }
    }

    return new Response(JSON.stringify({ success: true, action: 'rejected' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
