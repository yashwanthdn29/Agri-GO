import { lazy, Suspense, useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  NavLink,
  Navigate,
  Outlet,
  useNavigate,
} from "react-router-dom";

import { apiRequest, realtimeUrl } from "./api";
import "./App.css";

const Explore = lazy(() => import("./pages/Explore"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const FarmerDashboard = lazy(() => import("./pages/FarmerDashboard"));
const BuyerDashboard = lazy(() => import("./pages/BuyerDashboard"));
const CropRecommendation = lazy(() => import("./pages/CropRecommendation"));
const MarketPrices = lazy(() => import("./pages/MarketPrices"));
const Weather = lazy(() => import("./pages/Weather"));
const GovernmentSchemes = lazy(() => import("./pages/GovernmentSchemes"));
const SellProduce = lazy(() => import("./pages/SellProduce"));
const AIAssistant = lazy(() => import("./pages/AIAssistant"));
const FarmerRequests = lazy(() => import("./pages/FarmerRequests"));
const BrowseProducts = lazy(() => import("./pages/BrowseProducts"));
const FindFarmers = lazy(() => import("./pages/FindFarmers"));
const BuyerMarketPrices = lazy(() => import("./pages/BuyerMarketPrices"));
const ConnectFarmers = lazy(() => import("./pages/ConnectFarmers"));
const MyOrders = lazy(() => import("./pages/MyOrders"));
const BuyerAIAssistant = lazy(() => import("./pages/BuyerAIAssistant"));
const MyFarm = lazy(() => import("./pages/MyFarm"));
const AddProduct = lazy(() => import("./AddProduct"));
const WhyAgriculture = lazy(() => import("./pages/WhyAgriculture"));
const IntelligenceLab = lazy(() => import("./pages/IntelligenceLab"));
const CropDiseaseDetection = lazy(() => import("./pages/CropDiseaseDetection"));
const AgricultureMap = lazy(() => import("./pages/AgricultureMap"));
const AgmarknetMap = lazy(() => import("./pages/AgmarknetMap"));
const FarmingGuide = lazy(() => import("./pages/FarmingGuide"));
const ProfitLoss = lazy(() => import("./pages/ProfitLoss"));

function RealtimeBridge() {
  useEffect(() => {
    let socket: WebSocket | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 1000;
    let stopped = false;

    function connect() {
      const token = localStorage.getItem("access_token");

      if (stopped || !token) return;

      const connection = new WebSocket(realtimeUrl(token));
      socket = connection;

      connection.onopen = () => {
        retryDelay = 1000;
      };

      connection.onmessage = (message) => {
        try {
          window.dispatchEvent(
            new CustomEvent("agrigo:realtime", {
              detail: JSON.parse(message.data),
            }),
          );
        } catch {
          return;
        }
      };

      connection.onclose = () => {
        if (stopped || socket !== connection) return;

        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 15000);
      };
    }

    function refreshConnection() {
      if (retryTimer) clearTimeout(retryTimer);

      socket?.close();
      socket = undefined;

      connect();
    }

    window.addEventListener("agrigo:auth-changed", refreshConnection);
    window.addEventListener("storage", refreshConnection);

    connect();

    return () => {
      stopped = true;

      if (retryTimer) clearTimeout(retryTimer);

      window.removeEventListener(
        "agrigo:auth-changed",
        refreshConnection,
      );

      window.removeEventListener("storage", refreshConnection);

      socket?.close();
    };
  }, []);

  return null;
}


type AccountRole = "farmer" | "buyer";
type AccountType = AccountRole | "both";


function getSessionDetails(): {
  hasSession: boolean;
  dashboardPath: string;
  role: AccountRole | null;
  hasBothRoles: boolean;
  displayName: string;
} {
  try {
    const user = JSON.parse(
      localStorage.getItem("agrigoUser") || "{}",
    );

    const accountType: AccountType | null =
      user.accountType === "buyer" ||
      user.accountType === "farmer" ||
      user.accountType === "both"
        ? user.accountType
        : null;
    const role: AccountRole | null =
      accountType === "both"
        ? user.activeRole === "buyer"
          ? "buyer"
          : "farmer"
        : accountType;

    return {
      hasSession:
        Boolean(localStorage.getItem("access_token")) &&
        accountType !== null,

      dashboardPath:
        role === "buyer"
          ? "/buyer-dashboard"
          : role === "farmer"
            ? "/farmer-dashboard"
            : "/login",

      role,
      hasBothRoles: accountType === "both",

      displayName:
        typeof user.fullName === "string"
          ? user.fullName
          : typeof user.name === "string"
            ? user.name
            : "",
    };
  } catch {
    return {
      hasSession: false,
      dashboardPath: "/login",
      role: null,
      hasBothRoles: false,
      displayName: "",
    };
  }
}

function getAuthenticatedRole(): AccountRole | null {
  const session = getSessionDetails();

  return session.hasSession ? session.role : null;
}


function SignOutButton({
  className,
  onSignOut,
}: {
  className: string;
  onSignOut?: () => void;
}) {
  const navigate = useNavigate();

  function signOut() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("agrigoUser");
    window.dispatchEvent(new Event("agrigo:auth-changed"));
    onSignOut?.();
    navigate("/");
  }

  return (
    <button
      type="button"
      className={className}
      onClick={signOut}
    >
      Sign out
    </button>
  );
}


