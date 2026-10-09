import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api";
import { subscribeRealtime } from "../realtime";

type Order = {
  id: number;
  product_name: string;
  farmer_name: string;
  quantity: number;
  total_price: number;
  status: string;
};

function MyOrders() {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      apiRequest<{ orders: Order[] }>("/api/orders")
        .then((data) => {
          if (active) setOrders(data.orders);
        })
        .catch((error: unknown) => {
          if (active) console.error("Orders could not be loaded:", error);
        });
    };
    refresh();
    const unsubscribe = subscribeRealtime("orders.changed", refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <div className="min-h-screen bg-green-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold text-green-700">
              🌾 AgriGO
            </h1>

            <p className="text-sm text-gray-500">
              My Orders
            </p>
          </div>

          <Link
            to="/buyer-dashboard"
            className="rounded-lg bg-green-600 px-5 py-2 font-semibold text-white hover:bg-green-700"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <h2 className="text-3xl font-bold text-gray-900">
          📦 My Orders
        </h2>

        <p className="mt-2 text-gray-600">
          Track your agricultural orders.
        </p>

        {orders.length === 0 ? (
          <div className="mt-10 rounded-2xl bg-white p-10 text-center shadow-sm">
            <div className="text-5xl">📦</div>

            <h3 className="mt-4 text-xl font-bold text-gray-900">
              No orders yet
            </h3>

            <p className="mt-2 text-gray-600">
              Accepted requests will appear here.
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-5">
            {orders.map((order) => (
              <div
                key={order.id}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">
                      🌾 {order.product_name}
                    </h3>

                    <p className="mt-2 text-gray-600">
                      Order ID: AGR-{order.id}
                    </p>

                    <p className="mt-2 text-gray-600">
                      👨‍🌾 Farmer: {order.farmer_name}
                    </p>

                    <p className="mt-2 text-gray-600">Quantity: {order.quantity}</p>
                    <p className="mt-2 text-gray-600">Total: ₹{order.total_price}</p>

                    <p className="mt-2 font-semibold text-gray-700">
                      Status: {order.status}
                    </p>
                  </div>

                  <div className="rounded-lg bg-green-100 px-4 py-2 font-semibold text-green-700">
                    {order.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default MyOrders;