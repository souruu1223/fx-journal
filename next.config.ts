/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['192.168.0.234'],

  typescript: {
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig