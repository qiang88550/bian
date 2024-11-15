# Telegram Binance Bot

A Telegram bot for asset conversion using Binance API.

## Features

- Convert assets between different cryptocurrencies using Binance API.
- Supports multiple commands:
  - `/convert <fromAsset> <toAsset> <amount>`: Convert assets.
  - `/status <orderId>`: Check order status.
  - `/help`: Show help menu.
  - `/listassets`: List supported asset pairs.
  - `/placeorder <fromAsset> <toAsset> <amount> <price>`: Place a limit order.
  - `/cancelorder <orderId>`: Cancel an order.
  - `/queryopenorders`: Query open orders.
  - `/tradehistory`: View trade history.
  - `/setlang <en|zh>`: Set language.
- Multi-language support (English and Chinese).
- Rate limiting to prevent abuse.
- Prometheus metrics for monitoring.
- Graceful shutdown and error handling.

## Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/yourusername/telegram-binance-bot.git
   cd telegram-binance-bot
