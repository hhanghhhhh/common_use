# 从成功实验提炼可复用 Skill

本文件供 Agent 在用户要求总结刚刚打通的流程、更新现有 Skill 或创建新 Skill 时执行。

不要因为一次实验成功就默认创建 Skill。先重建事实、检查已有能力，再选择正确的沉淀位置。

## 1. 判断沉淀位置

| 内容 | 归属 |
|---|---|
| 本次操作、失败尝试、日志索引和实测结果 | 项目普通 `.md` |
| 工程路径、地址、变量、板卡和版本 | 项目普通 `.md` |
| 所有任务必须遵守的仓库规则 | `AGENTS.md` |
| 已有能力的新版本、案例或变体 | 更新现有 Skill 或 `references/` |
| 可重复、边界清楚、包含非显然步骤或判据的流程 | 新 Skill |
| 稳定、重复且容易手工出错的操作 | Skill 的 `scripts/` |
| 输出时需要复用的模板或工程骨架 | Skill 的 `assets/` |

创建新 Skill 前确认：

1. 该任务以后会重复出现。
2. 现有 Skill 无法完整覆盖。
3. 流程包含 Agent 不易自行推导的顺序、参数、验收门槛或故障定位方法。
4. 能明确描述应触发和不应触发的场景。

条件不足时只形成项目 `.md`，不要制造重复 Skill。

## 2. 提炼流程

### 2.1 重建事实

优先从原始证据取证，不依赖对话摘要或模糊记忆：

- 当前对话和终端输出；
- `git diff` 与最终源码；
- 实际使用的脚本和配置；
- 构建、下载、测试、覆盖率和硬件日志；
- 生成物的时间戳或哈希；
- 用户明确确认的通过结果。

记录目标、成功判据、有效命令、工具版本、执行顺序、失败原文、根因、修复、权限要求和最终设备状态。区分“已观察事实”“合理推断”和“尚未验证”。

### 2.2 查重并确定边界

扫描现有 Skill 的 `name` 和 `description`，再读取最接近的 `SKILL.md`。按以下优先级处理：

1. 更新现有 reference；
2. 扩展现有 Skill 主流程；
3. 创建有独立价值的上层编排 Skill；
4. 创建全新的独立 Skill。

仅同时使用了多个 Skill，不足以创建编排 Skill。只有跨工具顺序、联合判据或故障归因本身可重复时，编排层才有价值。

### 2.3 分离信息层级

- 通用步骤、安全边界和验收流程放 `SKILL.md`。
- 工具细节、协议说明、版本差异和故障案例放 `references/`。
- 当前工程的地址、符号、配置和实测值留在项目文档。
- 必须提供本机默认入口时，单独放 `references/local-defaults.md`，并要求每次重新确认。
- 不把某次 WNS、覆盖率、变量值或硬件 PASS 写成通用保证。

### 2.4 设计结构

只创建实际需要的目录：

```text
skill-name/
├── SKILL.md
├── agents/
│   └── openai.yaml
├── references/        # 按需
├── scripts/           # 按需
└── assets/            # 按需
```

遵守以下规则：

- 名称只使用小写字母、数字和连字符，目录名与 `name` 一致。
- frontmatter 只包含 `name` 和 `description`。
- `description` 同时写明能力、触发场景和排除场景。
- `SKILL.md` 使用命令式表达，只保留核心工作流。
- reference 保持一层，并从 `SKILL.md` 说明何时读取。
- 同一内容不要同时出现在主体和 reference。
- 不创建 README、安装指南、快速参考或变更日志。

### 2.5 初始化和实现

新 Skill 必须通过官方 `skill-creator` 初始化：

```text
init_skill.py <skill-name> --path <directory> --resources <needed-resources>
```

生成与内容一致的 `agents/openai.yaml`。只有稳定且反复使用的操作才编写脚本，并实际运行测试；不要为单次 workaround 过早脚本化。

### 2.6 校验

执行：

```text
quick_validate.py <skill-directory>
```

同时检查：

