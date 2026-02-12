/** @type {import('next').NextConfig} */
const path = require('path');
const nextConfig = {
  reactStrictMode: true,
  turbopack: { root: path.resolve(__dirname) },
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      { source: '/dashboard/timesheets', destination: '/dashboard/timekeeping?tab=reports', permanent: true },
      { source: '/dashboard/timesheet-approvals', destination: '/dashboard/timekeeping?tab=approvals', permanent: true },
      { source: '/dashboard/timekeeping/approvals', destination: '/dashboard/timekeeping?tab=approvals', permanent: true },
      { source: '/dashboard/timesheets/generate', destination: '/dashboard/timekeeping/generate', permanent: true },
    ];
  },
};

module.exports = nextConfig;
