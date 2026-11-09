import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api";
import { subscribeRealtime } from "../realtime";

type ConnectionRequest = {
  id: number;
  product_name: string;
  farmer_name: string;
  buyer_name: string;
  quantity: number;
  total_price: number;
  status: string;
};

function FarmerRequests() {
  const [requests, setRequests] = useState<ConnectionRequest[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [updatingRequestId, setUpdatingRequestId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      apiRequest<{ orders: ConnectionRequest[] }>("/api/farmer/orders")
        .then((data) => {
          if (active) {
            setRequests(data.orders);
            setError("");
          }
        })
        .catch((error: unknown) => {
          if (active) setError(error instanceof Error ? error.message : "Unable to load requests.");
        });
    };
    refresh();
    const unsubscribe = subscribeRealtime("orders.changed", refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function updateRequest(request: ConnectionRequest, status: string) {
    setUpdatingRequestId(request.id);
    setMessage("");
    setError("");
    try {
      await apiRequest(`/api/orders/${request.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setMessage(
        status === "accepted"
          ? `Order AGR-${request.id} accepted. The buyer can see the update in My Orders.`
          : `Order AGR-${request.id} rejected. The buyer will see the update and the produce is available again.`,
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to update order.");
    } finally {
      setUpdatingRequestId(null);
    }
  }

  return (
    <div className="min-h-screen bg-green-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold text-green-700">
              🌾 AgriGO
            </h1>

            <p className="text-sm text-gray-500">
              Farmer Requests
            </p>
          </div>

          <Link
            to="/farmer-dashboard"
            className="rounded-lg bg-green-600 px-5 py-2 font-semibold text-white"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h2 className="text-3xl font-bold text-gray-900">
          🤝 Buyer Requests
        </h2>

        <p className="mt-2 text-gray-600">
          Each order starts as pending. Accept to confirm it, or reject it to return the produce to your available stock. Buyers can track your decision in My Orders.
        </p>

        {error && (
          <div role="alert" className="mt-6 rounded-lg bg-red-50 p-4 font-medium text-red-800">
            {error}
          </div>
        )}

        {message && (
          <div role="status" className="mt-6 rounded-lg bg-green-100 p-4 font-medium text-green-800">
            {message}
          </div>
        )}

        {requests.length === 0 ? (
          <div className="mt-10 rounded-2xl bg-white p-10 text-center shadow-sm">
            <div className="text-5xl">📭</div>

            <h3 className="mt-4 text-xl font-bold">
              No requests yet
            </h3>

            <p className="mt-2 text-gray-600">
              Buyer requests will appear here.
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-5">
            {requests.map((request) => (
              <div
                key={request.id}
                className="rounded-2xl border bg-white p-6 shadow-sm"
              >
                <h3 className="text-xl font-bold">
                  🌾 {request.product_name}
                </h3>

                <p className="mt-2 text-gray-600">
                  👤 Buyer: {request.buyer_name}
                </p>

                <p className="mt-2 text-gray-600">
                  👨‍🌾 Farmer: {request.farmer_name}
                </p>

                <p className="mt-2 text-gray-600">Quantity: {request.quantity}</p>
                <p className="mt-2 text-gray-600">Total: ₹{request.total_price}</p>

                <p className="mt-2 font-semibold capitalize">
                  Status: {request.status === "pending" ? "Awaiting your decision" : request.status}
                </p>

                {request.status === "pending" && (
                  <div className="mt-5 flex gap-3">
                    <button
                      type="button"
                      disabled={updatingRequestId === request.id}
                      onClick={() =>
                        updateRequest(request, "accepted")
                      }
                      className="rounded-lg bg-green-700 px-5 py-2 font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {updatingRequestId === request.id ? "Updating..." : "Accept order"}
                    </button>

                    <button
                      type="button"
                      disabled={updatingRequestId === request.id}
                      onClick={() =>
                        updateRequest(request, "rejected")
                      }
                      className="rounded-lg border border-red-200 px-5 py-2 font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Reject order
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default FarmerRequests;