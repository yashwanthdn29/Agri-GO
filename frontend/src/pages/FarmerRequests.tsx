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

  useEffect(() => {
    let active = true;
    const refresh = () => {
      apiRequest<{ orders: ConnectionRequest[] }>("/api/farmer/orders")
        .then((data) => {
          if (active) setRequests(data.orders);
        })
        .catch((error: unknown) => {
          if (active) setMessage(error instanceof Error ? error.message : "Unable to load requests.");
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
    try {
      await apiRequest(`/api/orders/${request.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setMessage(`Order ${request.id} ${status}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update order.");
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
          View and manage requests from buyers.
        </p>

        {message && (
          <div className="mt-6 rounded-lg bg-green-100 p-4 font-medium text-green-800">
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

                <p className="mt-2 font-semibold">
                  Status: {request.status}
                </p>

                {request.status === "pending" && (
                  <div className="mt-5 flex gap-3">
                    <button
                      onClick={() =>
                        updateRequest(request, "accepted")
                      }
                      className="rounded-lg bg-green-600 px-5 py-2 font-semibold text-white"
                    >
                      Accept
                    </button>

                    <button
                      onClick={() =>
                        updateRequest(request, "rejected")
                      }
                      className="rounded-lg bg-red-600 px-5 py-2 font-semibold text-white"
                    >
                      Reject
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