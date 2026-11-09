import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { apiRequest } from "../api";
import "./AuthPages.css";

type LoginResponse = {
  access_token: string;
  user: { id: number; email: string; role: string; name: string };
};

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnLocation = (
    location.state as {
      from?: { pathname?: string; search?: string; hash?: string };
    } | null
  )?.from;
  const returnPath =
    returnLocation?.pathname?.startsWith("/") &&
    !returnLocation.pathname.startsWith("//")
      ? `${returnLocation.pathname}${returnLocation.search ?? ""}${returnLocation.hash ?? ""}`
      : null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
        ...(data.user.role === "both" ? { activeRole: "farmer" } : {}),
        userId: data.user.id,
      };

      localStorage.setItem("agrigoUser", JSON.stringify(user));
      window.dispatchEvent(new Event("agrigo:auth-changed"));

      setMessage("Login successful!");

      setTimeout(() => {
        const dashboardPath =
          data.user.role === "farmer" || data.user.role === "both"
            ? "/farmer-dashboard"
            : data.user.role === "buyer"
              ? "/buyer-dashboard"
              : "/";

        navigate(returnPath ?? dashboardPath);
      }, 500);
    } catch (error) {
      console.error("Login error:", error);
      setMessage(error instanceof Error ? error.message : "Unable to sign in.");
    }

    setLoading(false);
  }

  return (
    <main className="auth-page auth-page--login">
      <section className="auth-card">
        <aside className="auth-card__visual auth-card__visual--login">
          <Link to="/" className="auth-brand" aria-label="AgriGO home">
            <span className="auth-brand__mark">AG</span>
            <span>AgriGO</span>
          </Link>
          <div className="auth-card__story">
            <p>GROW · CONNECT · THRIVE</p>
            <h2>Rooted in the land.<br />Ready for what’s next.</h2>
            <span>Practical tools for the people who grow our future.</span>
          </div>
        </aside>

        <div className="auth-card__content">
          <div className="auth-form-heading">
          <h1 className="mt-3 text-3xl font-bold text-green-700">
            Welcome to AgriGO
          </h1>

          <p className="mt-2 text-gray-500">
            Sign in to continue to your AgriGO workspace.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label className="mb-2 block font-medium text-gray-700" htmlFor="login-email">
              Email
            </label>

            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              autoComplete="email"
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-green-600"
            />
          </div>

          <div>
            <label className="mb-2 block font-medium text-gray-700" htmlFor="login-password">
              Password
            </label>

            <div className="auth-password-field">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                className="w-full rounded-lg border border-gray-300 px-4 py-3 pr-12 outline-none focus:border-green-600"
              />
              <button
                type="button"
                className="auth-password-toggle"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                aria-controls="login-password"
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8" />
                    <path d="M9.9 5.2A10.8 10.8 0 0112 5c5.2 0 8.5 4.7 9.5 6.4a1.1 1.1 0 010 1.2 16 16 0 01-3.1 3.6M6.2 6.2A16.3 16.3 0 002.5 11.4a1.1 1.1 0 000 1.2C3.5 14.3 6.8 19 12 19a10.7 10.7 0 004.1-.8" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M2.5 12s3.3-7 9.5-7 9.5 7 9.5 7-3.3 7-9.5 7-9.5-7-9.5-7z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {message && (
            <p className="auth-message rounded-lg bg-green-100 p-3 text-center text-sm font-medium text-green-700" role="status" aria-live="polite">
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
            New to AgriGO?
          </p>

          <Link
            to="/register"
            state={location.state}
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
      </section>
    </main>
  );
}

export default Login;