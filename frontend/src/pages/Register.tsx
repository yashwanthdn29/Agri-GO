import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { apiRequest } from "../api";
import "./AuthPages.css";

type RegisterResponse = {
  user: { id: number; name: string; email: string; role: string };
};

function Register() {
  const navigate = useNavigate();
  const location = useLocation();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [accountType, setAccountType] = useState("");

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const passwordRequirements = [
    { label: "At least 12 characters", met: password.length >= 12 },
    { label: "One uppercase letter (A–Z)", met: /[A-Z]/.test(password) },
    { label: "One lowercase letter (a–z)", met: /[a-z]/.test(password) },
    { label: "One number (0–9)", met: /\d/.test(password) },
    { label: "One symbol (such as !, @ or #)", met: /[^A-Za-z0-9]/.test(password) },
  ];
  const passwordIsStrong = passwordRequirements.every((requirement) => requirement.met);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!fullName || !email || !password || !accountType) {
      setMessage("Please fill in all fields.");
      return;
    }
    if (!passwordIsStrong) {
      setMessage("Create a password with at least 12 characters, uppercase and lowercase letters, a number, and a symbol.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const data = await apiRequest<RegisterResponse>("/api/register", {
        method: "POST",
        body: JSON.stringify({
          name: fullName,
          email: email,
          password: password,
          role: accountType,
        }),
      });

      const user = {
        fullName: data.user.name,
        email: data.user.email,
        accountType: data.user.role,
        ...(data.user.role === "both" ? { activeRole: "farmer" } : {}),
        userId: data.user.id,
      };

      localStorage.setItem("agrigoUser", JSON.stringify(user));

      setMessage("Account created successfully!");

      setTimeout(() => {
        navigate("/login", { state: location.state });
      }, 1000);
    } catch (error) {
      console.error("Registration error:", error);
      setMessage(error instanceof Error ? error.message : "Registration failed.");
    }

    setLoading(false);
  }

  return (
    <main className="auth-page auth-page--register">
      <section className="auth-card auth-card--register">
        <aside className="auth-card__visual auth-card__visual--register">
          <Link to="/" className="auth-brand" aria-label="AgriGO home">
            <span className="auth-brand__mark">AG</span>
            <span>AgriGO</span>
          </Link>
          <div className="auth-card__story">
            <p>GROW · CONNECT · THRIVE</p>
            <h2>Better decisions<br />begin with a connection.</h2>
            <span>Join a growing community of farmers and buyers.</span>
          </div>
        </aside>

        <div className="auth-card__content">
          <div className="auth-form-heading">
          <h1 className="mt-3 text-3xl font-bold text-green-700">
            Join AgriGO
          </h1>

          <p className="mt-2 text-gray-500">
            Create an account to get started.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label className="mb-2 block font-medium text-gray-700" htmlFor="register-name">
              Full Name
            </label>

            <input
              id="register-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
              autoComplete="name"
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-green-600"
            />
          </div>

          <div>
            <label className="mb-2 block font-medium text-gray-700" htmlFor="register-email">
              Email
            </label>

            <input
              id="register-email"
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
            <label className="mb-2 block font-medium text-gray-700" htmlFor="register-password">
              Password
            </label>

            <div className="auth-password-field">
              <input
                id="register-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Use 12+ characters, a number & symbol"
                minLength={12}
                maxLength={128}
                pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,128}"
                autoComplete="new-password"
                aria-describedby="password-guidance"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 pr-12 outline-none focus:border-green-600"
              />
              <button
                type="button"
                className="auth-password-toggle"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                aria-controls="register-password"
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
            <ul id="password-guidance" className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2" aria-live="polite">
              {passwordRequirements.map((requirement) => (
                <li key={requirement.label} className={requirement.met ? "text-green-700" : "text-gray-500"}>
                  <span aria-hidden="true">{requirement.met ? "✓" : "○"} </span>
                  {requirement.label}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <label className="mb-2 block font-medium text-gray-700" htmlFor="register-account-type">
              Account Type
            </label>

            <select
              id="register-account-type"
              value={accountType}
              onChange={(e) => setAccountType(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-green-600"
            >
              <option value="">Select account type</option>
              <option value="farmer">Farmer</option>
              <option value="buyer">Buyer</option>
              <option value="both">Farmer and Buyer</option>
            </select>
            <p className="mt-2 text-sm text-gray-500">
              {accountType === "both"
                ? "Use one account for both selling and buying. Switch between workspaces after signing in."
                : accountType === "farmer"
                  ? "List your produce and manage buyer orders."
                  : accountType === "buyer"
                    ? "Browse produce, place orders, and track responses."
                    : "Choose how you plan to use AgriGO. You can create a combined account for both roles."}
            </p>
          </div>

          {message && (
            <p className="auth-message rounded-lg bg-green-100 p-3 text-center text-sm font-medium text-green-700" role="status" aria-live="polite">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !passwordIsStrong}
            className="w-full rounded-lg bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-60"
          >
            {loading ? "Creating Account..." : "Create Account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Link
            to="/login"
            state={location.state}
            className="font-semibold text-green-600 hover:text-green-700"
          >
            Login
          </Link>
        </p>

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

export default Register;