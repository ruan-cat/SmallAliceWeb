# 你好

这是正在开发维护的项目。

触发提交。看看移动到个人域之后，是否还能触发正常的 vercel 部署？

看看 small-alice-web-dev.ruancat6312.top 的 github action 是否正常工作？已经把 ruancat6312.top 域名移动到用户名下面了。

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
