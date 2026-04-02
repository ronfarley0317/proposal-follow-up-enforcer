module.exports = {
  apps: [
    {
      name: "proposal-follow-up-enforcer-runtime",
      script: "dist/server.js",
      cwd: "/var/www/proposal-follow-up-enforcer-runtime",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      kill_timeout: 10000,
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
