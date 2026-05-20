import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const PaymentSuccessPage = () => {
  const [params] = useSearchParams();
  const orderId = params.get("orderId");
  const paymentId = params.get("paymentId");
  const txn = params.get("txn");
  const method = params.get("method");

  return (
    <div className="container mx-auto px-4 py-20 text-center max-w-md">
      <div className="bg-success/10 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-6">
        <CheckCircle className="h-10 w-10 text-success" />
      </div>
      <h1 className="text-2xl font-semibold">
        {method === "cod" ? "Order Confirmed!" : "Payment Successful!"}
      </h1>
      <p className="text-muted-foreground mt-2">
        {method === "cod"
          ? "Your order has been placed. Pay on delivery."
          : "Thank you — your payment has been received and your order is confirmed."}
      </p>
      {orderId && (
        <p className="mt-4 text-sm">
          Order ID:{" "}
          <span className="font-mono bg-muted px-2 py-1 rounded">{orderId.slice(0, 8)}</span>
        </p>
      )}
      {txn && (
        <p className="text-xs text-muted-foreground mt-2">
          Transaction: <span className="font-mono">{txn}</span>
        </p>
      )}
      <div className="mt-8 flex flex-wrap gap-3 justify-center">
        <Button asChild>
          <Link to="/profile">View Orders</Link>
        </Button>
        {paymentId && (
          <Button variant="outline" asChild>
            <Link to={`/payments/${paymentId}`}>View Payment</Link>
          </Button>
        )}
        <Button variant="ghost" asChild>
          <Link to="/">Continue Shopping</Link>
        </Button>
      </div>
    </div>
  );
};

export default PaymentSuccessPage;
