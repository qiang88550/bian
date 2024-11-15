// src/config/logger.js

const { createLogger, format, transports } = require('winston');
const path = require('path');

// 创建日志记录器
const logger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        format.errors({ stack: true }),
        format.splat(),
        format.json()
    ),
    defaultMeta: { service: 'telegram-bot' },
    transports: [
        new transports.File({ filename: path.resolve(__dirname, '../../logs/error.log'), level: 'error' }),
        new transports.File({ filename: path.resolve(__dirname, '../../logs/combined.log') }),
    ],
});

// 如果不是生产环境，则在控制台输出日志
if (process.env.NODE_ENV !== 'production') {
    logger.add(new transports.Console({
        format: format.combine(
            format.colorize(),
            format.simple()
        )
    }));
}

module.exports = { logger };