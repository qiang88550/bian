// src/config/i18n.js

const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const path = require('path');

i18next
  .use(Backend)
  .init({
    fallbackLng: 'zh', // 默认语言
    preload: [
      'en',  // 英语
      'zh',  // 中文
      'es',  // 西班牙语
      'fr',  // 法语
      'de',  // 德语
      'it',  // 意大利语
      'ja',  // 日语
      'ko',  // 韩语
      'nl',  // 荷兰语
      'no',  // 挪威语
      'pt',  // 葡萄牙语
      'ru',  // 俄语
      'sv',  // 瑞典语
      'vi',  // 越南语
      'da'   // 丹麦语
    ], // 预加载的语言列表
    ns: ['translation'], // 命名空间
    defaultNS: 'translation',
    backend: {
      loadPath: path.join(__dirname, '../locales/{{lng}}.json'), // 翻译文件路径
    },
    interpolation: {
      escapeValue: false, // 不需要对输出进行转义
    },
    react: {
      useSuspense: false, // 如果使用 React，避免使用 Suspense
    },
    detection: {
      // 语言检测选项（如果需要）
      order: ['querystring', 'cookie'],
      caches: ['cookie'],
    },
    debug: false, // 启用调试模式（可选）
  })
  .then(() => {
    console.log('i18next 初始化成功');
  })
  .catch((err) => {
    console.error('i18next 初始化失败:', err);
  });

module.exports = i18next;
