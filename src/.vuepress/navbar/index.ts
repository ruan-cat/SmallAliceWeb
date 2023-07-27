import { navbar } from "vuepress-theme-hope";

export const zhNavbar = navbar([
  {
    text: "版本发行记录",
    prefix: "/releases-record/",
    children: [
      {
        text: "v3.20 喵喵呜",
        link: "3.20/",
      },
    ],
  },
  {
    text: "QQ群群规",
    prefix: "/qq-group/",
    children: [{ text: "群条款", link: "clause/" }],
  },
]);
