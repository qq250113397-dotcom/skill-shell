# Skill Shell

一个中文优先的 Electron skill 管理器，用来查看和管理 `Codex`、`Claude Code`、`Hermes` 的本地 skill。

## 功能

- 自动扫描用户目录下的 `.codex`、`.claude`、`.hermes`
- 查看 skill 名称、中文简介、状态和来源
- 标记官方 skill、GitHub 作者和本地 skill
- 搜索、新建、编辑、重命名、删除 `SKILL.md`
- 中文与 English 界面切换
- macOS 支持本机离线简介翻译
- Windows 使用免费在线翻译作为简介翻译后备

## 下载

进入 GitHub 仓库的 `Actions` 页面，打开最新一次 `Build Windows`，下载 `Skill-Shell-Windows`。

## 本地开发

需要 Node.js 20 或更高版本。

```bash
npm install
npm run dev
```

## 构建

macOS：

```bash
npm run dist:mac
```

Windows：

```bash
npm run dist:win
```

## Windows 说明

- 核心 skill 管理功能可以直接使用。
- skill 数据默认读取当前 Windows 用户目录。
- 简介翻译需要联网使用免费翻译服务。
- 屏幕 OCR 翻译当前主要为 macOS 提供；Windows 版暂不内置截图和 `Tesseract`。

## 开源许可

[MIT](LICENSE)

