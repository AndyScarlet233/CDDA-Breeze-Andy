# CDDA-Breeze 微风指南

微风指南是 CDDA-Breeze 的只读游戏数据检索站。它沿用《大灾变指南》的 Svelte/Vite 页面结构，在构建时从游戏仓库读取本体 JSON、简体中文翻译和维护者批准的模组，然后发布为可离线使用的 GitHub Pages 渐进式网页应用。

## 构建结构

本体数据来自仓库根目录的 `data/json`，简体中文翻译来自 `lang/po/zh_CN.po`。内置模组来自 `data/mods`，外部模组压缩包由维护者放入 `breeze_guide/模组上传`，并通过 `模组发布清单.json` 决定是否公开。

运行以下命令可在本地生成数据并启动网页：

```text
yarn install --frozen-lockfile
yarn guide:data
yarn dev
```

生产构建：

```text
yarn validate
yarn build:pages
```

生成的数据位于 `public/data`，不会提交进 Git。GitHub Actions 会在 `test/next-release` 分支更新相关文件后重新生成数据，并把 `dist` 发布到 GitHub Pages。

## 模组接口

网页没有玩家上传入口。玩家只能选择维护者已经发布的模组数据包，并在本地保存自己的检索组合。

标准模组不需要修改原有 `modinfo.json`。生成器会读取其中的 `id`、名称、作者、维护者、说明、版本、分类和依赖，并把模组 JSON 独立生成为一个数据包。玩家启用某个模组时，网页会自动加入索引中存在的依赖模组。

内置模组会进入可选索引，但默认不参与检索，玩家需要在页面底部按需启用。只包含机制开关、白名单或贴图配置等无可检索实体的模组会自动略过。可以在 `模组发布清单.json` 中排除内置模组、改变默认启用项，或把某些模组设为必需。

开发者上传外部模组时，只需：

1. 把 ZIP 放进 `模组上传`。
2. 在 `模组发布清单.json` 的“上传模组”数组中加入文件名，并将“发布”设为 true。
3. 推送功能分支，检查数据生成与网页构建。
4. 合并到 `test/next-release` 后由 GitHub Pages 自动发布。

一个压缩包包含多个 `MOD_INFO` 时，默认会全部发布，也可以用“模组标识”只选择其中一个。上传模组与内置模组 id 重复时默认拒绝覆盖，只有显式设置“替换同名内置模组”为 true 才会替换索引来源。

## 安全边界

构建脚本只解析 JSON 和 PO 数据，不运行模组内的可执行文件或脚本。ZIP 在展开前会检查绝对路径和 `..` 越界路径。只有仓库维护者写入清单并提交后，模组才会出现在玩家端。

## 来源与许可

网页代码基于 [nornagon/cdda-guide](https://github.com/nornagon/cdda-guide) 与 [CrimsonCrossBunker/CCB-GUIDE](https://github.com/CrimsonCrossBunker/CCB-GUIDE) 的公开实现继续适配，并保留 GPL-3.0-only 许可。游戏与模组数据仍分别遵循其原有许可和署名要求。
