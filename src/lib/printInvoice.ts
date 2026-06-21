interface InvoiceItem {
  title: string;
  quantity: number;
  price: number;
}

interface InvoiceData {
  orderId: string;
  createdAt: string; // ISO
  paymentMethod: string | null;
  paymentStatus?: string | null;
  totalAmount: number;
  currency?: string; // symbol, default ₹
  items: InvoiceItem[];
  customerName?: string | null;
  customerEmail?: string | null;
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const fmt = (n: number, sym = "₹") =>
  `${sym}${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function openInvoice(d: InvoiceData) {
  const w = window.open("", "_blank", "width=820,height=960");
  if (!w) return;

  const sym = d.currency ?? "₹";
  const date = new Date(d.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const shortOrder = d.orderId.slice(0, 8).toUpperCase();
  const methodLabel = (d.paymentMethod ?? "—").toUpperCase();
  const isPaid = (d.paymentStatus ?? "").toLowerCase() === "success"
    || (d.paymentStatus ?? "").toLowerCase() === "completed"
    || (d.paymentMethod ?? "").toLowerCase() === "cod"
      ? true
      : false;

  const rows = d.items
    .map(
      (it) => `
        <tr>
          <td>${escape(it.title)}</td>
          <td class="num">${it.quantity}</td>
          <td class="num">${fmt(Number(it.price), sym)}</td>
          <td class="num">${fmt(Number(it.price) * it.quantity, sym)}</td>
        </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Koshur Kart — Invoice #${escape(shortOrder)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;margin:0;background:#f6f5f2;color:#1a1a1a;padding:32px}
  .doc{max-width:760px;margin:0 auto;background:#fff;border-radius:14px;border:1px solid #e6e3dc;overflow:hidden}
  .header{display:flex;align-items:center;justify-content:space-between;padding:24px 28px;background:linear-gradient(135deg,#312e81,#4338ca);color:#fff}
  .brand{font-size:22px;font-weight:700;letter-spacing:-.02em}
  .tag{font-size:11px;text-transform:uppercase;letter-spacing:.14em;opacity:.85}
  .body{padding:28px}
  h1{font-size:18px;margin:0 0 18px;color:#312e81}
  .grid{display:grid;grid-template-columns:160px 1fr;row-gap:10px;column-gap:18px;font-size:14px;margin-bottom:22px}
  .grid dt{color:#6b6660;font-weight:500}
  .grid dd{margin:0;color:#1a1a1a;font-weight:600}
  .badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;background:#dcfce7;color:#166534;border:1px solid #86efac;margin-left:8px;vertical-align:middle}
  table{width:100%;border-collapse:collapse;margin-top:6px;font-size:14px}
  thead th{text-align:left;background:#f6f5f2;color:#6b6660;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.06em;padding:10px 12px;border-bottom:1px solid #e6e3dc}
  tbody td{padding:12px;border-bottom:1px solid #f0ede6}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  tfoot td{padding:14px 12px;font-size:15px;font-weight:700;color:#312e81}
  tfoot tr td:first-child{text-align:right;color:#6b6660;font-weight:500}
  .footer{padding:18px 28px;border-top:1px dashed #e6e3dc;font-size:11.5px;color:#8a857d;text-align:center;line-height:1.6}
  .actions{max-width:760px;margin:18px auto 0;text-align:right}
  .btn{appearance:none;border:0;background:#312e81;color:#fff;padding:10px 18px;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px}
  .btn:hover{background:#4338ca}
  @media print{body{background:#fff;padding:0}.doc{border:0;border-radius:0;max-width:none}.actions{display:none}}
</style></head>
<body>
  <div class="doc">
    <div class="header">
      <div>
        <div class="brand">Koshur Kart</div>
        <div class="tag">Official Invoice</div>
      </div>
      <div style="text-align:right;font-size:12px;line-height:1.5">
        <div style="opacity:.8">Invoice</div>
        <div style="font-weight:700;font-size:15px">#${escape(shortOrder)}</div>
      </div>
    </div>
    <div class="body">
      <h1>Order Receipt</h1>
      <dl class="grid">
        <dt>Order ID</dt><dd>${escape(d.orderId)}</dd>
        <dt>Purchase Date</dt><dd>${escape(date)}</dd>
        <dt>Payment Method</dt><dd>${escape(methodLabel)}${isPaid ? '<span class="badge">✓ Paid Successfully</span>' : ""}</dd>
        ${d.customerName ? `<dt>Customer</dt><dd>${escape(d.customerName)}</dd>` : ""}
        ${d.customerEmail ? `<dt>Email</dt><dd>${escape(d.customerEmail)}</dd>` : ""}
      </dl>

      <table>
        <thead>
          <tr><th>Item Name</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Total</th></tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr><td colspan="3">Grand Total</td><td class="num">${fmt(Number(d.totalAmount), sym)}</td></tr>
        </tfoot>
      </table>
    </div>
    <div class="footer">
      Thank you for shopping with Koshur Kart!<br/>
      This is a system-generated local invoice copy.
    </div>
  </div>
  <div class="actions"><button class="btn" onclick="window.print()">Print Invoice</button></div>
</body></html>`;

  w.document.write(html);
  w.document.close();
}
