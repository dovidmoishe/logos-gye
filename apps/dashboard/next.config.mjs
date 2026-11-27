export default {
  agentRules: false,
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination:
          (process.env.API_ORIGIN || "http://127.0.0.1:3001") + "/api/:path*",
      },
    ];
  },
};
