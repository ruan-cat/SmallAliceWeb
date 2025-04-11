# 基于 docx 的文档构建

为我编写一个 ts 脚本，该 ts 脚本将完成以下一系列的文件获取，以及文件格式转换任务。

这一系列任务包括以下几个大阶段。

1. 文件获取阶段。
2. 格式转换阶段。
3. 脏数据处理阶段。

我的最终目的是希望实现获取制定仓库内的文件，做出格式转换，生成出一系列的 md 文件。最终让这些 md 文件被 vitepress 项目打包成文档项目。

## 文件获取阶段

- 1.  用 `git clone --depth=1 https://github.com/ruan-cat/drill-docx` 命令，实现克隆项目
- 2.  克隆到根目录下的 `drill-docx` 目录内
- 3.  用 generateSpawn 函数包装运行命令

## 格式转换阶段

在格式转换阶段内，要转换两种格式的文件。分别是 txt 和 docx（或 doc）文件。

1. **函数拆分**：处理两种不同的文件时，你应该拆分成两个独立的函数，不要都写在一个函数内。
2. **最终格式要求**：我们转换的过程和处理细节各有不同，但最终目的是为了生成 `*.md` 格式的文件，即 markdown 格式的文档。
3. **文件存储位置**：md 文件的最终存储位置为 `docs\docx` 。如果该文件夹不存在，请你先新建此文件夹。
4. **保留原来的文件夹层级结构**：在你做文件转换时，最后生成出来的 md 文件仍旧保留原来的文件夹层级关系。

### 处理 `*.txt` 格式的文件

转换 txt 文本文件时，请注意以下要求：

1. txt 文件都默认不包含有意义的标题。请根据 txt 的文件名，写入 md 的一级标题。
2. txt 文本文件的文本段，中间缺乏换行符。请在转化的时候添加换行符。以便确保最终的阅读效果。

### 处理 `*.{doc,docx}` 格式的文件

处理的算法包含两个核心的步骤：

1. 先转换成 html 格式
2. 再转换成 md 格式

其他的实现要求如下：

#### 从 docx 转换成 html 格式

1. 使用 mammoth 来完成格式转换。
   请使用 mammoth 实现关键的 docx 格式转换，转换成 html 格式，并生成图片。

   ```ts
   import { convertToHtml, images } from "mammoth";
   ```

2. 图片转换细节
   要求使用 `sharp` 来完成图片转换和生成。

   ```ts
   import sharp from "sharp";
   ```

3. 图片名称带有**被引用的文件名称**和**序号**
   在转换过程中生成的图片，要增加被引用的文件名称，和序号。比如文档 `Mydoc.md` 使用了一些图片，那么这些图片的名称应该是：`Mydoc-001.jpg`、`Mydoc-002.png`

4. 不处理特定格式的图片
   不要处理以下格式的图片，如果在转换过程中遇到以下格式的图片，就不予处理，并提供一个默认的错误占位图片即可。

   - `x-emf`
   - `gif`

5. 默认的错误占位图片
   仅使用以下的错误占位图片，请直接使用以下代码段：

   ```ts
   /**
    * 错误图片占位符
    * @description
    * 一个图片地址 用于替换错误的图片地址
    */
   const errorImgUrl = "https://drill-up-pic.oss-cn-beijing.aliyuncs.com/drill_web_pic/2025-02-12-18-13-41.png";
   ```

6. 生成相对路径的图片
   在转换时，全部的图片必须是相对路径的，不接受绝对路径的图片。

7. 不处理特定名称开头的脏数据文件

   - `~$*.doc`
   - `~$*.docx`

   如果有文档文件的前缀开头为 `~$` ，请不要处理该文件。这是临时缓存文件，请直接删除该文件。不要处理。

