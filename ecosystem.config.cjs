/**
 * open-nof1.ai - AI 加密货币自动交易系统
 * Copyright (C) 2025 195440
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 * 
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

// 加载 .env 文件
require('dotenv').config();

module.exports = {
  apps: [
    {
      name: "open-nof1.ai",
      script: "./dist/index.js",
      instances: 1,
      exec_mode: "fork",
      node_args: "--max-old-space-size=200",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      max_memory_restart: "200M",
      env: {
        NODE_ENV: "production",
        // 从 .env 文件加载所有环境变量
        ...process.env,
      },
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      // 优雅退出设置
      kill_timeout: 5000,
      listen_timeout: 3000,
      // 等待应用启动完成的时间
      wait_ready: false,
    },
  ],
};

