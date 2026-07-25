import AiVue from "@ruan-cat-drill-doc/ai-vue";
import "@ruan-cat-drill-doc/ai-vue/styles";
import { defineNuxtPlugin } from "#app";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";

export default defineNuxtPlugin((nuxtApp) => {
	nuxtApp.vueApp.use(ElementPlus);
	nuxtApp.vueApp.use(AiVue);
});
