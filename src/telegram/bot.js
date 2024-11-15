// src/telegram/bot.js

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const writeFileAsync = promisify(fs.writeFile);

/**
 * Escape MarkdownV2 special characters in text
 * @param {string} text - The text to escape
 * @returns {string} - Escaped text
 */
function escapeMarkdownV2(text) {
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

module.exports = {
    /**
     * Initialize Telegram Bot event handlers
     * @param {TelegramBot} bot - Telegram Bot instance
     * @param {Object} binance - Binance API module
     * @param {Object} db - Database module
     * @param {Object} i18next - i18n instance
     * @param {Object} userRateLimits - User rate limits
     * @param {Object} config - Configuration object
     */
    initialize: async (bot, binance, db, i18next, userRateLimits, config) => {
        const {
            RATE_LIMIT_WINDOW_MS,
            RATE_LIMIT_MAX_REQUESTS,
            sendErrorNotification,
            logger,
            ADMIN_CHAT_ID,
            SUPPORTED_ASSETS_FILE
        } = config;

        /**
         * Check if a user is an admin
         * @param {number} chatId - User's chat ID
         * @returns {boolean}
         */
        function isAdmin(chatId) {
            return chatId.toString() === ADMIN_CHAT_ID.toString();
        }

        /**
         * Create and send the persistent menu
         * @param {number} chatId - User's chat ID
         */
        async function sendPersistentMenu(chatId) {
            const menuOptions = {
                reply_markup: {
                    keyboard: [
                        [{ text: '立即兑换' }, { text: '查看状态' }],
                        [{ text: '个人信息' }, { text: '帮助' }]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: false
                }
            };
            await bot.sendMessage(chatId, '请选择一个操作:', menuOptions);
        }

        /**
         * Handle /start command
         */
        bot.onText(/\/start/, async (msg) => {
            const chatId = msg.chat.id;

            // Initialize user rate limits and language if not set
            if (!userRateLimits[chatId]) {
                userRateLimits[chatId] = { count: 0, lastReset: Date.now(), lang: 'zh' };
            }

            // Send a welcome message along with the persistent menu
            const welcomeMessage = `欢迎使用 **Binance智能助手**！这是您的专属加密货币交易伙伴，您可以通过以下选项进行操作。请选择一个操作。`;
            await bot.sendMessage(chatId, `${escapeMarkdownV2(welcomeMessage)}`, { parse_mode: 'MarkdownV2' });

            // Send the persistent menu
            await sendPersistentMenu(chatId);
        });

        /**
         * Handle persistent menu button presses
         */
        bot.on('message', async (msg) => {
            const chatId = msg.chat.id;
            const text = msg.text || '';

            // Ignore messages that are commands, since they are handled separately
            if (text.startsWith('/')) return;

            // Get user's language preference
            const userLang = userRateLimits[chatId]?.lang || 'zh';
            await i18next.changeLanguage(userLang);
            const t = i18next.getFixedT(userLang);

            switch (text) {
                case '立即兑换':
                    // Trigger the /convert command handler
                    // Here, you can prompt the user for conversion details or guide them through steps
                    await bot.sendMessage(chatId, '请输入兑换命令，例如：/convert ETH BTC 0.5');
                    break;

                case '查看状态':
                    // Trigger the /tradehistory command handler
                    await bot.sendMessage(chatId, '请输入订单 ID，例如：/status 12345');
                    break;

                case '个人信息':
                    // Implement personal information retrieval
                    // For example, display user settings or linked accounts
                    await bot.sendMessage(chatId, '个人信息功能尚未实现。');
                    break;

                case '帮助':
                    // Trigger the /help command handler
                    const helpMessage = t('help.content');
                    await bot.sendMessage(chatId, `${escapeMarkdownV2(helpMessage)}`, { parse_mode: 'MarkdownV2' });
                    break;

                default:
                    // Handle unknown messages or other commands
                    if (!text.startsWith('/')) {
                        const defaultMessage = t('unknown_command');
                        await bot.sendMessage(chatId, `${escapeMarkdownV2(defaultMessage)}`, { parse_mode: 'MarkdownV2' });
                    }
                    break;
            }
        });

        /**
         * Handle /help command
         */
        bot.onText(/\/help/, async (msg) => {
            const chatId = msg.chat.id;
            const userLang = userRateLimits[chatId]?.lang || 'zh';
            await i18next.changeLanguage(userLang);
            const t = i18next.getFixedT(userLang);
            const helpMessage = t('help.content');

            // Send help message along with the persistent menu
            await bot.sendMessage(chatId, `${escapeMarkdownV2(helpMessage)}`, { parse_mode: 'MarkdownV2' });
            await sendPersistentMenu(chatId);
        });

        /**
         * Handle /convert command
         */
        bot.onText(/\/convert (\w+) (\w+) (\d+(\.\d+)?)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const fromAsset = match[1].toUpperCase();
            const toAsset = match[2].toUpperCase();
            const amount = parseFloat(match[3]);

            // Implement rate limiting per user
            const now = Date.now();
            if (!userRateLimits[chatId]) {
                userRateLimits[chatId] = { count: 1, lastReset: now, lang: 'zh' };
            } else {
                if (now - userRateLimits[chatId].lastReset > RATE_LIMIT_WINDOW_MS) {
                    userRateLimits[chatId].count = 1;
                    userRateLimits[chatId].lastReset = now;
                } else {
                    userRateLimits[chatId].count += 1;
                }
            }

            if (userRateLimits[chatId].count > RATE_LIMIT_MAX_REQUESTS) {
                const userLang = userRateLimits[chatId].lang || 'zh';
                await i18next.changeLanguage(userLang);
                const t = i18next.getFixedT(userLang);
                const rateLimitMessage = t('rate_limit_exceeded') || '⚠️ *速率限制超出:*\n请稍后再试。';
                bot.sendMessage(chatId, `${escapeMarkdownV2(rateLimitMessage)}`, { parse_mode: 'MarkdownV2' });
                return;
            }

            // Check if assets are supported
            const isSupported = binance.supportedAssets.some(pair => 
                (pair.fromAsset === fromAsset && pair.toAsset === toAsset) ||
                (pair.fromAsset === toAsset && pair.toAsset === fromAsset) // Support reverse conversion
            );

            if (!isSupported) {
                const userLang = userRateLimits[chatId].lang || 'zh';
                await i18next.changeLanguage(userLang);
                const t = i18next.getFixedT(userLang);
                const notSupportedMessage = `⚠️ *货币对不支持:*\n${fromAsset} ↔️ ${toAsset}。`;
                bot.sendMessage(chatId, `${escapeMarkdownV2(notSupportedMessage)}`, { parse_mode: 'MarkdownV2' });
                return;
            }

            // Create an inline keyboard to confirm conversion
            const inlineKeyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '确认兑换', callback_data: `confirm_convert_${fromAsset}_${toAsset}_${amount}` },
                            { text: '取消', callback_data: 'cancel_convert' }
                        ]
                    ]
                }
            };
            const confirmMessage = `您确认要兑换 *${amount}* ${fromAsset} 为 *${toAsset}* 吗？`;
            await bot.sendMessage(chatId, `${escapeMarkdownV2(confirmMessage)}`, { parse_mode: 'MarkdownV2', ...inlineKeyboard });
        });

        /**
         * Handle inline keyboard button clicks
         */
        bot.on('callback_query', async (callbackQuery) => {
            const message = callbackQuery.message;
            const chatId = message.chat.id;
            const data = callbackQuery.data;

            // Acknowledge the callback to remove the loading state
            await bot.answerCallbackQuery(callbackQuery.id);

            if (data.startsWith('confirm_convert_')) {
                const parts = data.split('_');
                const fromAsset = parts[2];
                const toAsset = parts[3];
                const amount = parseFloat(parts[4]);

                // Proceed with the conversion
                await instantConvert(chatId, fromAsset, toAsset, amount);

                // Optionally, send the persistent menu again
                await sendPersistentMenu(chatId);
            } else if (data === 'cancel_convert') {
                await bot.sendMessage(chatId, `${escapeMarkdownV2('兑换已取消。')}`, { parse_mode: 'MarkdownV2' });
                await sendPersistentMenu(chatId);
            } else {
                // Handle other callback queries (if any)
                switch (data) {
                    case 'convert_now':
                        await bot.sendMessage(chatId, '请输入兑换命令，例如：/convert ETH BTC 0.5');
                        break;

                    case 'view_status':
                        await bot.sendMessage(chatId, '请输入订单 ID，例如：/status 12345');
                        break;

                    case 'personal_info':
                        await bot.sendMessage(chatId, '个人信息功能尚未实现。');
                        break;

                    case 'help':
                        const userLang = userRateLimits[chatId]?.lang || 'zh';
                        await i18next.changeLanguage(userLang);
                        const t = i18next.getFixedT(userLang);
                        const helpMessage = t('help.content');
                        await bot.sendMessage(chatId, `${escapeMarkdownV2(helpMessage)}`, { parse_mode: 'MarkdownV2' });
                        break;

                    default:
                        await bot.sendMessage(chatId, `${escapeMarkdownV2('未知操作。')}`, { parse_mode: 'MarkdownV2' });
                        break;
                }
            }
        });

        /**
         * Handle /status command
         */
        bot.onText(/\/status (\w+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const orderId = match[1];

            try {
                const order = await db.get(`SELECT * FROM orders WHERE orderId = ? AND chatId = ?`, [orderId, chatId]);
                if (!order) {
                    const statusNotFoundMessage = `⚠️ *订单未找到:*\n未找到订单 ID ${orderId}。`;
                    await bot.sendMessage(chatId, `${escapeMarkdownV2(statusNotFoundMessage)}`, { parse_mode: 'MarkdownV2' });
                    return;
                }

                let statusMessage = `*订单 ID:* ${order.orderId}\n*状态:* ${order.status}`;
                if (order.status === 'failed') {
                    statusMessage += `\n*错误:* ${escapeMarkdownV2(order.error)}`;
                }

                await bot.sendMessage(chatId, `${escapeMarkdownV2(statusMessage)}`, { parse_mode: 'MarkdownV2' });
                await sendPersistentMenu(chatId);
            } catch (error) {
                logger.error(`查询订单状态失败: ${error.message}`);
                const failedMessage = `❌ *转换失败:*\n${escapeMarkdownV2(error.message)}`;
                await bot.sendMessage(chatId, `${escapeMarkdownV2(failedMessage)}`, { parse_mode: 'MarkdownV2' });

                // Notify admin
                await sendErrorNotification(`查询订单状态失败: ${error.message}`);
            }
        });

        /**
         * Handle /tradehistory command
         */
        bot.onText(/\/tradehistory/, async (msg) => {
            const chatId = msg.chat.id;

            try {
                const orderStatusList = await db.all(`SELECT * FROM orders WHERE chatId = ? ORDER BY timestamp DESC LIMIT 10`, [chatId]);

                if (orderStatusList && orderStatusList.length > 0) {
                    let message = `📄 *最近的闪兑交易历史:*\n\n`;
                    orderStatusList.forEach((order, index) => {
                        message += `${index + 1}. *订单 ID:* ${order.orderId}\n   *从:* ${order.fromAsset}\n   *到:* ${order.toAsset}\n   *数量:* ${order.amount}\n   *状态:* ${order.status}\n   *时间:* ${order.timestamp}\n\n`;
                    });
                    await bot.sendMessage(chatId, `${escapeMarkdownV2(message)}`, { parse_mode: 'MarkdownV2' });
                } else {
                    const noHistoryMessage = `✅ 当前没有闪兑交易历史。`;
                    await bot.sendMessage(chatId, `${escapeMarkdownV2(noHistoryMessage)}`, { parse_mode: 'MarkdownV2' });
                }

                await sendPersistentMenu(chatId);
            } catch (error) {
                logger.error(`查询闪兑交易历史失败: ${error.message}`);
                const failedMessage = `❌ *转换失败:*\n${escapeMarkdownV2(error.message)}`;
                await bot.sendMessage(chatId, `${escapeMarkdownV2(failedMessage)}`, { parse_mode: 'MarkdownV2' });

                // Notify admin
                await sendErrorNotification(`查询闪兑交易历史失败: ${error.message}`);
            }
        });

        /**
         * Handle /placeorder command
         */
        bot.onText(/\/placeorder (\w+) (\w+) (\d+(\.\d+)?) (\d+(\.\d+)?)$/, async (msg, match) => {
            const chatId = msg.chat.id;
            const fromAsset = match[1].toUpperCase();
            const toAsset = match[2].toUpperCase();
            const amount = parseFloat(match[3]);
            const price = parseFloat(match[5]);

            // Input validation
            if (isNaN(amount) || amount <= 0 || isNaN(price) || price <= 0) {
                const failedMessage = `❌ *转换失败:*\n金额和价格必须为正数。`;
                await bot.sendMessage(chatId, failedMessage, { parse_mode: 'MarkdownV2' });
                return;
            }

            // Check if assets are supported
            const isSupported = binance.supportedAssets.some(pair => 
                (pair.fromAsset === fromAsset && pair.toAsset === toAsset) ||
                (pair.fromAsset === toAsset && pair.toAsset === fromAsset)
            );

            if (!isSupported) {
                const notSupportedMessage = `⚠️ *货币对不支持:*\n${fromAsset} ↔️ ${toAsset}。`;
                await bot.sendMessage(chatId, `${escapeMarkdownV2(notSupportedMessage)}`, { parse_mode: 'MarkdownV2' });
                return;
            }

            try {
                // Place limit order
                const orderResult = await binance.placeConvertLimitOrder(fromAsset, toAsset, amount, price);

                if (orderResult && orderResult.orderId) {
                    // Record order in database
                    await db.run(
                        `INSERT INTO orders (orderId, chatId, fromAsset, toAsset, amount, status) VALUES (?, ?, ?, ?, ?, ?)`,
                        [orderResult.orderId, chatId, fromAsset, toAsset, amount, 'pending']
                    );

                    const successMessage = `✅ *限价单已下达！*\n\n*从:* ${fromAsset}\n*到:* ${toAsset}\n*数量:* ${amount}\n*价格:* ${price}\n*订单 ID:* ${orderResult.orderId}`;
                    await bot.sendMessage(chatId, `${escapeMarkdownV2(successMessage)}`, { parse_mode: 'MarkdownV2' });
                } else {
                    throw new Error('限价单创建失败。');
                }

                await sendPersistentMenu(chatId);
            } catch (error) {
                logger.error(`限价单创建失败: ${error.message}`);
                const failedMessage = `❌ *转换失败:*\n${escapeMarkdownV2(error.message)}`;
                await bot.sendMessage(chatId, `${escapeMarkdownV2(failedMessage)}`, { parse_mode: 'MarkdownV2' });

                // Record failed order in database
                const quoteId = crypto.randomBytes(16).toString('hex');
                await db.run(
                    `INSERT INTO orders (orderId, chatId, fromAsset, toAsset, amount, status, error) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [quoteId, chatId, fromAsset || 'Unknown', toAsset || 'Unknown', amount || 0, 'failed', escapeMarkdownV2(error.message)]
                );

                // Notify admin
                await sendErrorNotification(`限价单创建失败: ${error.message}`);
                await sendPersistentMenu(chatId);
            }
        });

        /**
         * Handle /cancelorder command
         */
        bot.onText(/\/cancelorder (\w+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const orderId = match[1];

            try {
                // Cancel limit order
                const cancelResult = await binance.cancelConvertLimitOrder(orderId);

                if (cancelResult && cancelResult.orderId) {
                    // Update order status in database
                    await db.run(`UPDATE orders SET status = ? WHERE orderId = ?`, ['canceled', orderId]);

                    const successMessage = `✅ *限价单已取消！*\n\n*订单 ID:* ${orderId}`;
                    await bot.sendMessage(chatId, `${escapeMarkdownV2(successMessage)}`, { parse_mode: 'MarkdownV2' });
                } else {
                    throw new Error('限价单取消失败。');
                }

                await sendPersistentMenu(chatId);
            } catch (error) {
                logger.error(`限价单取消失败: ${error.message}`);
                const failedMessage = `❌ *转换失败:*\n${escapeMarkdownV2(error.message)}`;
                await bot.sendMessage(chatId, `${escapeMarkdownV2(failedMessage)}`, { parse_mode: 'MarkdownV2' });

                // Notify admin
                await sendErrorNotification(`限价单取消失败: ${error.message}`);
            }
        });

        /**
         * Handle /exchangeinfo command (single query)
         */
        bot.onText(/\/exchangeinfo$/, async (msg) => {
            const chatId = msg.chat.id;

            try {
                const exchangeInfo = await binance.getExchangeInfo();

                if (exchangeInfo && exchangeInfo.pairs) {
                    let message = `📈 *交易对信息:*\n\n`;
                    exchangeInfo.pairs.forEach((pair, index) => {
                        message += `${index + 1}. *交易对:* ${pair.fromAsset} ↔️ ${pair.toAsset}\n   *最小金额:* ${pair.minAmount}\n   *最大金额:* ${pair.maxAmount}\n\n`;
                    });
                    await bot.sendMessage(chatId, `${escapeMarkdownV2(message)}`, { parse_mode: 'MarkdownV2' });
                } else {
                    throw new Error('未能获取交易对信息。');
                }

                await sendPersistentMenu(chatId);
            } catch (error) {
                logger.error(`获取交易对信息失败: ${error.message}`);
                const failedMessage = `❌ *转换失败:*\n${escapeMarkdownV2(error.message)}`;
                await bot.sendMessage(chatId, `${escapeMarkdownV2(failedMessage)}`, { parse_mode: 'MarkdownV2' });

                // Notify admin
                await sendErrorNotification(`获取交易对信息失败: ${error.message}`);
            }
        });

        /**
         * Handle /assetinfo command (batch query)
         */
        bot.onText(/\/assetinfo (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const assetsStr = match[1].trim();

            const assets = assetsStr.split(',').map(asset => asset.trim().toUpperCase()).filter(asset => asset.length > 0);
            if (assets.length === 0) {
                const invalidFormatMessage = `⚠️ 无效的资产查询格式。请使用 \`Asset1, Asset2\` 的格式。`;
                await bot.sendMessage(chatId, `${escapeMarkdownV2(invalidFormatMessage)}`, { parse_mode: 'MarkdownV2' });
                return;
            }

            const assetInfoList = [];
            const notFoundAssets = [];

            for (const asset of assets) {
                try {
                    const info = await binance.getAssetInfo(); // Assume API returns all asset info
                    const specificAssetInfo = info.assets.find(a => a.asset === asset);
                    if (specificAssetInfo) {
                        assetInfoList.push(specificAssetInfo);
                    } else {
                        notFoundAssets.push(asset);
                    }
                } catch (error) {
                    logger.error(`获取资产 ${asset} 精度信息失败: ${error.message}`);
                    notFoundAssets.push(asset);
                }
            }

            let message = '';

            if (assetInfoList.length > 0) {
                message += `📊 *资产精度信息:*\n\n`;
                assetInfoList.forEach((asset, index) => {
                    message += `${index + 1}. *资产:* ${asset.asset}\n   *精度:* ${asset.precision}\n\n`;
                });
            }

            if (notFoundAssets.length > 0) {
                message += `⚠️ 以下资产信息未找到或获取失败:\n${notFoundAssets.join('\n')}`;
            }

            if (message === '') {
                message = `⚠️ 未找到任何有效的资产精度信息。`;
            }

            await bot.sendMessage(chatId, `${escapeMarkdownV2(message)}`, { parse_mode: 'MarkdownV2' });
            await sendPersistentMenu(chatId);
        });

        /**
         * Handle /tradehistory command
         */
        bot.onText(/\/tradehistory/, async (msg) => {
            const chatId = msg.chat.id;

            try {
                const orderStatusList = await db.all(`SELECT * FROM orders WHERE chatId = ? ORDER BY timestamp DESC LIMIT 10`, [chatId]);

                if (orderStatusList && orderStatusList.length > 0) {
                    let message = `📄 *最近的闪兑交易历史:*\n\n`;
                    orderStatusList.forEach((order, index) => {
                        message += `${index + 1}. *订单 ID:* ${order.orderId}\n   *从:* ${order.fromAsset}\n   *到:* ${order.toAsset}\n   *数量:* ${order.amount}\n   *状态:* ${order.status}\n   *时间:* ${order.timestamp}\n\n`;
                    });
                    await bot.sendMessage(chatId, `${escapeMarkdownV2(message)}`, { parse_mode: 'MarkdownV2' });
                } else {
                    const noHistoryMessage = `✅ 当前没有闪兑交易历史。`;
                    await bot.sendMessage(chatId, `${escapeMarkdownV2(noHistoryMessage)}`, { parse_mode: 'MarkdownV2' });
                }

                await sendPersistentMenu(chatId);
            } catch (error) {
                logger.error(`查询闪兑交易历史失败: ${error.message}`);
                const failedMessage = `❌ *转换失败:*\n${escapeMarkdownV2(error.message)}`;
                await bot.sendMessage(chatId, `${escapeMarkdownV2(failedMessage)}`, { parse_mode: 'MarkdownV2' });

                // Notify admin
                await sendErrorNotification(`查询闪兑交易历史失败: ${error.message}`);
            }
        });

        /**
         * Handle /addassets command (admin)
         */
        bot.onText(/\/addassets (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const assetsStr = match[1].trim();

            // Check if user is admin
            if (!isAdmin(chatId)) {
                const permissionDeniedMessage = `⚠️ 您没有权限执行此操作。`;
                await bot.sendMessage(chatId, `${escapeMarkdownV2(permissionDeniedMessage)}`, { parse_mode: 'MarkdownV2' });
                return;
            }

            const assetPairs = assetsStr.split(',').map(pair => pair.trim()).filter(pair => pair.includes(':'));
            if (assetPairs.length === 0) {
                const invalidFormatMessage = `⚠️ 无效的资产兑换对格式。请使用 \`fromAsset:toAsset\` 的格式。`;
                await bot.sendMessage(chatId, invalidFormatMessage, { parse_mode: 'MarkdownV2' });
                return;
            }

            const newPairs = [];
            const existingPairs = [];
            assetPairs.forEach(pair => {
                const [from, to] = pair.split(':').map(asset => asset.toUpperCase());
                if (!from || !to) {
                    // Invalid format
                    return;
                }
                const exists = binance.supportedAssets.some(existingPair => 
                    (existingPair.fromAsset === from && existingPair.toAsset === to) ||
                    (existingPair.fromAsset === to && existingPair.toAsset === from)
                );
                if (exists) {
                    existingPairs.push(`${from} ↔️ ${to}`);
                } else {
                    newPairs.push({ fromAsset: from, toAsset: to });
                }
            });

            // Add new pairs
            binance.supportedAssets = binance.supportedAssets.concat(newPairs);

            try {
                await writeFileAsync(path.resolve(__dirname, '../../', SUPPORTED_ASSETS_FILE), JSON.stringify(binance.supportedAssets, null, 4));
                logger.info(`管理员批量添加资产兑换对: ${JSON.stringify(newPairs)}`);

                let responseMessage = '';
                if (newPairs.length > 0) {
                    const addedPairs = newPairs.map(pair => `${pair.fromAsset} ↔️ ${pair.toAsset}`).join('\n');
                    responseMessage += `✅ 成功添加以下资产兑换对:\n${addedPairs}\n\n`;
                }
                if (existingPairs.length > 0) {
                    const alreadyExists = existingPairs.join('\n');
                    responseMessage += `⚠️ 以下资产兑换对已存在，未重复添加:\n${alreadyExists}`;
                }

                await bot.sendMessage(chatId, responseMessage, { parse_mode: 'MarkdownV2' });
                await sendPersistentMenu(chatId);
            } catch (error) {
                logger.error(`批量添加资产兑换对失败: ${error.message}`);
                const failedMessage = `❌ *转换失败:*\n${escapeMarkdownV2(error.message)}`;
                await bot.sendMessage(chatId, failedMessage, { parse_mode: 'MarkdownV2' });
                await sendErrorNotification(`批量添加资产兑换对失败: ${error.message}`);
            }
        });

        /**
         * Handle /removeassets command (admin)
         */
        bot.onText(/\/removeassets (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const assetsStr = match[1].trim();

            // Check if user is admin
            if (!isAdmin(chatId)) {
                const permissionDeniedMessage = `⚠️ 您没有权限执行此操作。`;
                await bot.sendMessage(chatId, permissionDeniedMessage, { parse_mode: 'MarkdownV2' });
                return;
            }

            const assetPairs = assetsStr.split(',').map(pair => pair.trim()).filter(pair => pair.includes(':'));
            if (assetPairs.length === 0) {
                const invalidFormatMessage = `⚠️ 无效的资产兑换对格式。请使用 \`fromAsset:toAsset\` 的格式。`;
                await bot.sendMessage(chatId, invalidFormatMessage, { parse_mode: 'MarkdownV2' });
                return;
            }

            const removedPairs = [];
            const notFoundPairs = [];
            assetPairs.forEach(pair => {
                const [from, to] = pair.split(':').map(asset => asset.toUpperCase());
                if (!from || !to) {
                    // Invalid format
                    return;
                }
                const index = binance.supportedAssets.findIndex(existingPair => 
                    (existingPair.fromAsset === from && existingPair.toAsset === to) ||
                    (existingPair.fromAsset === to && existingPair.toAsset === from)
                );
                if (index !== -1) {
                    const removed = binance.supportedAssets.splice(index, 1)[0];
                    removedPairs.push(`${removed.fromAsset} ↔️ ${removed.toAsset}`);
                } else {
                    notFoundPairs.push(`${from} ↔️ ${to}`);
                }
            });

            try {
                await writeFileAsync(path.resolve(__dirname, '../../', SUPPORTED_ASSETS_FILE), JSON.stringify(binance.supportedAssets, null, 4));
                logger.info(`管理员批量移除资产兑换对: ${JSON.stringify(removedPairs)}`);

                let responseMessage = '';
                if (removedPairs.length > 0) {
                    const removed = removedPairs.join('\n');
                    responseMessage += `✅ 成功移除以下资产兑换对:\n${removed}\n\n`;
                }
                if (notFoundPairs.length > 0) {
                    const notFound = notFoundPairs.join('\n');
                    responseMessage += `⚠️ 以下资产兑换对不存在，无法移除:\n${notFound}`;
                }

                await bot.sendMessage(chatId, `${escapeMarkdownV2(responseMessage)}`, { parse_mode: 'MarkdownV2' });
                await sendPersistentMenu(chatId);
            } catch (error) {
                logger.error(`批量移除资产兑换对失败: ${error.message}`);
                const failedMessage = `❌ *转换失败:*\n${escapeMarkdownV2(error.message)}`;
                await bot.sendMessage(chatId, `${escapeMarkdownV2(failedMessage)}`, { parse_mode: 'MarkdownV2' });
                await sendErrorNotification(`批量移除资产兑换对失败: ${error.message}`);
            }
        });

        /**
         * Handle /exchangeinfo command (batch query)
         */
        bot.onText(/\/exchangeinfo (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const pairsStr = match[1].trim();

            const assetPairs = pairsStr.split(',').map(pair => pair.trim()).filter(pair => pair.includes(':'));
            if (assetPairs.length === 0) {
                const invalidFormatMessage = `⚠️ 无效的交易对查询格式。请使用 \`fromAsset:toAsset\` 的格式。`;
                await bot.sendMessage(chatId, `${escapeMarkdownV2(invalidFormatMessage)}`, { parse_mode: 'MarkdownV2' });
                return;
            }

            const exchangeInfoList = [];
            const notFoundPairs = [];

            for (const pairStr of assetPairs) {
                const [from, to] = pairStr.split(':').map(asset => asset.toUpperCase());
                if (!from || !to) continue;

                // Find pair info
                const pairInfo = binance.supportedAssets.find(existingPair => 
                    (existingPair.fromAsset === from && existingPair.toAsset === to) ||
                    (existingPair.fromAsset === to && existingPair.toAsset === from)
                );

                if (pairInfo) {
                    try {
                        const info = await binance.getExchangeInfo(); // Assume API returns all exchange info
                        const specificPairInfo = info.pairs.find(p => 
                            (p.fromAsset === from && p.toAsset === to) ||
                            (p.fromAsset === to && p.toAsset === from)
                        );
                        if (specificPairInfo) {
                            exchangeInfoList.push(specificPairInfo);
                        } else {
                            notFoundPairs.push(pairStr);
                        }
                    } catch (error) {
                        logger.error(`获取交易对 ${pairStr} 信息失败: ${error.message}`);
                        notFoundPairs.push(pairStr);
                    }
                } else {
                    notFoundPairs.push(pairStr);
                }
            }

            let message = '';

            if (exchangeInfoList.length > 0) {
                message += `📈 *交易对信息:*\n\n`;
                exchangeInfoList.forEach((pair, index) => {
                    message += `${index + 1}. *交易对:* ${pair.fromAsset} ↔️ ${pair.toAsset}\n   *最小金额:* ${pair.minAmount}\n   *最大金额:* ${pair.maxAmount}\n\n`;
                });
            }

            if (notFoundPairs.length > 0) {
                message += `⚠️ 以下交易对信息未找到或获取失败:\n${notFoundPairs.join('\n')}`;
            }

            if (message === '') {
                message = `⚠️ 未找到任何有效的交易对信息。`;
            }

            await bot.sendMessage(chatId, `${escapeMarkdownV2(message)}`, { parse_mode: 'MarkdownV2' });
            await sendPersistentMenu(chatId);
        });

        /**
         * Handle /assetinfo command (batch query)
         */
        bot.onText(/\/assetinfo (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const assetsStr = match[1].trim();

            const assets = assetsStr.split(',').map(asset => asset.trim().toUpperCase()).filter(asset => asset.length > 0);
            if (assets.length === 0) {
                const invalidFormatMessage = `⚠️ 无效的资产查询格式。请使用 \`Asset1, Asset2\` 的格式。`;
                await bot.sendMessage(chatId, `${escapeMarkdownV2(invalidFormatMessage)}`, { parse_mode: 'MarkdownV2' });
                return;
            }

            const assetInfoList = [];
            const notFoundAssets = [];

            for (const asset of assets) {
                try {
                    const info = await binance.getAssetInfo(); // Assume API returns all asset info
                    const specificAssetInfo = info.assets.find(a => a.asset === asset);
                    if (specificAssetInfo) {
                        assetInfoList.push(specificAssetInfo);
                    } else {
                        notFoundAssets.push(asset);
                    }
                } catch (error) {
                    logger.error(`获取资产 ${asset} 精度信息失败: ${error.message}`);
                    notFoundAssets.push(asset);
                }
            }

            let message = '';

            if (assetInfoList.length > 0) {
                message += `📊 *资产精度信息:*\n\n`;
                assetInfoList.forEach((asset, index) => {
                    message += `${index + 1}. *资产:* ${asset.asset}\n   *精度:* ${asset.precision}\n\n`;
                });
            }

            if (notFoundAssets.length > 0) {
                message += `⚠️ 以下资产信息未找到或获取失败:\n${notFoundAssets.join('\n')}`;
            }

            if (message === '') {
                message = `⚠️ 未找到任何有效的资产精度信息。`;
            }

            await bot.sendMessage(chatId, `${escapeMarkdownV2(message)}`, { parse_mode: 'MarkdownV2' });
            await sendPersistentMenu(chatId);
        });

        /**
         * Handle unknown commands or non-command messages
         */
        bot.on('message', async (msg) => {
            const chatId = msg.chat.id;
            const text = msg.text || '';

            // If message is not a known command or menu option
            if (!text.startsWith('/') && !['立即兑换', '查看状态', '个人信息', '帮助'].includes(text)) {
                const defaultMessage = `⚠️ 未知命令。请使用 /help 查看可用命令。`;
                await bot.sendMessage(chatId, `${escapeMarkdownV2(defaultMessage)}`, { parse_mode: 'MarkdownV2' });
                await sendPersistentMenu(chatId);
            }
        });

        /**
         * Listen to polling errors
         */
        bot.on('polling_error', async (error) => {
            logger.error(`[polling_error] ${JSON.stringify(error)}`);
            await sendErrorNotification(`Polling Error: ${JSON.stringify(error)}`);
        });

        /**
         * Handle unhandled promise rejections
         */
        process.on('unhandledRejection', async (reason, promise) => {
            logger.error(`Unhandled Rejection at: ${promise} reason: ${reason}`);
            await sendErrorNotification(`Unhandled Rejection: ${reason}`);
        });

        /**
         * Handle uncaught exceptions
         */
        process.on('uncaughtException', async (error) => {
            logger.error(`Uncaught Exception: ${error.message}`);
            await sendErrorNotification(`Uncaught Exception: ${error.message}`);
            process.exit(1); // Exit the process
        });

        /**
         * Perform instant conversion
         * @param {number} chatId - User's chat ID
         * @param {string} fromAsset - Source asset
         * @param {string} toAsset - Target asset
         * @param {number} amount - Amount to convert
         */
        async function instantConvert(chatId, fromAsset, toAsset, amount) {
            try {
                // Get user's language
                const userLang = userRateLimits[chatId]?.lang || 'zh';
                await i18next.changeLanguage(userLang);
                const t = i18next.getFixedT(userLang);

                // Get conversion quote
                const quote = await binance.getConvertQuoteOptimized(fromAsset, toAsset, amount);
                if (!quote || !quote.quoteId) {
                    throw new Error(t('convert_failed', { errorMessage: '未能获取闪兑报价' }));
                }

                // Accept quote
                const acceptResult = await binance.acceptConvertQuote(quote.quoteId);

                if (acceptResult && acceptResult.orderId) {
                    // Record order in database
                    await db.run(
                        `INSERT INTO orders (orderId, chatId, fromAsset, toAsset, amount, status) VALUES (?, ?, ?, ?, ?, ?)`,
                        [acceptResult.orderId, chatId, fromAsset, toAsset, amount, 'completed']
                    );

                    const successMessage = `✅ *转换成功！*\n\n*从:* ${fromAsset}\n*到:* ${toAsset}\n*数量:* ${amount}\n*订单 ID:* ${acceptResult.orderId}`;
                    await bot.sendMessage(chatId, `${escapeMarkdownV2(successMessage)}`, { parse_mode: 'MarkdownV2' });
                } else {
                    throw new Error(t('convert_failed', { errorMessage: '闪兑交易执行失败' }));
                }

                await sendPersistentMenu(chatId);
            } catch (error) {
                logger.error(`闪兑失败: ${error.message}`);
                const failedMessage = `❌ *转换失败:*\n${escapeMarkdownV2(error.message)}`;
                await bot.sendMessage(chatId, `${escapeMarkdownV2(failedMessage)}`, { parse_mode: 'MarkdownV2' });

                // Record failed order in database
                const quoteId = crypto.randomBytes(16).toString('hex');
                await db.run(
                    `INSERT INTO orders (orderId, chatId, fromAsset, toAsset, amount, status, error) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [quoteId, chatId, fromAsset || 'Unknown', toAsset || 'Unknown', amount || 0, 'failed', escapeMarkdownV2(error.message)]
                );

                // Notify admin
                await sendErrorNotification(`闪兑失败: ${error.message}`);
                await sendPersistentMenu(chatId);
            }
        }
    }
};