- 无 `TODO` 或模板占位符；
- 所有 reference 链接存在；
- `agents/openai.yaml` 与 Skill 匹配；
- `default_prompt` 包含 `$skill-name`；
- 无意外硬编码的工程目录、IP、设备序号或密钥；
- `git diff --check` 无格式错误；
- 新增脚本已验证成功与失败退出码；
- 未把原工程或用户文件误复制进 Skill。

### 2.7 真实任务迭代

一次成功只能形成候选工作流。再次用于不同任务时检查：

- 是否正确触发，是否加载无关内容；
- 是否错误沿用旧工程参数；
- 是否遗漏关键通过门槛；
- 失败时能否定位到正确层级；
- 是否仍需重复补充相同信息。

根据真实结果更新 Skill。复杂 Skill 可在不影响真实设备或生产系统的前提下做独立 forward test。

## 3. `common_use` 仓库约定

```text
Skill 源码：D:\05-work\demo_code\0_git\common_use\skills
Codex 发现目录：C:\Users\m\.codex\skills
```

当前安装方式：

- `C:\Users\m\.codex\skills` 本身是普通目录。
- `.system` 是 Codex 自带 Skill 目录，不要改成链接或写入自定义 Skill。
- 每个自定义 Skill 目录分别是 Junction，目标指向源码仓库中的同名目录。
- 通过 Junction 访问或修改文件等同于直接修改源码；不存在需要同步的第二份运行副本。

示例：

```text
C:\Users\m\.codex\skills\ccs-c2000-debug
  -> D:\05-work\demo_code\0_git\common_use\skills\ccs-c2000-debug
```

确认两端状态后，新增链接使用：

```powershell
New-Item -ItemType Junction `
  -Path 'C:\Users\m\.codex\skills\<skill-name>' `
  -Target 'D:\05-work\demo_code\0_git\common_use\skills\<skill-name>'
```

约定：

1. 始终把 `common_use\skills` 作为版本化真源，并优先使用源码路径编辑。
2. 新 Skill 校验完成后，为其单独创建 Junction；不要复制整个 Skill 到发现目录。
3. 创建前确认源码目录存在、发现目录中的同名路径不存在；已有路径或链接不得擅自覆盖。
4. 创建后用 `Get-Item` 检查 `LinkType=Junction` 和完整 `Target`，再从发现目录确认 `SKILL.md` 可读。
5. 受限环境中先生成 staging 副本，再精确复制到源码目录；Junction 会立即反映源码变化。
6. 所有文本使用 UTF-8。
7. 不长期保留 `skills/temp`；迁移后将实验记录移回项目文档或删除已确认的重复副本。
8. Git 只暂存目标 Skill 的明确路径。
9. 提交前检查 `git status`、`git diff --cached --stat` 和 `git diff --cached --check`。
10. 只有用户明确要求时才创建 Junction、提交或推送。

## 4. 交付门槛

- 能用一句话说明 Skill 解决的重复问题。
- 触发与排除场景明确，且不与已有 Skill 大面积重叠。
- 换工程后不会静默沿用旧地址、变量或路径。
- 每个 PASS 都有可检查证据，失败时有下一层排查方向。
- 主体简洁，细节按需加载。
- 官方结构校验、链接检查、脚本测试和 Git 格式检查通过。
- 报告新增或更新内容、验证结果、安装状态和 Git 状态。

## 5. 反模式

- 直接把完整聊天或实验报告复制成 `SKILL.md`。
- 创建没有新增判据的编排 Skill。
- 把编译成功写成功能验证成功。
- 把单次硬件 PASS 写成永久保证。
- 在主体堆积长日志、版本和绝对路径。
- 把本机 workaround 写成通用规则。
- 与已有 Skill 描述高度重叠，导致触发不稳定。
- 只做格式校验，从未用真实任务验证。

## 6. 官方参考

- [Save workflows as skills](https://learn.chatgpt.com/use-cases/reusable-codex-skills)
- [Build skills](https://learn.chatgpt.com/docs/build-skills)
- [Custom instructions with AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
