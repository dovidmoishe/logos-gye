const localAuth = process.env.LOGOS_LOCAL_EMAIL_TEST === "true";
export default {
  agentRules: false,
  devIndicators: false,
  env: { NEXT_PUBLIC_LOCAL_EMAIL_TEST: localAuth ? "true" : "false" },
  async rewrites() {
    const routes = [
      {
        source: "/api/:path*",
        destination:
          (process.env.API_ORIGIN || "http://127.0.0.1:3001") + "/api/:path*",
      },
    ];
    if (localAuth)
      routes.push({
        source: "/auth/v1/:path(otp|verify|logout|token)",
        destination: "http://auth:9999/:path",
      });
    return routes;
  },
};
