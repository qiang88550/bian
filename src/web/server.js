// src/web/server.js

const express = require('express');
const morgan = require('morgan');
const { logger } = require('../config/logger');
const rateLimitMiddleware = require('express-rate-limit');
const promClient = require('prom-client');
const path = require('path');
const os = require('os');
const i18next = require('../config/i18n'); // 引入 i18next 配置
const i18nextMiddleware = require('i18next-express-middleware'); // 引入 i18next 中间件
const { WEBHOOK_PATH, WEBHOOK_URL_BASE, WEBHOOK_SECRET_TOKEN, bot } = require('../config/env');
const binance = require('../binance/binance');
const { sendStartupMessage } = require('../telegram/bot');

const app = express();

// 中间件配置
app.use(express.json());

// 使用 i18next 中间件
app.use(i18nextMiddleware.handle(i18next));

// 使用 winston 的 HTTP 请求日志记录
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// 使用 Express Rate Limit 中间件限制 HTTP 请求速率
const apiLimiter = rateLimitMiddleware({
    windowMs: 60 * 1000, // 1 分钟
    max: 100, // 每个 IP 每分钟最多 100 次请求
    message: '请求过多，请稍后再试。'
});
app.use('/telegram-webhook', apiLimiter);

// Webhook 路由
app.post(WEBHOOK_PATH, (req, res) => {
    // 记录Webhook请求的IP地址
    const userIp = req.ip || req.connection.remoteAddress;
    logger.info(`Webhook 请求来自IP: ${userIp}`);
    logger.info(`Webhook 请求环境信息: ${JSON.stringify({
        os: os.platform(),
        architecture: os.arch(),
        uptime: os.uptime(),
        loadavg: os.loadavg(),
        totalmem: os.totalmem(),
        freemem: os.freemem(),
        cpus: os.cpus().length
    })}`);

    // 由于路径已包含秘密令牌，基本上可以确保请求来自 Telegram
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// Prometheus 监控配置
// 创建一个 Registry
const register = new promClient.Registry();

// 启用默认的指标
promClient.collectDefaultMetrics({ register });

// 自定义指标
const httpRequestDurationMilliseconds = new promClient.Histogram({
    name: 'http_request_duration_ms',
    help: 'Duration of HTTP requests in ms',
    labelNames: ['method', 'route', 'code'],
    buckets: [50, 100, 300, 500, 1000, 2000] // 50ms 到 2000ms
});
register.registerMetric(httpRequestDurationMilliseconds);

// 监控中间件
app.use((req, res, next) => {
    const end = httpRequestDurationMilliseconds.startTimer();
    res.on('finish', () => {
        end({ method: req.method, route: req.route ? req.route.path : req.path, code: res.statusCode });
    });
    next();
});

// 添加 /metrics 路由供 Prometheus 抓取指标
app.get('/metrics', async (req, res) => {
    try {
        res.set('Content-Type', register.contentType);
        const metrics = await register.metrics();
        res.send(metrics);
    } catch (err) {
        logger.error(`获取 Prometheus 指标失败: ${err.message}`);
        res.status(500).end();
    }
});

// 导出 Express 应用
module.exports = app;