8. 图片文件夹名称与图片存储规则

   1. 被转化的每一个文件，都应该有自己独立图片文件夹。
      比如文档 `Mydoc.docx` 使用了一些图片，那么经过转换后，这些文件的存储路径应该是：

      - `Mydoc.html`
      - `images/Mydoc/Mydoc-001.jpg`
      - `images/Mydoc/Mydoc-002.png`

   2. 每一个被转换的文件，在 `images` 文件夹内都要有属于自己的文件夹。
   3. 如果不存在文件夹。请新增文件夹。
   4. 如果已经存在有对应的文件图片文件夹，请先删除，再新建。
   5. 图片文件夹名称仅为 `images` 。预期应该都存放在 `docs\docx` 目录内。

9. 文件存储位置
   你生成的 html 文件和包含有图片的 `images` 文件夹，都应该在 `docs\docx` 目录内。

最后，请你参考模仿以下代码，完成关键的格式转换。

```ts
const docx2html: FileChange = async function (params) {
	const { filePath } = params;
	if (filePath.endsWith(".docx")) {
		try {
			const fileBuffer = fs.readFileSync(filePath);
			const imagesDir = join(dirname(filePath), "images");
			if (existsSync(imagesDir)) {
				rmSync(imagesDir, { recursive: true, force: true });
			}
			mkdir(imagesDir, { recursive: true }, (err) => {
				if (err) throw err;
			});
			const result = await convertToHtml(
				{ buffer: fileBuffer },
				{
					convertImage: images.imgElement(async function (image) {
						const imageBuffer = await image.readAsBase64String();
						/**
						 * 图片格式
						 * @description
						 * 其返回格式类似于 image/x-emf ，所以这里要做数组切割 取第二个元素
						 */
						const imageType = image.contentType.split("/")[1];
						const imageName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${imageType}`;
						const imagePath = join(imagesDir, imageName);
						// jpeg 格式没有错
						// 如果是 x-emf 格式的图片 即矢量图
						// 暂时跳过gif的处理
						if (imageType === "x-emf" || imageType === "gif") {
							return {
								src: errorImgUrl,
							};
						}
						imageTypesSet.add(imageType);
						// Use sharp to compress the image
						await sharp(Buffer.from(imageBuffer, "base64"))
							.toFormat(imageType as keyof FormatEnum)
							.toFile(imagePath)
							.catch((error) => {
								consola.error(`Failed to process image: ${error.message}`);
								consola.error(` 错误的文件格式为： ${imageType} `);
								params.errorFilesPath.push(`${filePath}   ${imageType} `);
							});
						return {
							src: `./images/${imageName}`,
						};
					}),
				},
			);
			const htmlFilePath = filePath.replace(/\.docx$/, ".html");
			fs.writeFileSync(htmlFilePath, result.value);
			htmlFilesPath.push(htmlFilePath);
		} catch (error) {
			consola.error(`Failed to convert ${filePath}: ${error.message}`);
			// 写入数组的过程不使用解构赋值 因为需要直接修改原数组
			params.errorFilesPath.push(filePath);
		}
	}
};
```

#### 从 html 转换成 md 格式

1. 使用指定的方式实现格式转换

从 `docs\docx` 目录内读取 html 文件，并转换为 md 文件。

```ts
import htmlToMd from "html-to-md";
```

2. 移除掉中间过渡的 html 文件

html 文件毕竟是中间过渡产物，在完成 md 的格式转换与文件生成后，请删除掉 `docs\docx` 目录内全部的 html 文件。

## 脏数据处理阶段

在该阶段，将处理 md 文件内不合适的数据。

1. 设计成插件式的配置
   此阶段未来会增加较多的修改需求，请设计成配置插件式的写法。比如增加某个处理需求时，就增加一个函数。

2. 处理`.anchor`锚点脏数据
   锚点式脏数据的举例如下：

   ```txt
   []{#软件性能
   .anchor}
   ```

   ```txt
   []{#响应时间-1 .anchor}
   ```

   请匹配满足 `[]{#someText\n.anchor}` 和 `[]{#someText .anchor}` 格式的文本，并将其删除。

3. 处理宽高配置脏数据
   宽高配置脏数据举例如下：

   ```txt
   {width="5.768055555555556in"
   height="0.7458333333333333in"}
   ```

   ```txt
   {width="1.333167104111986in"           18\~20                  卡成翔
   																													height="0.635336832895888in"}
   ```

   请匹配满足上述格式的文本，并将其删除。

4. 处理`<XXX>`非闭合脏数据

   在文档内，会有很多类似于这样的写法：

   ```txt
   <WordWrap>
   <br>
   <单选:21:A:B>
   <复制:2:文字>
   <复制:\\v\[21\]:文字>
   <小爱丽丝>
   ```

   这些写法在 vitepress 解析时，会被认定为非闭合标签，产生错误。请你匹配满足上述格式的文本，并替换成代码块，类似于以下的写法：

   ```txt
   `<WordWrap>`
   `<br>`
   `<单选:21:A:B>`
   `<复制:2:文字>`
   `<复制:\\v\[21\]:文字>`
   `<小爱丽丝>`
   ```

   请注意，对于已经增加有``代码块标记的文本，不要做额外处理，避免出现重复修改的错误。

   有部分标签不需要你处理，比如：

   ```txt
   <ol>
   <li>
   ```

   这些标签已经属于闭合标签了，不需要你额外处理。

5. 文件格式化
   请使用 prettier 对 md 文件做一次全量的格式化。

## 可以配置上述任务阶段

请设计一个简易的配置对象，上述任务阶段可以根据该配置对象做处理。

设计变量 `iSskip` ，如果该任务阶段被跳过了，那么就不执行相关的任务。该值默认为 false，不跳过任务。

## 收集处理错误的文件名

在上述的处理中，难免会出现各种意想不到的错误，请在每个步骤处理完时，及时输出包含路径的错误文件名称。

包含的路径只从本项目的根目录路径开始。

## 其他要求

在你编写脚本时，也需要遵守以下的要求

### 脚本位置

`scripts/build-doc-in-vercel/index.ts`

如果没有文件，就在此路径内新建文件。

### 执行前先清空 `docs\docx` 目录

在执行一系列任务前，先检查该目录是否存在？如果不存在，请新建文件夹。如果存在，就删除掉全部内容，然后再新建文件夹。

### 部分文件夹下的文件不做处理

在 BuildConfig 配置内，提供一个字符串数组，用于忽略特定文件夹。当某些文件处于在这些文件夹内时，就不做任何处理。不做任何的文件转换。

请提供这样的忽略配置文件。

### 部分文件不做处理

有部分 docx 文件不需要做任何处理，请在 BuildConfig 配置内提供一个字符串数组，用于忽略特定文件。

### 模块化拆分功能

请不要把全部的功能都写在一个文件内，请你在 `scripts/build-doc-in-vercel` 文件夹内洽当地新增 ts 文件，以便做出良好的拆分。

### 匹配文件的方式必须用 glob

不要使用递归查询文件夹的方式来匹配文件，请使用 glob 库完成文件的查找。

```ts
import { sync } from "glob";
```

### 必须要有的工具函数

有部分工具函数必须使用，这里我直接提供给你，请整合并使用我提供给你的函数。

```ts
/**
 * 生成简单的执行命令函数
 * @description
 * 封装 spawnSync 函数
 */
function generateSpawn(execaSimpleParams: { command: string; parameters: string[] }) {
	const { command, parameters } = execaSimpleParams;
	const coloredCommand = gradient(["rgb(0, 153, 247)", "rgb(241, 23, 18)"])(`${command} ${parameters.join(" ")}`);
	consola.info(` 当前运行的命令为： ${coloredCommand} \n`);
	return generateSimpleAsyncTask(() => {
		const result = spawnSync(command, parameters, {
			stdio: "inherit",
			shell: true,
		});
		if (result.error) {
			throw result.error;
		}
		return result;
	});
}
```
