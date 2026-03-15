---
name: iatlas-browser
description: 强大的信息获取工具。通过浏览器 + 用户登录态，获取公域和私域信息。可访问任意网页、内部系统、登录后页面，执行表单填写、信息提取、页面操作。
allowed-tools: Bash(iatlas-browser:*)
---

# iatlas-browser - 信息获取与浏览器自动化

## 核心价值

**iatlas-browser 是一个强大的信息获取工具。**

通过浏览器 + 用户登录态，可以获取：
- **公域信息**：任意公开网页、搜索结果、新闻资讯
- **私域信息**：内部系统、企业应用、登录后页面、个人账户数据

在此基础上，还可以代替用户执行浏览器操作：
- 表单填写、按钮点击
- 数据提取、截图保存
- 批量操作、重复任务

**为什么能做到？**
- 运行在用户真实浏览器中，复用已登录的账号
- 不触发反爬检测，访问受保护的页面
- 无需提供密码或 Cookie，直接使用现有登录态

## 快速开始

```bash
iatlas-browser open <url>        # 打开页面（新 tab）
iatlas-browser snapshot -i       # 获取可交互元素
iatlas-browser click @5          # 点击元素
iatlas-browser fill @3 "text"    # 填写输入框
iatlas-browser close             # 完成后关闭 tab
```

## Tab 管理规范

**重要：操作完成后必须关闭自己打开的 tab**

```bash
# 单 tab 场景
iatlas-browser open https://example.com    # 打开新 tab
iatlas-browser snapshot -i
iatlas-browser click @5
iatlas-browser close                        # 完成后关闭

# 多 tab 场景
iatlas-browser open https://site-a.com     # tabId: 123
iatlas-browser open https://site-b.com     # tabId: 456
# ... 操作 ...
iatlas-browser tab close                    # 关闭当前 tab
iatlas-browser tab close                    # 关闭剩余 tab

# 指定 tab 操作
iatlas-browser open https://example.com --tab current  # 在当前 tab 打开（不新建）
iatlas-browser open https://example.com --tab 123      # 在指定 tabId 打开
```

## 核心工作流

1. `open` 打开页面
2. `snapshot -i` 查看可操作元素（返回 @ref）
3. 用 `@ref` 执行操作（click, fill, etc.）
4. 页面变化后重新 `snapshot -i`
5. 任务完成后 `close` 关闭 tab

## 命令速查

### 导航

```bash
iatlas-browser open <url>           # 打开 URL（新 tab）
iatlas-browser open <url> --tab current  # 在当前 tab 打开
iatlas-browser back                 # 后退
iatlas-browser forward              # 前进
iatlas-browser refresh              # 刷新
iatlas-browser close                # 关闭当前 tab
```

### 快照

```bash
iatlas-browser snapshot             # 完整页面结构
iatlas-browser snapshot -i          # 只显示可交互元素（推荐）
iatlas-browser snapshot --json      # JSON 格式输出
```

### 元素交互

```bash
iatlas-browser click @5             # 点击
iatlas-browser hover @5             # 悬停
iatlas-browser fill @3 "text"       # 清空并填写
iatlas-browser type @3 "text"       # 追加输入（不清空）
iatlas-browser check @7             # 勾选复选框
iatlas-browser uncheck @7           # 取消勾选
iatlas-browser select @4 "option"   # 下拉选择
iatlas-browser press Enter          # 按键
iatlas-browser press Control+a      # 组合键
iatlas-browser scroll down          # 向下滚动
iatlas-browser scroll up 500        # 向上滚动 500px
```

### 获取信息

```bash
iatlas-browser get text @5          # 获取元素文本
iatlas-browser get url              # 获取当前 URL
iatlas-browser get title            # 获取页面标题
```

### Tab 管理

```bash
iatlas-browser tab                  # 列出所有 tab
iatlas-browser tab new [url]        # 新建 tab
iatlas-browser tab 2                # 切换到第 2 个 tab
iatlas-browser tab close            # 关闭当前 tab
iatlas-browser tab close 3          # 关闭第 3 个 tab
```

### 截图

```bash
iatlas-browser screenshot           # 截图（自动保存）
iatlas-browser screenshot path.png  # 截图到指定路径
```