const agricultureNavigation: {
  title: string;
  links: {
    label: string;
    path: string;
    roles?: AccountRole[];
  }[];
}[] = [
  {
    title: "Explore",

    links: [
      {
        label: "Home",
        path: "/",
      },

      {
        label: "All features",
        path: "/explore",
      },

      {
        label: "Farming field guide",
        path: "/farming-guide",
      },

      {
        label: "AI & Data Science Lab",
        path: "/intelligence-lab",
      },

      {
        label: "Why agriculture?",
        path: "/why-agriculture",
      },

      {
        label: "Weather & air quality",
        path: "/weather",
      },

      // Agriculture Map
      {
        label: "Agriculture Map",
        path: "/agriculture-map",
      },
      {
        label: "Agmarknet map",
        path: "/agmarknet",
      },
    ],
  },

  {
    title: "Plan & grow",

    links: [
      {
        label: "Crop recommendations",
        path: "/crop-recommendation",
      },

      {
        label: "My farm",
        path: "/my-farm",
        roles: ["farmer"],
      },

      {
        label: "Profit & loss",
        path: "/profit-loss",
        roles: ["farmer"],
      },

      {
        label: "Market prices",
        path: "/market-prices",
        roles: ["farmer"],
      },

      {
        label: "Government schemes",
        path: "/government-schemes",
        roles: ["farmer"],
      },

      {
        label: "Agriculture assistant",
        path: "/ai-assistant",
        roles: ["farmer"],
      },

      {
        label: "Crop health image screening",
        path: "/crop-disease-detection",
        roles: ["farmer"],
      },

      {
        label: "Market prices",
        path: "/buyer-market-prices",
        roles: ["buyer"],
      },

      {
        label: "Agriculture assistant",
        path: "/buyer-ai-assistant",
        roles: ["buyer"],
      },
    ],
  },

  {
    title: "Marketplace",

    links: [
      {
        label: "Add a produce listing",
        path: "/add-product",
        roles: ["farmer"],
      },

      {
        label: "Sell your produce",
        path: "/sell-produce",
        roles: ["farmer"],
      },

      {
        label: "Buyer requests",
        path: "/farmer-requests",
        roles: ["farmer"],
      },

      {
        label: "Browse produce",
        path: "/browse-products",
        roles: ["buyer"],
      },

      {
        label: "Find farmers",
        path: "/find-farmers",
        roles: ["buyer"],
      },

      {
        label: "Connect with farmers",
        path: "/connect-farmers",
        roles: ["buyer"],
      },

      {
        label: "My orders",
        path: "/my-orders",
        roles: ["buyer"],
      },
    ],
  },
];


