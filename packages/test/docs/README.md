# 你好

这是正在开发维护的项目。

## 1

在 test 分支做部署

## 2

vuepress-vite build docs。不清楚为什么 github action 仍旧可以自行部署？是谁提供的部署命令呢？

## 4

在 vercel 项目配置内，手动移除了 "buildCommand": "vuepress build docs",

看看 github action 是否会自动部署？

## 5

在 vercel 项目配置内移除了 buildCommand 命令，设置为空后，github action 的部署会继续，但是运行到一个空命令时，就产生了 404。可以说明，github action 的部署会从 vercel 仪表盘内获取配置。部署命令从云端获取的。

## ？

```json
{
	"buildCommand": "vuepress build docs",
	"installCommand": "pnpm install",
	"outputDirectory": "docs/.vuepress/dist",
	"devCommand": "vuepress dev docs --clean-cache",
	"rewrites": [
		{
			"source": "/",
			"destination": "https://small-alice-web.ruan-cat.com/"
		},
		{
			"source": "/qq-group/",
			"destination": "https://drill-qq-group-rules.ruan-cat.com/"
		}
	]
}
```
