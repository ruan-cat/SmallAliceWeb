import { defineUserConfig } from 'vuepress';
import theme from './theme.js';

export default defineUserConfig({
  base: '/',

  locales: {
    '/': {
      lang: 'zh-CN',
      title: 'Docs Demo',
      description: 'A docs demo for vuepress-theme-hope',
    },
  },

  theme,

  // Enable it with pwa
  // shouldPrefetch: false,
});