function AgricultureMenu({
  variant = "app",
}: {
  variant?: "app" | "home";
}) {
  const [open, setOpen] = useState(false);

  const [role, setRole] = useState<AccountRole | null>(
    getAuthenticatedRole,
  );

  useEffect(() => {
    const refreshRole = () =>
      setRole(getAuthenticatedRole());

    window.addEventListener(
      "agrigo:auth-changed",
      refreshRole,
    );

    window.addEventListener(
      "storage",
      refreshRole,
    );

    return () => {
      window.removeEventListener(
        "agrigo:auth-changed",
        refreshRole,
      );

      window.removeEventListener(
        "storage",
        refreshRole,
      );
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener(
      "keydown",
      closeOnEscape,
    );

    return () =>
      window.removeEventListener(
        "keydown",
        closeOnEscape,
      );
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={`agriculture-menu-toggle agriculture-menu-toggle--${variant}`}
        aria-label={
          open
            ? "Close agriculture menu"
            : "Open agriculture menu"
        }
        aria-controls="agriculture-navigation-drawer"
        aria-expanded={open}
        onClick={() =>
          setOpen((current) => !current)
        }
      >
        <span />
        <span />
        <span />
      </button>

      {open && (
        <div className="agriculture-menu-layer">
          <button
            className="agriculture-menu-backdrop"
            type="button"
            aria-label="Close agriculture menu"
            onClick={() => setOpen(false)}
          />

          <aside
            className="agriculture-menu-drawer"
            id="agriculture-navigation-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="AgriGO agriculture navigation"
          >
            <div className="agriculture-menu-drawer__heading">
              <span className="agriculture-menu-drawer__eyebrow">
                FIELD TO MARKET
              </span>

              <h2>Explore AgriGO</h2>

              <button
                type="button"
                className="agriculture-menu-drawer__close"
                aria-label="Close agriculture menu"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>

            <nav
              className="agriculture-menu-drawer__nav"
              aria-label="Agriculture features"
            >
              {agricultureNavigation.map(
                (section) => {
                  const links =
                    section.links.filter(
                      (item) =>
                        !item.roles ||
                        (role !== null &&
                          item.roles.includes(role)),
                    );

                  if (links.length === 0) {
                    return null;
                  }

                  return (
                    <section
                      className="agriculture-menu-group"
                      key={section.title}
                    >
                      <h3>{section.title}</h3>

                      {links.map((item) => (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          end={item.path === "/"}
                          onClick={() =>
                            setOpen(false)
                          }
                        >
                          <span>{item.label}</span>

                          <span aria-hidden="true">
                            ↗
                          </span>
                        </NavLink>
                      ))}
                    </section>
                  );
                },
              )}

              {role && (
                <section className="agriculture-menu-group">
                  <h3>Your workspace</h3>

                  <NavLink
                    to={
                      role === "farmer"
                        ? "/farmer-dashboard"
                        : "/buyer-dashboard"
                    }
                    onClick={() =>
                      setOpen(false)
                    }
                  >
                    <span>
                      {role === "farmer"
                        ? "Farmer workspace"
                        : "Buyer workspace"}
                    </span>

                    <span aria-hidden="true">
                      ↗
                    </span>
                  </NavLink>

                  <SignOutButton
                    className="mt-2 w-full rounded-lg border border-emerald-200 px-4 py-2 text-left font-semibold text-emerald-900 hover:bg-emerald-50"
                    onSignOut={() => setOpen(false)}
                  />
                </section>
              )}
            </nav>

            <div className="agriculture-menu-drawer__footer">
              {role ? (
                `${role === "farmer" ? "Farmer" : "Buyer"} tools, organized for your work.`
              ) : (
                <>
                  <p>
                    Sign in to see tools and a
                    workspace tailored to your role.
                  </p>

                  <div className="mt-3 flex gap-3">
                    <Link
                      to="/login"
                      onClick={() =>
                        setOpen(false)
                      }
                      className="font-semibold text-emerald-800 underline"
                    >
                      Sign in
                    </Link>

                    <Link
                      to="/register"
                      onClick={() =>
                        setOpen(false)
                      }
                      className="font-semibold text-emerald-800 underline"
                    >
                      Create account
                    </Link>
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}


type MarketPricePreview = {
  state?: string;
  district?: string;
  market?: string;
  commodity?: string;
  variety?: string;
  arrival_date?: string;
  min_price?: string | number;
  max_price?: string | number;
  modal_price?: string | number;
};


type MarketPricePreviewResponse = {
  source: string;
  fetched_at: string;
  records: MarketPricePreview[];
};


function HomeMarketPrices() {
  const [data, setData] =
    useState<MarketPricePreviewResponse | null>(
      null,
    );

  const [error, setError] = useState("");
  const [loading, setLoading] =
    useState(true);

  const [refreshKey, setRefreshKey] =
    useState(0);

  useEffect(() => {
    let active = true;

    async function refresh() {
      try {
        const result =
          await apiRequest<MarketPricePreviewResponse>(
            "/api/market-prices?limit=4",
          );

        if (active) {
          setData(result);
          setError("");
        }
      } catch (reason) {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Market feed unavailable.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void refresh();

    const timer = window.setInterval(
      () => void refresh(),
      15 * 60 * 1000,
    );

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [refreshKey]);

  return (
    <section
      className="home-market"
      aria-labelledby="home-market-title"
    >
      <div className="home-market__heading">
        <div>
          <p className="home-kicker">
            LATEST MANDI REPORTS
          </p>

          <h2 id="home-market-title">
            Prices from the field
          </h2>

          <p className="home-market__description">
            AgriGO checks for new mandi reports
            every 15 minutes. Report dates are
            set by each mandi; prices are not
            real-time quotes.
          </p>
        </div>

        <div className="home-market__actions">
          <button
            className="home-market__refresh"
            type="button"
            title="Refresh market reports"
            aria-label="Refresh market reports"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              setRefreshKey(
                (current) => current + 1,
              );
            }}
          >
            <span aria-hidden="true">
              ↻
            </span>{" "}
            Refresh
          </button>

          <Link
            className="home-market__all"
            to="/market-prices"
          >
            All market prices{" "}
            <span aria-hidden="true">
              ↗
            </span>
          </Link>
        </div>
      </div>

      {data && (
        <p className="home-market__source">
          {data.source} · Retrieved{" "}
          {new Date(
            data.fetched_at,
          ).toLocaleString()}
        </p>
      )}

      {error && (
        <p
          className="home-market__message"
          role="status"
        >
          {data
            ? "Could not refresh the latest report. Showing the last successful update."
            : `Live market reports are unavailable: ${error}`}
        </p>
      )}

      {loading && !data && (
        <p
          className="home-market__message"
          role="status"
        >
          Loading current market reports…
        </p>
      )}

      {!loading &&
        !error &&
        data?.records.length === 0 && (
          <p className="home-market__message">
            No market reports are available right
            now.
          </p>
        )}

      {data && data.records.length > 0 && (
        <div className="home-market__list">
          {data.records.map(
            (record, index) => (
              <article
                className="home-market__row"
                key={`${record.commodity}-${record.market}-${record.arrival_date}-${index}`}
              >
                <div className="home-market__crop">
                  <strong>
                    {record.commodity ||
                      "Commodity"}
                  </strong>

                  <span>
                    {record.variety ||
                      "Reported variety"}
                  </span>
                </div>

                <div className="home-market__location">
                  {[
                    record.market,
                    record.district,
                    record.state,
                  ]
                    .filter(Boolean)
                    .join(", ") ||
                    "Market not specified"}
                </div>

                <div className="home-market__price">
                  <strong>
                    {formatRupees(
                      record.modal_price,
                    )}
                  </strong>

                  <span>
                    Modal / quintal
                  </span>
                </div>

                <time className="home-market__date">
                  {record.arrival_date ||
                    "Date not reported"}
                </time>
              </article>
            ),
          )}
        </div>
      )}
    </section>
  );
}


type AgricultureNewsStory = {
  title: string;
  link: string;
  source: string;
  published_at: string | null;
};

type AgricultureNewsResponse = {
  source: string;
  fetched_at: string;
  is_stale: boolean;
  stories: AgricultureNewsStory[];
};


function HomeAgricultureNews() {
  const [data, setData] = useState<AgricultureNewsResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function refresh() {
      try {
        const result = await apiRequest<AgricultureNewsResponse>(
          "/api/agriculture/news",
        );
        if (active) {
          setData(result);
          setError("");
        }
      } catch (reason) {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Agriculture news is unavailable.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void refresh();
    const timer = window.setInterval(() => void refresh(), 10 * 60 * 1000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [refreshKey]);

  return (
    <section
      className="home-news"
      aria-labelledby="home-news-title"
    >
      <div className="home-news__heading">
        <div>
          <p className="home-kicker">AGRICULTURE, RIGHT NOW</p>
          <h2 id="home-news-title">The latest from the field</h2>
          <p className="home-news__description">
            Current agriculture and farming headlines from India.
          </p>
        </div>

        <button
          className="home-news__refresh"
          type="button"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            setRefreshKey((current) => current + 1);
          }}
        >
          <span className="home-news__live-dot" aria-hidden="true" />
          {loading ? "Updating…" : "LIVE · Refresh"}
        </button>
      </div>

      {data && (
        <p className="home-news__meta">
          {data.source} · Updated{" "}
          {new Date(data.fetched_at).toLocaleString()}
          {data.is_stale ? " · Showing last available update" : ""}
        </p>
      )}

      {error && !data && (
        <p className="home-news__message" role="status">
          Live agriculture news is unavailable right now: {error}
        </p>
      )}

      {loading && !data && (
        <p className="home-news__message" role="status">
          Loading the latest agriculture headlines…
        </p>
      )}

      {error && data && (
        <p className="home-news__message" role="status">
          Could not refresh the feed. Showing the last successful update.
        </p>
      )}

      {!loading && !error && data?.stories.length === 0 && (
        <p className="home-news__message" role="status">
          No agriculture headlines are available at the moment. Please check
          back shortly.
        </p>
      )}

      {data && data.stories.length > 0 && (
        <div className="home-news__grid">
          {data.stories.map((story) => (
            <article className="home-news__story" key={story.link}>
              <p className="home-news__source">{story.source}</p>
              <a
                className="home-news__title"
                href={story.link}
                target="_blank"
                rel="noopener noreferrer"
              >
                {story.title}
                <span aria-hidden="true"> ↗</span>
              </a>
              {story.published_at && (
                <time
                  className="home-news__date"
                  dateTime={story.published_at}
                >
                  {new Date(story.published_at).toLocaleString()}
                </time>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}


function formatRupees(
  value: string | number | undefined,
) {
  if (value === undefined || value === "") {
    return "—";
  }

  const amount = Number(value);

  return Number.isFinite(amount)
    ? `₹${new Intl.NumberFormat("en-IN").format(
        amount,
      )}`
    : `₹${value}`;
}


function AppShell() {
  const navigate = useNavigate();
  const [session, setSession] =
    useState(getSessionDetails);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [workspaceMessage, setWorkspaceMessage] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");

  useEffect(() => {
    const refreshSession = () =>
      setSession(getSessionDetails());

    window.addEventListener(
      "agrigo:auth-changed",
      refreshSession,
    );

    window.addEventListener(
      "storage",
      refreshSession,
    );

    return () => {
      window.removeEventListener(
        "agrigo:auth-changed",
        refreshSession,
      );

      window.removeEventListener(
        "storage",
        refreshSession,
      );
    };
  }, []);

  function switchWorkspace(role: AccountRole) {
    const user = JSON.parse(localStorage.getItem("agrigoUser") || "{}");
    if (user.accountType !== "both") return;

    setWorkspaceMessage("");
    setWorkspaceError("");
    localStorage.setItem(
      "agrigoUser",
      JSON.stringify({ ...user, activeRole: role }),
    );
    window.dispatchEvent(new Event("agrigo:auth-changed"));
    navigate(role === "farmer" ? "/farmer-dashboard" : "/buyer-dashboard");
  }

  async function enableBothWorkspaces() {
    setWorkspaceBusy(true);
    setWorkspaceMessage("");
    setWorkspaceError("");
    try {
      const result = await apiRequest<{ user: { role: string } }>(
        "/api/me/enable-both-workspaces",
        { method: "POST" },
      );
      if (result.user.role !== "both") {
        throw new Error("Unable to enable both workspaces.");
      }

      const user = JSON.parse(localStorage.getItem("agrigoUser") || "{}");
      localStorage.setItem(
        "agrigoUser",
        JSON.stringify({
          ...user,
          accountType: "both",
          activeRole: session.role ?? "farmer",
        }),
      );
      window.dispatchEvent(new Event("agrigo:auth-changed"));
      setWorkspaceMessage("Both workspaces are ready. Switch roles here anytime.");
    } catch (error) {
      setWorkspaceError(
        error instanceof Error ? error.message : "Unable to enable both workspaces.",
      );
    } finally {
      setWorkspaceBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__top">
          <div className="app-header__identity">
            <AgricultureMenu />

            <Link
              className="app-brand"
              to="/"
              aria-label="AgriGO home"
            >
              <span
                className="app-brand__mark"
                aria-hidden="true"
              >
                AG
              </span>

              <span className="app-brand__name">
                AgriGO
              </span>
            </Link>
          </div>

          <div className="app-header__actions">
            {session.hasSession && session.hasBothRoles && (
              <label className="app-workspace-switcher">
                <span>Workspace</span>
                <select
                  aria-label="Switch workspace"
                  value={session.role ?? "farmer"}
                  onChange={(event) =>
                    switchWorkspace(
                      event.target.value === "buyer" ? "buyer" : "farmer",
                    )
                  }
                >
                  <option value="farmer">Farmer</option>
                  <option value="buyer">Buyer</option>
                </select>
              </label>
            )}
            {session.hasSession && !session.hasBothRoles && (
              <button
                type="button"
                className="app-workspace-upgrade"
                onClick={enableBothWorkspaces}
                disabled={workspaceBusy}
              >
                {workspaceBusy
                  ? "Enabling..."
                  : `Add ${session.role === "farmer" ? "buyer" : "farmer"} workspace`}
              </button>
            )}
            <Link
              className="app-header__account"
              to={
                session.hasSession
                  ? session.dashboardPath
                  : "/login"
              }
            >
              {session.hasSession
                ? `${
                    session.displayName
                      ? `${session.displayName.split(" ")[0]}'s`
                      : "My"
                  } ${
                    session.role === "buyer"
                      ? "buyer"
                      : "farmer"
                  } workspace`
                : "Sign in / Join"}

              <span aria-hidden="true">
                ↗
              </span>
            </Link>
            {session.hasSession && (
              <SignOutButton className="app-header__signout" />
            )}
          </div>
        </div>
        {(workspaceMessage || workspaceError) && (
          <p
            className={`app-workspace-feedback${workspaceError ? " app-workspace-feedback--error" : ""}`}
            role={workspaceError ? "alert" : "status"}
          >
            {workspaceError || workspaceMessage}
          </p>
        )}
      </header>

      <div className="app-shell__content">
        <Outlet />
      </div>
    </div>
  );
}


function RoleDashboard({
  role,
  children,
}: {
  role: AccountRole;
  children: React.ReactNode;
}) {
  const session = getSessionDetails();

  if (!session.hasSession) {
    return <Navigate to="/login" replace />;
  }

  if (session.role !== role) {
    return (
      <Navigate
        to={session.dashboardPath}
        replace
      />
    );
  }

  return children;
}

function Home() {
  const [session, setSession] = useState(getSessionDetails);

  useEffect(() => {
    const refreshSession = () => setSession(getSessionDetails());
    window.addEventListener("agrigo:auth-changed", refreshSession);
    window.addEventListener("storage", refreshSession);

    return () => {
      window.removeEventListener("agrigo:auth-changed", refreshSession);
      window.removeEventListener("storage", refreshSession);
    };
  }, []);

  return (
    <div className="home-page">
      <header className="home-header">
        <div className="home-header__identity">
          <AgricultureMenu variant="home" />

          <Link
            className="home-brand"
            to="/"
            aria-label="AgriGO home"
          >
            <span
              className="home-brand__mark"
              aria-hidden="true"
            >
              AG
            </span>

            <span className="home-brand__text">
              <strong>AgriGO</strong>

              <small>
                GROW · CONNECT · THRIVE
              </small>
            </span>
          </Link>
        </div>

        <div className="home-header__actions">
          <Link
            className="home-signin"
            to="/why-agriculture"
            aria-label="Why agriculture?"
          >
            <span className="hidden sm:inline">Why agriculture?</span>
            <span className="sm:hidden">Why</span>
          </Link>

          {session.hasSession ? (
            <>
              <Link
                className="home-signin"
                to={session.dashboardPath}
              >
                {session.role === "buyer" ? "Buyer workspace" : "Farmer workspace"}
              </Link>
              <SignOutButton className="home-join" />
            </>
          ) : (
            <>
              <Link className="home-signin" to="/login">
                Sign in
              </Link>
              <Link className="home-join" to="/register">
                Join AgriGO{" "}
                <span aria-hidden="true">
                  ↗
                </span>
              </Link>
            </>
          )}
        </div>
      </header>

      <main>
        <section
          className="home-hero"
          aria-labelledby="home-title"
        >
          <img
            className="home-hero__image"
            src="https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=2400&q=85"
            alt="Sunlit green fields stretching across a working agricultural landscape"
          />

          <div className="home-hero__shade" />

          <div className="home-hero__content">
            <p className="home-eyebrow">
              <span /> A better season starts
              with better decisions
            </p>

            <h1 id="home-title">
              AgriGO<span>.</span>
            </h1>

            <p className="home-hero__lead">
              From the first seed to the final
              sale, make every move with a clearer
              view of your farm.
            </p>

            <div className="home-hero__actions">
              <Link
                className="home-button home-button--light"
                to="/marketplace"
              >
                Browse available produce
              </Link>

              <Link
                className="home-button home-button--lime"
                to={
                  session.hasSession
                    ? session.dashboardPath
                    : "/register"
                }
              >
                {session.hasSession
                  ? "Open your workspace"
                  : "Get started"}{" "}
                <span aria-hidden="true">
                  ↗
                </span>
              </Link>

              <Link
                className="home-button home-button--light"
                to="/explore"
              >
                Explore the platform
              </Link>
            </div>

            <p className="home-hero__note">
              Practical tools for growers, buyers,
              and rural communities.
            </p>
          </div>

          <div className="home-hero__caption">
            <span>01 / 03</span>

            <span>
              Grown with purpose. Connected by
              AgriGO.
            </span>
          </div>
        </section>

        <HomeMarketPrices />
        <HomeAgricultureNews />

        <section
          className="home-workflows"
          id="farm-tools"
          aria-labelledby="workflow-title"
        >
          <div className="home-section-heading">
            <div>
              <p className="home-kicker">
                YOUR NEXT STEP
              </p>

              <h2 id="workflow-title">
                What does your farm need today?
              </h2>
            </div>

            <p>
              Useful information, right when it
              matters.
            </p>
          </div>

          <div className="home-workflow-grid">
            <Link
              className="home-workflow"
              to="/agriculture-map"
            >
              <span className="home-workflow__number">
                01
              </span>

              <span className="home-workflow__title">
                Explore agriculture data
              </span>

              <span className="home-workflow__detail">
                Browse regional crops, land, irrigation, and soil indicators
              </span>

              <span
                className="home-workflow__arrow"
                aria-hidden="true"
              >
                ↗
              </span>
            </Link>

            <Link
              className="home-workflow"
              to="/weather"
            >
              <span className="home-workflow__number">
                02
              </span>

              <span className="home-workflow__title">
                Check the weather
              </span>

              <span className="home-workflow__detail">
                Local forecasts and air quality
              </span>

              <span
                className="home-workflow__arrow"
                aria-hidden="true"
              >
                ↗
              </span>
            </Link>

            <Link
              className="home-workflow"
              to="/market-prices"
            >
              <span className="home-workflow__number">
                03
              </span>

              <span className="home-workflow__title">
                Know the market
              </span>

              <span className="home-workflow__detail">
                Browse reported mandi prices
              </span>

              <span
                className="home-workflow__arrow"
                aria-hidden="true"
              >
                ↗
              </span>
            </Link>

            <Link
              className="home-workflow"
              to="/crop-recommendation"
            >
              <span className="home-workflow__number">
                04
              </span>

              <span className="home-workflow__title">
                Explore crop suitability
              </span>

              <span className="home-workflow__detail">
                Try a transparent rule-based planning prototype
              </span>

              <span
                className="home-workflow__arrow"
                aria-hidden="true"
              >
                ↗
              </span>
            </Link>
          </div>
        </section>

        <section
          className="home-field-band"
          aria-labelledby="field-band-title"
        >
          <div className="home-field-band__label">
            FIELD TO MARKET
          </div>

          <div className="home-field-band__copy">
            <h2 id="field-band-title">
              Farming is connected work.
            </h2>

            <p>
              Weather shapes the day. Market prices
              shape the sale. AgriGO brings the
              tools together, so you can focus on
              what grows next.
            </p>
          </div>

          <Link
            to="/explore"
            className="home-field-band__link"
          >
            See what you can do{" "}
            <span aria-hidden="true">
              ↗
            </span>
          </Link>
        </section>
      </main>

      <footer className="home-footer">
        <Link
          className="home-footer__brand"
          to="/"
        >
          AgriGO
        </Link>

        <span>
          Built for the people who grow our
          future.
        </span>

        <div>
          <Link to="/government-schemes">
            Farmer resources
          </Link>

          <Link to="/login">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}


function App() {
  return (
    <BrowserRouter>
      <RealtimeBridge />

      <Suspense
        fallback={
          <p className="p-8 text-center" role="status">
            Loading AgriGO…
          </p>
        }
      >
        <Routes>
        {/* Home */}
        <Route
          path="/"
          element={<Home />}
        />

        <Route
          path="/why-agriculture"
          element={<WhyAgriculture />}
        />

        <Route element={<AppShell />}>
          {/* Existing pages */}
          <Route
            path="/explore"
            element={<Explore />}
          />

          <Route
            path="/marketplace"
            element={<BrowseProducts publicView />}
          />

          <Route
            path="/farming-guide"
            element={
              <Suspense fallback={<p className="p-8 text-center" role="status">Loading the farming field guide…</p>}>
                <FarmingGuide />
              </Suspense>
            }
          />

          <Route
            path="/login"
            element={<Login />}
          />

          <Route
            path="/register"
            element={<Register />}
          />

          {/* Farmer */}
          <Route
            path="/farmer-dashboard"
            element={
              <RoleDashboard role="farmer">
                <FarmerDashboard />
              </RoleDashboard>
            }
          />

          <Route
            path="/farmer-requests"
            element={
              <RoleDashboard role="farmer">
                <FarmerRequests />
              </RoleDashboard>
            }
          />

          <Route
            path="/my-farm"
            element={
              <RoleDashboard role="farmer">
                <MyFarm />
              </RoleDashboard>
            }
          />

          <Route
            path="/profit-loss"
            element={
              <RoleDashboard role="farmer">
                <ProfitLoss />
              </RoleDashboard>
            }
          />

          <Route
            path="/crop-disease-detection"
            element={
              <RoleDashboard role="farmer">
                <CropDiseaseDetection />
              </RoleDashboard>
            }
          />

          {/* Buyer */}
          <Route
            path="/buyer-dashboard"
            element={
              <RoleDashboard role="buyer">
                <BuyerDashboard />
              </RoleDashboard>
            }
          />

          {/* Agriculture tools */}
          <Route
            path="/crop-recommendation"
            element={<CropRecommendation />}
          />

          <Route
            path="/market-prices"
            element={<MarketPrices />}
          />

          <Route
            path="/intelligence-lab"
            element={<IntelligenceLab />}
          />

          <Route
            path="/weather"
            element={<Weather />}
          />

          <Route
            path="/government-schemes"
            element={<GovernmentSchemes />}
          />

          <Route
            path="/sell-produce"
            element={
              <RoleDashboard role="farmer">
                <SellProduce />
              </RoleDashboard>
            }
          />

          <Route
            path="/ai-assistant"
            element={
              <RoleDashboard role="farmer">
                <AIAssistant />
              </RoleDashboard>
            }
          />

          {/* Marketplace */}
          <Route
            path="/browse-products"
            element={
              <RoleDashboard role="buyer">
                <BrowseProducts />
              </RoleDashboard>
            }
          />

          <Route
            path="/find-farmers"
            element={
              <RoleDashboard role="buyer">
                <FindFarmers />
              </RoleDashboard>
            }
          />

          <Route
            path="/buyer-market-prices"
            element={
              <RoleDashboard role="buyer">
                <BuyerMarketPrices />
              </RoleDashboard>
            }
          />

          <Route
            path="/connect-farmers"
            element={
              <RoleDashboard role="buyer">
                <ConnectFarmers />
              </RoleDashboard>
            }
          />

          <Route
            path="/my-orders"
            element={
              <RoleDashboard role="buyer">
                <MyOrders />
              </RoleDashboard>
            }
          />

          <Route
            path="/buyer-ai-assistant"
            element={
              <RoleDashboard role="buyer">
                <BuyerAIAssistant />
              </RoleDashboard>
            }
          />

          <Route
            path="/add-product"
            element={
              <RoleDashboard role="farmer">
                <AddProduct />
              </RoleDashboard>
            }
          />

          {/* NEW: Agriculture Map */}
          <Route
            path="/agriculture-map"
            element={<AgricultureMap />}
          />

          <Route
            path="/agmarknet"
            element={<AgmarknetMap />}
          />
        </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}


export default App;