### 等待

```bash
iatlas-browser wait 2000            # 等待 2 秒
iatlas-browser wait @5              # 等待元素出现
```

### JavaScript

```bash
iatlas-browser eval "document.title"              # 执行 JS
iatlas-browser eval "window.scrollTo(0, 1000)"    # 滚动到指定位置
```

### Frame 切换

```bash
iatlas-browser frame "#iframe-id"   # 切换到 iframe
iatlas-browser frame main           # 返回主 frame
```

### 对话框处理

```bash
iatlas-browser dialog accept        # 确认对话框
iatlas-browser dialog dismiss       # 取消对话框
iatlas-browser dialog accept "text" # 确认并输入（prompt）
```

### 调试

```bash
iatlas-browser network requests     # 查看网络请求
iatlas-browser console              # 查看控制台消息
iatlas-browser errors               # 查看 JS 错误
iatlas-browser trace start          # 开始录制用户操作
iatlas-browser trace stop           # 停止录制
```

## Ref 使用说明

snapshot 返回的 `@ref` 是元素的临时标识：

```
@1 [button] "提交"
@2 [input type="text"] placeholder="请输入姓名"
@3 [a] "查看详情"
```

**注意**：
- 页面导航后 ref 失效，需重新 snapshot
- 动态内容加载后需重新 snapshot
- ref 格式：`@1`, `@2`, `@3`...

## 并发操作

```bash
# 并发打开多个页面（各自独立 tab）
iatlas-browser open https://site-a.com &
iatlas-browser open https://site-b.com &
iatlas-browser open https://site-c.com &
wait

# 每个返回独立的 tabId，互不干扰
```

## JSON 输出

添加 `--json` 获取结构化输出：

```bash
iatlas-browser snapshot -i --json
iatlas-browser get text @5 --json
iatlas-browser open https://example.com --json
```

## 信息提取 vs 页面操作

**根据目的选择不同的方法：**

### 提取页面内容（用 eval）

当需要提取文章、正文等长文本时，用 `eval` 直接获取：

```bash
# 微信公众号文章
iatlas-browser eval "document.querySelector('#js_content').innerText"

# 知乎回答
iatlas-browser eval "document.querySelector('.RichContent-inner').innerText"

# 通用：获取页面主体文本
iatlas-browser eval "document.body.innerText.substring(0, 5000)"

# 获取所有链接
iatlas-browser eval "[...document.querySelectorAll('a')].map(a => a.href).join('\n')"
```

**为什么不用 snapshot？** 
有些网站（如微信公众号）DOM 结构嵌套很深，snapshot 输出会非常冗长。`eval` 直接提取文本更高效。

### 操作页面元素（用 snapshot -i）

当需要点击、填写、选择时，用 `snapshot -i` 获取可交互元素：

```bash
iatlas-browser snapshot -i
# @1 [button] "登录"
# @2 [input] placeholder="用户名"
# @3 [input type="password"]

iatlas-browser fill @2 "username"
iatlas-browser fill @3 "password"  
iatlas-browser click @1
```

**`-i` 很重要**：只显示可交互元素，过滤掉大量无关内容。

## 常见任务示例

### 表单填写

```bash
iatlas-browser open https://example.com/form
iatlas-browser snapshot -i
# @1 [input] placeholder="姓名"
# @2 [input] placeholder="邮箱"
# @3 [button] "提交"

iatlas-browser fill @1 "张三"
iatlas-browser fill @2 "zhangsan@example.com"
iatlas-browser click @3
iatlas-browser wait 2000
iatlas-browser close
```

### 信息提取

```bash
iatlas-browser open https://example.com/dashboard
iatlas-browser snapshot -i
iatlas-browser get text @5              # 获取特定元素文本
iatlas-browser screenshot report.png    # 截图保存
iatlas-browser close
```

### 批量操作

```bash
# 打开多个页面提取信息
for url in "url1" "url2" "url3"; do
  iatlas-browser open "$url"
  iatlas-browser snapshot -i --json
  iatlas-browser close
done
```

## 深入文档

| 文档 | 说明 |
|------|------|
| [references/snapshot-refs.md](references/snapshot-refs.md) | Ref 生命周期、最佳实践、常见问题 |
