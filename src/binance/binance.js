// src/binance/binance.js

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const axios = require('axios');
const logger = require('../config/logger').logger;

const readFileAsync = promisify(fs.readFile);

const binance = {
    supportedAssets: [], // Loaded from SUPPORTED_ASSETS_FILE

    /**
     * Load supported asset pairs from file
     * @param {string} filePath - Path to the supported assets file
     */
    async loadSupportedAssets(filePath) {
        try {
            const data = await readFileAsync(path.resolve(__dirname, '../../', filePath), 'utf8');
            this.supportedAssets = JSON.parse(data);
            logger.info('成功加载支持的资产兑换对');
        } catch (error) {
            logger.error(`加载支持的资产兑换对失败: ${error.message}`);
            throw error;
        }
    },

    /**
     * Get optimized conversion quote
     * @param {string} fromAsset - Source asset
     * @param {string} toAsset - Target asset
     * @param {number} amount - Amount to convert
     * @returns {Object} - Quote information
     */
    async getConvertQuoteOptimized(fromAsset, toAsset, amount) {
        try {
            const response = await axios.post('https://api.binance.com/api/v3/convertQuote', {
                fromAsset,
                toAsset,
                amount
            });
            return response.data;
        } catch (error) {
            logger.error(`获取闪兑报价失败: ${error.message}`);
            throw error;
        }
    },

    /**
     * Accept conversion quote
     * @param {string} quoteId - Quote ID
     * @returns {Object} - Order information
     */
    async acceptConvertQuote(quoteId) {
        try {
            const response = await axios.post('https://api.binance.com/api/v3/acceptQuote', {
                quoteId
            });
            return response.data;
        } catch (error) {
            logger.error(`接受闪兑报价失败: ${error.message}`);
            throw error;
        }
    },

    /**
     * Place a limit order for conversion
     * @param {string} fromAsset - Source asset
     * @param {string} toAsset - Target asset
     * @param {number} amount - Amount to convert
     * @param {number} price - Price
     * @returns {Object} - Order information
     */
    async placeConvertLimitOrder(fromAsset, toAsset, amount, price) {
        try {
            const response = await axios.post('https://api.binance.com/api/v3/placeLimitOrder', {
                fromAsset,
                toAsset,
                amount,
                price
            });
            return response.data;
        } catch (error) {
            logger.error(`下限价单失败: ${error.message}`);
            throw error;
        }
    },

    /**
     * Cancel a limit order
     * @param {string} orderId - Order ID
     * @returns {Object} - Cancellation result
     */
    async cancelConvertLimitOrder(orderId) {
        try {
            const response = await axios.post('https://api.binance.com/api/v3/cancelOrder', {
                orderId
            });
            return response.data;
        } catch (error) {
            logger.error(`取消限价单失败: ${error.message}`);
            throw error;
        }
    },

    /**
     * Query open limit orders
     * @returns {Array} - List of open orders
     */
    async queryOpenConvertLimitOrders() {
        try {
            const response = await axios.get('https://api.binance.com/api/v3/openOrders');
            return response.data;
        } catch (error) {
            logger.error(`查询开放限价单失败: ${error.message}`);
            throw error;
        }
    },

    /**
     * Get exchange information
     * @returns {Object} - Exchange information
     */
    async getExchangeInfo() {
        try {
            const response = await axios.get('https://api.binance.com/api/v3/exchangeInfo');
            return response.data;
        } catch (error) {
            logger.error(`获取交易对信息失败: ${error.message}`);
            throw error;
        }
    },

    /**
     * Get asset precision information
     * @returns {Object} - Asset information
     */
    async getAssetInfo() {
        try {
            const response = await axios.get('https://api.binance.com/api/v3/assetInfo');
            return response.data;
        } catch (error) {
            logger.error(`获取资产精度信息失败: ${error.message}`);
            throw error;
        }
    }
};

// Debug output to confirm methods exist
console.log('Available methods in binance:', Object.keys(binance));

module.exports = binance;
