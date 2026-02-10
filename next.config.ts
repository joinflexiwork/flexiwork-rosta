import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/dashboard/timesheets', destination: '/dashboard/timekeeping?tab=reports', permanent: true },
      { source: '/dashboard/timesheet-approvals', destination: '/dashboard/timekeeping?tab=approvals', permanent: true },
      { source: '/dashboard/timekeeping/approvals', destination: '/dashboard/timekeeping?tab=approvals', permanent: true },
      { source: '/dashboard/timesheets/generate', destination: '/dashboard/timekeeping/generate', permanent: true },
    ];
  },
};

export default nextConfig;
