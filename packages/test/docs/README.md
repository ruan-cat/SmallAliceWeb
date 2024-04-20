# 你好

这是正在开发维护的项目。

在 test 分支做部署

vuepress-vite build docs。不清楚为什么 github action 仍旧可以自行部署？是谁提供的部署命令呢？

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
