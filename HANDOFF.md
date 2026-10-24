# dsh-websearch-local 交接文档

> 基于 dsh-websearch-direct v0.5.0 的本地修改版本
> 最后更新：2026-10-24，版本 **v0.5.0**

---

## 1. 项目概述

dsh-websearch-local 是基于 [dsh-websearch-direct](https://github.com/MYCF711/dsh-websearch-direct) v0.5.0 的本地修改版本，为 DeepSeek Harness（dsh）提供免 API Key 的联网搜索和网页抓取功能。

### 主要特性

- **零配置使用**：无需 API Key，无需走 LLM，不消耗模型 token
- **多引擎支持**：代码仓库、包管理、网页搜索等多种引擎
- **智能路由**：直连/镜像/加速代理自动回退
- **设置卡片**：dsh Web UI 内置配置界面
- **SSRF 防护**：增强的 web_fetch 安全保护

---

## 2. 与原版的主要区别

### 核心修改

| 功能 | 原版 dsh-websearch-direct v0.5.0 | 本地修改版 dsh-websearch-local |
|------|----------------------------------|--------------------------------|
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

---

## 3. 项目结构

```
dsh-websearch-local/
├── package.json           # 包信息，已更新名称和版本
├── README.md              # 项目文档
├── LICENSE                # GPL-3.0 许可证
├── cordis.patch.yml       # 配置文件，已更新包名
├── .gitignore             # 排除规则（dist/ 已排除）
├── client/                # 客户端代码
│   └── client.js         # 浏览器半边设置卡片
├── dist/                  # 构建产物（已从 git 排除）
└── dist-backup/          # 原版备份
```

### 核心文件说明

- **package.json**：包信息，更新了名称、版本和描述
- **cordis.patch.yml**：bundle 配置，更新了包名引用
- **client/client.js**：浏览器半边 UI，更新了版权标识
- **dist/index.js**：宿主半边逻辑，更新了包名和版权信息（已从 git 排除）

---

## 4. 安装与配置

### 安装方法

1. **直接安装**：
   ```bash
   # 将本仓库放置到 dsh profile 的 node_modules 目录
   # 在 profile package.json 中添加：
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

2. **npm 链接**（开发模式）：
   ```bash
   cd dsh-websearch-local
   npm install
   npm link
   
   cd /path/to/dsh/profile
   npm link dsh-websearch-local
   ```

### 配置选项

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `proxyUrl` | 空 | 全局代理地址 |
| `engineOrder` | `bing, baidu, duckduckgo` | 引擎轮询顺序 |
| `routePolicy` | `auto` | 路由策略 |
| `maxResults` | 8 | 每次返回结果数 |
| `timeoutMs` | 15000 | 单请求超时 |
| `enableFetch` | true | 是否启用 web_fetch |

---

## 5. 支持的引擎

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
- `repo` - 代码仓库组合
- `pkg` - 包管理组合

---

## 6. 使用方法

### 工具使用

```javascript
// 显式引擎搜索
await web_search_engine({ query: "dsh plugin", engine: "repo" });

// 网页内容抓取
await web_fetch({ url: "https://example.com" });
```

### 设置卡片配置

在 dsh Web UI：
1. 进入 设置 → 插件
2. 找到 "联网搜索（直连优先）"
3. 配置代理、自定义引擎等

---

## 7. 许可证与版权

### 版权信息

- **原版作者**：MYCF711
  - 项目：[dsh-websearch-direct](https://github.com/MYCF711/dsh-websearch-direct)
  - 许可证：GPL-3.0

- **本地修改版本**：基于 GPL-3.0 许可证分发
  - 必须包含原始许可证和版权声明
  - 修改部分同样受 GPL-3.0 保护

### 文件版权声明

所有源码文件都包含以下版权声明：
```
/*
 * This file is part of dsh-websearch-local
 * 
 * Copyright (C) 2026 MYCF711 (original author)
 * Copyright (C) 2026 Local modifications
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is derived from dsh-websearch-direct v0.5.0
 * https://github.com/MYCF711/dsh-websearch-direct
 * 
 * See LICENSE file for more details.
 */
```

---

## 8. 兼容性

- **dsh 版本要求**：≥ 4.0.1
- **兼容 cordis 插件系统**
- **保持与原版 API 完全兼容**
- **配置文件格式完全兼容**

---

## 9. 构建与部署

### 构建

```bash
# 由于 dist/ 已从 git 排除，需要单独构建
# 建议在源码仓库中构建并手动部署
npm install
npm run build  # 如果有构建脚本
```

### 部署注意

- dist/ 目录是构建产物，不应提交到 git
- 开发时建议使用 npm 链接模式
- 生产环境使用打包的 tgz 文件

---

## 10. 已知问题与限制

### 原版已知问题继承

以下问题来自原版 dsh-websearch-direct，在本版本中未解决：

1. **F1 设计债**：自定义引擎 ID 解析的隐式约定（详见原版 HANDOFF.md）
2. **F3 限制**：内置源 routeExtras 状态错位问题（详见原版 HANDOFF.md）

### 新增限制

- 组合搜索并发限制为 3（原版无限制）

---

## 11. 维护说明

### 更新流程

1. 从原版 dsh-websearch-direct 获取最新代码
2. 应用本地的修改和改进
3. 更新版本号和文档
4. 重新构建和测试

### 贡献指南

- 保持与原版的 API 兼容性
- 遵循 GPL-3.0 许可证要求
- 包含适当的版权声明
- 更新相关文档

---

## 12. 参考文档

- **原版项目**：[dsh-websearch-direct](https://github.com/MYCF711/dsh-websearch-direct)
- **原版交接文档**：包含详细的技术说明和已知问题
- **GPL-3.0 许可证**：LICENSE 文件

---

> **注意**：本版本基于原版 dsh-websearch-direct v0.5.0 进行本地修改，主要改进包括移除自动路由、增强错误处理和安全性。维护时请同时参考原版的更新和改进。