# dsh-websearch-local

给 DeepSeek Harness（dsh）用的 **免 API Key** 联网搜索 / 网页抓取插件。

> **本地修改版本**：基于 [dsh-websearch-direct](https://github.com/MYCF711/dsh-websearch-direct) v0.5.0 版本修改，移除意图自动路由，增强错误处理和网络稳定性。

## 功能特性

- **零配置使用**：无需 API Key，无需走 LLM，不消耗模型 token
- **多引擎支持**：代码仓库（GitHub/GitLab/Codeberg/Gitea）、包管理（npm/crates等）、网页搜索（Bing/百度等）
- **智能路由**：直连/镜像/加速代理自动回退，结果标注实际访问入口
- **设置卡片**：dsh Web UI 内置配置界面，支持代理、自定义引擎等
- **SSRF 防护**：增强的 web_fetch 安全保护
- **错误处理**：指数退避重试，网络稳定性改进
- **模块化架构**：基于拆分后的源码模块，便于维护和扩展

## 主要修改

### 与原版 dsh-websearch-direct v0.5.0 的区别

| 功能 | 原版 | 本地修改版 |
|------|------|------------|
| 包名 | dsh-websearch-direct | dsh-websearch-local |
| 意图自动路由 | ✅ | ❌ |
| 组合搜索并发 | 未限制 | 限制为 3 |
| 错误重试 | 基础 | 指数退避 |
| SSRF 防护 | 基础 | 增强 |
| 日志脱敏 | 无 | ✅ |

### 详细修改内容

1. **移除自动路由机制**
   - 移除 seam 层的自动意图识别
   - 引擎参数完全由模型显式选择
   - 保持原生 `web_search` 工具兼容性

## 源码架构

本插件采用模块化架构，将原来的单体 `dist/index.js` 拆分为 16 个独立模块：

### 模块清单

| 模块 | 职责 |
|------|------|
| `index.js` | 公共出口：插件身份、配置入口 |
| `deps.js` | 可选依赖解析和降级处理 |
| `constants.js` | 插件常量、UA、默认配置 |
| `utils.js` | 工具函数：HTML 清洗、数值处理 |
| `net.js` | 网络层：HTTP 请求和代理处理 |
| `items.js` | 结果条目标签生成 |
| `parsers.js` | 搜索引擎 HTML 解析器 |
| `engines-meta.js` | 引擎表、分组、别名定义 |
| `config.js` | 配置 Schema 定义 |
| `route-exec.js` | 路由执行和健康度管理 |
| `registry.js` | 引擎注册表和组合搜索 |
| `pick-order.js` | 意图路由和源排序 |
| `gh-mirrors.js` | GitHub 镜像加速处理 |
| `tools-desc.js` | 工具描述和系统提示 |
| `ui-settings.js` | 设置卡片状态和持久化 |
| `plugin.js` | 插件主逻辑：提供者注册 |

### 开发工作流

直接编辑 src/ 目录下的相应模块即可。由于这是一个源码仓库，不需要构建过程。

2. **组合搜索优化**
   - 并发限制为 3 个成员
   - 按需填充机制
   - 到期自动返回已完成成员

3. **网络稳定性改进**
   - 429/503 错误指数退避重试
   - 网络瞬时错误智能重试
   - 路由失败降级机制

4. **安全增强**
   - web_fetch SSRF 防护
   - 敏感信息日志脱敏
   - 代理凭据保护

## 安装

### 方法一：直接安装插件

1. 下载本仓库并重命名为 `dsh-websearch-local`
2. 放置到 dsh profile 的 `node_modules` 目录
3. 在 profile 的 `package.json` 中添加：

```json
{
  "dependencies": {
    "dsh-websearch-local": "file:./path/to/dsh-websearch-local"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-websearch-local"]
    }
  }
}
```

4. 重启 dsh

### 方法二：源码开发模式

如果需要修改源码：

```bash
# 安装依赖
npm install

# 直接修改 src/ 目录下的源码文件即可
```

### 方法二：npm 链接（开发模式）

```bash
cd /path/to/dsh-websearch-local
npm install
npm link

cd /path/to/dsh/profile
npm link dsh-websearch-local
```

然后在 profile 的 `package.json` 中添加依赖和 bundle 配置。

## 配置

插件支持以下配置项（可通过设置卡片配置）：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `proxyUrl` | 空 | 全局代理地址 |
| `engineOrder` | `bing, baidu, duckduckgo` | 引擎轮询顺序 |
| `routePolicy` | `auto` | 路由策略（auto/direct-first/accel-first） |
| `maxResults` | 8 | 每次返回结果数 |
| `timeoutMs` | 15000 | 单请求超时 |
| `enableFetch` | true | 是否启用 web_fetch |



## 支持的引擎

### 代码仓库引擎
- `github` - GitHub（支持 API 加速）
- `gitlab` - GitLab.com
- `codeberg` - Codeberg
- `gitea` - Gitea/Forgejo
- `gitee` - Gitee（需要 Token）

### 包管理引擎
- `npm` - npm registry
- `crates` - Crates.io
- `packagist` - Packagist
- `nuget` - NuGet
- `rubygems` - RubyGems
- `huggingface` - Hugging Face

### 网页搜索引擎
- `bing` - Bing 中国
- `baidu` - 百度
- `duckduckgo` - DuckDuckGo

### 组合引擎
- `repo` - 代码仓库组合（github + gitlab + codeberg + gitea）
- `pkg` - 包管理组合（npm + crates + packagist + nuget + rubygems + huggingface）

## 使用方法

### 在 dsh 中使用

插件提供两个工具：

1. `web_search_engine` - 显式指定引擎的搜索
2. `web_fetch` - 网页内容抓取

示例：

```javascript
// 使用指定引擎搜索
await web_search_engine({ query: "dsh plugin", engine: "repo" });

// 抓取网页内容
await web_fetch({ url: "https://example.com" });
```

### 设置卡片配置

在 dsh Web UI 中：
1. 进入 设置 → 插件
2. 找到 "联网搜索（直连优先）"
3. 配置代理、自定义引擎等

## 许可证

本项目基于 [GPL-3.0](LICENSE) 许可证。

### 版权信息

- **原版作者**：MYCF711
  - 项目：[dsh-websearch-direct](https://github.com/MYCF711/dsh-websearch-direct)
  - 许可证：GPL-3.0

- **本地修改版本**：基于 GPL-3.0 许可证分发
  - 必须包含原始许可证和版权声明
  - 修改部分同样受 GPL-3.0 保护

## 兼容性

- dsh 版本要求：≥ 4.0.1
- 兼容 cordis 插件系统
- 保持与原版 API 完全兼容

## 更新日志

### v0.5.0 (本地版)
- ✅ 移除意图自动路由机制
- ✅ 组合搜索并发限制为 3
- ✅ 指数退避重试机制
- ✅ SSRF 防护增强
- ✅ 日志和敏感信息脱敏
- ✅ 重命名为 dsh-websearch-local

### v0.4.11 (原版)
- 设置卡片界面
- 多引擎支持
- 智能路由系统

---

> **提示**：如遇问题请检查：
> 1. 网络连接状态
> 2. 代理配置
> 3. 引擎可用性
> 4. dsh 版本兼容性