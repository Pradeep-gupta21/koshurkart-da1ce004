import { Link, useSearchParams } from "react-router-dom";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const PaymentFailedPage = () => {
  const [params] = useSearchParams();
  const orderId = params.get("orderId");
  const paymentId = params.get("paymentId");
  const reason = params.get("reason");

  return (
    <div className="container mx-auto px-4 py-20 text-center max-w-md">
      <div className="bg-destructive/10 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-6">
        <XCircle className="h-10 w-10 text-destructive" />
      </div>
      <h1 className="text-2xl font-semibold">Payment Failed</h1>
      <p className="text-muted-foreground mt-2">
        {reason ?? "Your payment could not be completed."}
      </p>
      {orderId && (
        <p className="mt-4 text-sm">
          Order ID:{" "}
          <span className="font-mono bg-muted px-2 py-1 rounded">{orderId.slice(0, 8)}</span>
        </p>
      )}
      <div className="mt-8 flex flex-wrap gap-3 justify-center">
        {paymentId ? (
          <Button asChild>
            <Link to={`/payments/${paymentId}`}>Retry Payment</Link>
          </Button>
        ) : (
          <Button asChild>
            <Link to="/cart">Back to Cart</Link>
          </Button>
        )}
        <Button variant="outline" asChild>
          <Link to="/cart">Back to Cart</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/">Continue Shopping</Link>
        </Button>
      </div>
    </div>
  );
};

export default PaymentFailedPage;
