/**
 * Shadow DOM 模式下注入到 Shadow Root 的核心 CSS 文本。
 *
 * 之所以需要这个常量：
 * - index.scss 是全局 SCSS，Shadow Root 内的元素读不到全局样式
 * - Shadow DOM 的核心目的就是样式隔离，所以组件必须自带样式副本
 * - 通过 :host 把宿主桥接的 CSS 变量向下传递，避免在 Shadow Root 内重新定义 brand tokens
 *
 * 仅 .ai-chat 主体样式；.ai-chat-floating-button 不进入 Shadow Root
 * （它本身在 light DOM 中作为触发器 + dock 容器）。
 */
export const AI_CHAT_SHADOW_STYLES = `
:host {
  display: block;
  contain: layout style;
  color-scheme: light dark;
}

.ai-chat {
  --ai-chat-surface: var(--ai-chat-surface-color, #111318);
  --ai-chat-surface-muted: var(--ai-chat-surface-muted-color, #171a21);
  --ai-chat-surface-elevated: var(--ai-chat-surface-elevated-color, #1d222b);
  --ai-chat-text: var(--ai-chat-text-color, #f4f7fb);
  --ai-chat-text-muted: var(--ai-chat-text-muted-color, #9aa4b2);
  --ai-chat-border: var(--ai-chat-border-color, rgb(255 255 255 / 10%));
  --ai-chat-border-strong: var(--ai-chat-border-strong-color, rgb(255 255 255 / 16%));
  --ai-chat-primary: var(--ai-chat-primary-color, #3b82f6);
  --ai-chat-primary-hover: var(--ai-chat-primary-hover-color, #60a5fa);
  --ai-chat-primary-soft: var(--ai-chat-primary-soft-color, rgb(59 130 246 / 12%));
  --ai-chat-primary-contrast: var(--ai-chat-primary-contrast-color, #ffffff);
  --ai-chat-focus: var(--ai-chat-focus-color, rgb(96 165 250 / 40%));
  --ai-chat-shadow: var(--ai-chat-shadow-color, rgb(0 0 0 / 34%));
  --ai-chat-success: var(--ai-chat-success-color, #22c55e);
  --ai-chat-danger: var(--ai-chat-danger-color, #ef4444);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: min(100%, 32rem);
  min-width: min(18rem, 100%);
  height: min(34rem, 100dvh);
  max-height: 100dvh;
  overflow: hidden;
  color: var(--ai-chat-text);
  font-size: 0.9375rem;
  background: var(--ai-chat-surface);
  border: 1px solid var(--ai-chat-border);
  border-radius: 0.75rem;
  box-shadow: 0 1rem 2.5rem var(--ai-chat-shadow);
}

.ai-chat *,
.ai-chat *::before,
.ai-chat *::after {
  box-sizing: border-box;
}

.ai-chat__messages {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 0;
  padding: 1rem;
  background: var(--ai-chat-surface-muted);
}

.ai-chat__bubble-list {
  flex: 1 1 auto;
  min-height: 0;
}

.ai-chat__error {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
  padding: 0.625rem 0.75rem;
  color: var(--ai-chat-text);
  font-size: 0.8125rem;
  line-height: 1.4;
  background: color-mix(in srgb, var(--ai-chat-danger) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--ai-chat-danger) 38%, transparent);
  border-radius: 0.5rem;
}

.ai-chat__error-dismiss {
  flex: 0 0 auto;
  padding: 0.25rem 0.5rem;
  color: var(--ai-chat-text);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
  background: transparent;
  border: 1px solid var(--ai-chat-border-strong);
  border-radius: 0.375rem;
}

.ai-chat__stop {
  align-self: flex-end;
  margin: 0 0.75rem 0.625rem;
  padding: 0.375rem 0.625rem;
  color: var(--ai-chat-text);
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
  background: var(--ai-chat-surface-elevated);
  border: 1px solid var(--ai-chat-border-strong);
  border-radius: 0.375rem;
}

.ai-chat__stop:hover {
  border-color: var(--ai-chat-primary-hover);
}

.ai-chat__stop:focus-visible {
  outline: 2px solid var(--ai-chat-primary);
  outline-offset: 2px;
}

.ai-chat__empty {
  display: grid;
  gap: 0.375rem;
  place-items: center;
  max-width: 18rem;
  margin: auto;
  padding: 1.25rem;
  color: var(--ai-chat-text-muted);
  text-align: center;
}

.ai-chat__empty-mark {
  display: inline-grid;
  width: 2.5rem;
  height: 2.5rem;
  margin-bottom: 0.25rem;
  color: var(--ai-chat-primary-contrast);
  font-size: 0.8125rem;
  font-weight: 800;
  letter-spacing: 0;
  background: var(--ai-chat-primary);
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: 0.75rem;
  place-items: center;
  box-shadow: 0 0.5rem 1.25rem rgb(59 130 246 / 22%);
}

.ai-chat__empty-title {
  margin: 0;
  color: var(--ai-chat-text);
  font-size: 0.9375rem;
  font-weight: 700;
  line-height: 1.4;
}

.ai-chat__empty-description {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.5;
}

.ai-chat__source {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  margin-top: 0.5rem;
  padding: 0.375rem 0.625rem;
  color: var(--ai-chat-primary);
  font-size: 0.8125rem;
  line-height: 1.35;
  text-decoration: none;
  background: var(--ai-chat-primary-soft);
  border: 1px solid var(--ai-chat-border);
  border-radius: 0.5rem;
}

.ai-chat__source:hover,
.ai-chat__source:focus-visible {
  background: var(--ai-chat-surface-elevated);
  border-color: var(--ai-chat-primary);
  text-decoration: underline;
}
`;
