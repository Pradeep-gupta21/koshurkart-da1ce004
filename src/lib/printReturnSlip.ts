interface ReturnSlipData {
  orderId: string;
  itemTitle: string;
  quantity: number;
  reason: string;
  description?: string | null;
  requestedAt: string; // ISO
  customerName?: string | null;
  customerEmail?: string | null;
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function openReturnSlip(d: ReturnSlipData) {
  const w = window.open("", "_blank", "width=720,height=900");
  if (!w) return;

  const date = new Date(d.requestedAt).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const shortOrder = d.orderId.slice(0, 8).toUpperCase();

  const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Koshur Kart — Return Slip #${escape(shortOrder)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;margin:0;background:#f6f5f2;color:#1a1a1a;padding:32px}
  .slip{max-width:680px;margin:0 auto;background:#fff;border-radius:14px;border:1px solid #e6e3dc;overflow:hidden}
  .header{display:flex;align-items:center;justify-content:space-between;padding:24px 28px;background:linear-gradient(135deg,#312e81,#4338ca);color:#fff}
  .brand{font-size:22px;font-weight:700;letter-spacing:-.02em}
  .tag{font-size:11px;text-transform:uppercase;letter-spacing:.14em;opacity:.85}
  .body{padding:28px}
  h1{font-size:18px;margin:0 0 18px;color:#312e81}
  .grid{display:grid;grid-template-columns:160px 1fr;row-gap:10px;column-gap:18px;font-size:14px;margin-bottom:22px}
  .grid dt{color:#6b6660;font-weight:500}
  .grid dd{margin:0;color:#1a1a1a;font-weight:600}
  .reason-box{background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px 16px;margin-bottom:18px}
  .reason-box .label{font-size:11px;text-transform:uppercase;color:#c2410c;letter-spacing:.1em;margin-bottom:4px;font-weight:600}
  .reason-box .value{font-size:15px;font-weight:600;color:#7c2d12}
  .reason-box p{margin:6px 0 0;font-size:13px;color:#7c2d12;white-space:pre-wrap;line-height:1.5}
  .instruction{background:#eef2ff;border-left:4px solid #4338ca;padding:14px 16px;border-radius:6px;font-size:13.5px;color:#312e81;line-height:1.55}
  .instruction strong{display:block;margin-bottom:4px;font-size:14px}
  .footer{padding:18px 28px;border-top:1px dashed #e6e3dc;font-size:11.5px;color:#8a857d;text-align:center}
  .actions{max-width:680px;margin:18px auto 0;text-align:right}
  .btn{appearance:none;border:0;background:#312e81;color:#fff;padding:10px 18px;border-radius:8px;font-weight:600;cursor:pointer}
  @media print{body{background:#fff;padding:0}.slip{border:0;border-radius:0;max-width:none}.actions{display:none}}
</style></head>
<body>
  <div class="slip">
    <div class="header">
      <div>
        <div class="brand">Koshur Kart</div>
        <div class="tag">Return Slip</div>
      </div>
      <div style="text-align:right;font-size:12px;line-height:1.5">
        <div style="opacity:.8">Order</div>
        <div style="font-weight:700;font-size:15px">#${escape(shortOrder)}</div>
      </div>
    </div>
    <div class="body">
      <h1>Return Request Summary</h1>
      <dl class="grid">
        <dt>Order ID</dt><dd>${escape(d.orderId)}</dd>
        <dt>Request Date</dt><dd>${escape(date)}</dd>
        <dt>Item</dt><dd>${escape(d.itemTitle)} × ${d.quantity}</dd>
        ${d.customerName ? `<dt>Customer</dt><dd>${escape(d.customerName)}</dd>` : ""}
        ${d.customerEmail ? `<dt>Email</dt><dd>${escape(d.customerEmail)}</dd>` : ""}
      </dl>

      <div class="reason-box">
        <div class="label">Reason for Return</div>
        <div class="value">${escape(d.reason)}</div>
        ${d.description ? `<p>${escape(d.description)}</p>` : ""}
      </div>

      <div class="instruction">
        <strong>📦 Important</strong>
        Please print this slip and pack it inside the return box with your item. Our pickup partner will use it to identify your request.
      </div>
    </div>
    <div class="footer">
      Koshur Kart · support@koshurkart.in · This is a system-generated return slip.
    </div>
  </div>
  <div class="actions"><button class="btn" onclick="window.print()">Print Slip</button></div>
</body></html>`;

  w.document.write(html);
  w.document.close();
}
