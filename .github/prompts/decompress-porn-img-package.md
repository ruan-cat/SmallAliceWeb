# 解压图片压缩包

为我制作一个独立的 node 包，我将用这个名为 `@ruan-cat/decompress-porn-img-package` 包，简称为 `解压图片压缩包工具` 。

预期通过运行 `@ruan-cat/decompress-porn-img-package {path}` 命令的方式，实现读取绝对路径 path 内的文件，并按照预设的固定逻辑来处理文件。

## 术语说明

- `本项目` ： 即 `scripts\decompress-porn-img-package` 目录内的 node 项目。
- `解压图片压缩包工具` ： 即 `@ruan-cat/decompress-porn-img-package` 包。

## 核心业务处理逻辑

此处的处理逻辑是固定的，未来变更时会有少部分的修改，但是大体核心需求不会变，即按照流程解压并整理文件。

<!-- 第一步：gz解压和7z是一样的
第二步：gz解压出来是7zip的分卷包：**.7z.001和**.7z.002
PC用7zip和winrar很简单没说的，**.7z.001和**.7z.002全部选中解压即可。用IOS解压专家只需解压“.7z.001” -->

### 1 读取绝对路径地址

1. 根据我提供给你的绝对路径文件夹地址，访问并开始工作。
2. 如果我没有提供有效的绝对路径地址，那么就退出并提示我应该提供地址。
3. 主要处理的绝对路径文件夹地址，是 window 系统内的地址，比如：
   - `C:\Users\pc\Desktop\test`
   - `D:\store\baidu\048.蠢沫沫`
   - `D:\store\baidu\315.咬一口兔娘`
4. 这些文件夹地址名称会包含中文。

### 2 识别纯数值命名的压缩包文件，并解压到独立的文件夹内

找到纯数值命名的压缩包，比如 `031.gz` ，`125.zip` 这样的文件。这些文件才是你这个阶段需要处理的文件。

## 代码编写地址

在以下目录内编写 node 包。

- scripts\decompress-porn-img-package

## 技术栈要求

1. 使用 typescript 编写。
2. 使用 tsdown 完成 typescript 代码构建。
3. 单元测试使用 vitest 。
4. 配置读取使用 c12 来读取。
5. 控制台输出用 consola 来输出信息。

## 配置文件 `decompress-porn-img-package.config.ts` 应该提供的配置项

- password ： 用于解压压缩包的密码。默认解压密码为字符串 `https://www.91xiezhen.top` 。
- dirtyFiles ：要被删除的脏文件文件名数组。在处理文件时，会有很多文件。
- isPureDecompress ： 是否是纯解压压缩包模式？默认为是。
- isDeletePackages ： 是否删除已经被解压的压缩包？默认为否。
- isMoveFilesToRoot ： 是否移动文件到初次解压文件的根目录？默认为是。
- isRenameRootFolder ： 是否用最后一次解压的压缩包名称来重命名根解压文件目录名称？默认为是。

## 代码编写其他要求

1. `@ruan-cat/decompress-porn-img-package` 是私包。
2. 根包要安装私包。
3. 配置文件的命名为 `decompress-porn-img-package.config.ts` ，在使用 c12 定义并读取配置文件时，配置文件的核心命名为 `decompress-porn-img-package` 。
4. 务必提供一个干净的入口文件 `src/index.ts` 。
5. 核心业务处理逻辑，会分为好几个步骤

## 其他要求

---

<!-- TODO: 尝试使用 open spec 类似的规格控制工具，实现需求的制作、迭代、测试 -->
