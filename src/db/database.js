// src/db/database.js

const sqlite3 = require('sqlite3').verbose();
const { promisify } = require('util');
const path = require('path');
const logger = require('../config/logger').logger;

// 初始化数据库连接
const db = new sqlite3.Database(path.resolve(__dirname, '../../database.db'), (err) => {
    if (err) {
        logger.error(`数据库连接失败: ${err.message}`);
    } else {
        logger.info('成功连接到数据库');
    }
});

// Promisify 常用数据库操作
const run = promisify(db.run.bind(db));
const get = promisify(db.get.bind(db));
const all = promisify(db.all.bind(db));

// 初始化数据库表
(async () => {
    try {
        await run(`CREATE TABLE IF NOT EXISTS orders (
            orderId TEXT PRIMARY KEY,
            chatId INTEGER,
            fromAsset TEXT,
            toAsset TEXT,
            amount REAL,
            status TEXT,
            error TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        logger.info('订单表已创建或已存在');
    } catch (error) {
        logger.error(`创建订单表失败: ${error.message}`);
    }
})();

module.exports = { db, run, get, all };
