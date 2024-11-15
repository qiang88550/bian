// src/main.js

const i18next = require('./config/i18n');
const binance = require('./binance/binance');
const { db } = require('./db/database');
const { logger } = require('./config/logger');
const {
    TELEGRAM_BOT_TOKEN,
    ADMIN_CHAT_ID,
    TARGET_CHAT_ID,
    SUPPORTED_ASSETS_FILE
} = require('./config/env');
const botHandler = require('./telegram/bot'); // 引入 Telegram Bot 处理器

const TelegramBot = require('node-telegram-bot-api');
const process = require('process');

/**
 * Escape MarkdownV2 special characters in text
 * @param {string} text - The text to escape
 * @returns {string} - Escaped text
 */
function escapeMarkdownV2(text) {
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

// Initialize Telegram Bot (polling mode)
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// User rate limits structure
const userRateLimits = {}; // key: chatId, value: { count, lastReset, lang }
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // Max 10 requests per user per minute

// Send error notification to admin
async function sendErrorNotification(message) {
    try {
        await bot.sendMessage(ADMIN_CHAT_ID, `⚠️ *错误报告:*\n${escapeMarkdownV2(message)}`, { parse_mode: 'MarkdownV2' });
    } catch (error) {
        logger.error(`发送错误通知失败: ${error.message}`);
    }
}

// Send startup message to target chat ID
async function sendStartupMessage() {
    try {
        await bot.sendMessage(TARGET_CHAT_ID, '🚀 机器人已成功上线！', { parse_mode: 'MarkdownV2' });
        logger.info("发送启动消息成功");
    } catch (error) {
        logger.error(`发送启动消息失败: ${error.message}`);
        await sendErrorNotification(`发送启动消息失败: ${error.message}`);
    }
}

// Load supported asset pairs
async function initializeSupportedAssets() {
    try {
        await binance.loadSupportedAssets(SUPPORTED_ASSETS_FILE);
        logger.info('成功加载支持的资产兑换对');
    } catch (error) {
        logger.error(`初始化支持的资产兑换对失败: ${error.message}`);
        await sendErrorNotification(`初始化支持的资产兑换对失败: ${error.message}`);
        process.exit(1); // Exit the process
    }
}

// Initialize application
(async () => {
    try {
        // Initialize i18next (already initialized in config/i18n.js)
        // Initialize database (already initialized in src/db/database.js)
        // Load supported asset pairs
        await initializeSupportedAssets();

        // Initialize and set up Telegram Bot event handlers
        await botHandler.initialize(bot, binance, db, i18next, userRateLimits, {
            RATE_LIMIT_WINDOW_MS,
            RATE_LIMIT_MAX_REQUESTS,
            sendErrorNotification,
            logger,
            ADMIN_CHAT_ID,
            SUPPORTED_ASSETS_FILE
        });

        // Send startup message
        await sendStartupMessage();

    } catch (error) {
        logger.error(`初始化应用程序失败: ${error.message}`);
        await sendErrorNotification(`初始化应用程序失败: ${error.message}`);
        process.exit(1); // Exit the process
    }
})();

// Global unhandled promise rejections
process.on('unhandledRejection', async (reason, promise) => {
    logger.error(`Unhandled Rejection at: ${promise} reason: ${reason}`);
    await sendErrorNotification(`Unhandled Rejection: ${reason}`);
});

// Global uncaught exceptions
process.on('uncaughtException', async (error) => {
    logger.error(`Uncaught Exception: ${error.message}`);
    await sendErrorNotification(`Uncaught Exception: ${error.message}`);
    process.exit(1); // Exit the process
});
