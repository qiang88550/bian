// src/config/env.js

const dotenv = require('dotenv');
const path = require('path');
const logger = require('./logger').logger;

// 加载 .env 文件
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// 必需的环境变量
const requiredEnvVars = [
    'TELEGRAM_BOT_TOKEN',
    'BASE_URL',
    'API_KEY',
    'API_SECRET',
    'PORT',
    'TARGET_CHAT_ID',
    'WEBHOOK_URL',           // 完整的 Webhook URL 基础部分
    'WEBHOOK_SECRET_TOKEN',  // 用于验证 Webhook 请求的秘密令牌
    'ADMIN_CHAT_ID',         // Telegram 聊天ID用于发送错误通知
    'SUPPORTED_ASSETS_FILE'  // 支持的资产列表文件路径
];

// 检查缺失的环境变量
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
    logger.error(`缺少环境变量: ${missingEnvVars.join(', ')}`);
    process.exit(1);
}

// 导出环境变量
module.exports = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    BASE_URL: process.env.BASE_URL,
    API_KEY: process.env.API_KEY,
    API_SECRET: process.env.API_SECRET,
    PORT: process.env.PORT || 3000,
    TARGET_CHAT_ID: process.env.TARGET_CHAT_ID,
    WEBHOOK_URL_BASE: process.env.WEBHOOK_URL, // 基础 URL，不包含路径
    WEBHOOK_SECRET_TOKEN: process.env.WEBHOOK_SECRET_TOKEN,
    ADMIN_CHAT_ID: process.env.ADMIN_CHAT_ID,
    SUPPORTED_ASSETS_FILE: process.env.SUPPORTED_ASSETS_FILE,
    WEBHOOK_PATH: `/telegram-webhook/${process.env.WEBHOOK_SECRET_TOKEN}`
};
