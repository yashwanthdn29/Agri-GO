import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest } from "../api";

type LoginResponse = {
  access_token: string;
  user: { id: number; email: string; role: string; name: string };
};

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email || !password) {
      setMessage("Please enter email and password.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const data = await apiRequest<LoginResponse>("/api/login", {
        method: "POST",
        body: JSON.stringify({
          email: email,
          password: password,
        }),
      });

      localStorage.setItem("access_token", data.access_token);
      const user = {
        email: data.user.email,
        fullName: data.user.name,
        accountType: data.user.role,
        userId: data.user.id,
      };

      localStorage.setItem("agrigoUser", JSON.stringify(user));
      window.dispatchEvent(new Event("agrigo:auth-changed"));

      setMessage("Login successful!");

      setTimeout(() => {
        if (data.user.role === "farmer") {
          navigate("/farmer-dashboard");
        } else if (data.user.role === "buyer") {
          navigate("/buyer-dashboard");
        } else {
          navigate("/");
        }
      }, 500);
    } catch (error) {
      console.error("Login error:", error);
      setMessage(error instanceof Error ? error.message : "Unable to sign in.");
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-green-50 flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <div className="text-center">
          <div className="text-4xl">🌾</div>

          <h1 className="mt-3 text-3xl font-bold text-green-700">
            Welcome to AgriGO
          </h1>

          <p className="mt-2 text-gray-500">
            Login to continue
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label className="mb-2 block font-medium text-gray-700">
              Email
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-green-600"
            />
          </div>

          <div>
            <label className="mb-2 block font-medium text-gray-700">
              Password
            </label>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-green-600"
            />
          </div>

          {message && (
            <p className="rounded-lg bg-green-100 p-3 text-center text-sm font-medium text-green-700">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-60"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Don't have an account?
          </p>

          <Link
            to="/register"
            className="mt-3 inline-block rounded-lg border-2 border-green-600 px-6 py-2 font-semibold text-green-600 hover:bg-green-600 hover:text-white"
          >
            Register
          </Link>
        </div>

        <div className="mt-4 text-center">
          <Link
            to="/"
            className="text-sm text-gray-500 hover:text-green-600"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Login;