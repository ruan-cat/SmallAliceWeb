# 2026-08-23 napi Canvas 原型不可变与原生类型检查：EMF 转换 shim 两处爆雷

## 1. 问题现象

- 症状一：`convertEmfToDataUrl` 对全部真实 EMF 样本返回 `null`（PoC 转换 8/8 失败），封装层抛"emf-converter 返回 null"。
- 症状二：修复症状一后，vitest 用例 `createImageBitmap 消费 Blob 返回可 drawImage 且带 close() 的对象` 失败，`ctx.drawImage(bitmap, ...)` 抛 `TypeError: Value is not one of these types: CanvasElement, SVGCanvas, Image`。
- 隐藏风险：症状二的 TypeError 会被 emf-converter 的 deferred image 分支 try/catch **静默吞掉**（只 warn 不中断），即使位图没画上，转换也"成功"——8/8 样本照常输出 PNG，但内容缺失，无任何报错信号。

## 2. 实际根因

- 根因一：`@napi-rs/canvas` 的 Canvas 实例原型链是 napi 内部类 `CanvasElement → Object`，**内部原型不可变**。`Object.setPrototypeOf(Canvas.prototype, HTMLCanvasElement.prototype)` 静默不生效（不抛错、不改变原型链），导致 `canvas instanceof HTMLCanvasElement` 恒为 false → emf-converter 的 `exportCanvasToPngDataUrl` instanceof 分派落空 → 返回 null。
- 根因二：napi 的 `ctx.drawImage` 对参数做**原生类型检查**（内部标记判定，仅接受 CanvasElement/SVGCanvas/Image）。Proxy 包装的 Image 不是原生实例 → 类型检查拒绝抛 TypeError。

## 3. 关键误导点

- design §3.1 初版方案 `Object.setPrototypeOf(Canvas.prototype, ...)` 是浏览器环境的通用做法（DOM 类可重原型），**对 napi 类假设不成立**。
- createImageBitmap 的 Proxy 方案同样源自"浏览器 polyfill 惯例"，忽略 napi 层有不同于 V8 DOM 的类型检查机制。
- 试点 8/8 成功造成了"一切正常"的假象：8 个样本未触发位图绘制路径（或触发后被静默吞错），Proxy 缺陷被掩盖——**"成功"输出不能证明位图路径正确**。

## 4. 有效修复

- 修复一：在 `HTMLCanvasElement` 空类上定义 `Symbol.hasInstance`（`value: (candidate) => candidate instanceof Canvas, configurable: true`），instanceof 分派成立。`Object.defineProperty` 不受内部原型约束。
- 修复二：createImageBitmap 不再 Proxy 包装，直接 `(img as any).close = () => {}` 给实例挂 no-op close()——实例仍是合法 napi Image，drawImage 类型检查通过；close 是实例自有属性，emf-converter 调用不炸。

## 5. 验证方式

- `pnpm exec tsx` 探针脚本：`createCanvas(4,4) instanceof HTMLCanvasElement` 修复前后 false→true；`convertEmfToDataUrl` 由 null → 正常 dataURL。
- vitest 20/20 全绿（canvas-shim.test.ts 用例 3「instanceof 分派成立」、用例 4「createImageBitmap 消费 Blob 且 close() 可调用」直接覆盖两处修复）。
- 全链路回归：本地管线 382/382、CI ubuntu 403/403、Vercel 生产站点 10/10 图片加载成功。

## 6. 后续约束

- **napi 类原型不可信**：对 @napi-rs/canvas 等 napi 类做 instanceof hack，一律先写最小探针实测（`node <file>.cjs`），禁止直接采用浏览器 DOM 惯例；instanceof 适配优先 `Symbol.hasInstance`，禁止 `setPrototypeOf`。
- **napi drawImage 参数必须是原生实例**：任何包装层（Proxy/装饰）都会破坏原生类型检查；需要附加方法（如 close）时直接挂实例属性。
- **静默吞错陷阱**：对方库的 try/catch 宽容路径会让"功能缺内容但不报错"，验证必须检查输出内容质量（像素方差/尺寸匹配），不能只看"转换成功"。
- 相关文件：`scripts/build-doc-in-vercel/emf/canvas-shim.ts`（模块头注释含完整实测修正说明）。
