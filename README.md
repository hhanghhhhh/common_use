# common_use

个人可复用的 Agent / Codex 工作流与 Skill。

## Skills

当前整理了两个标准 Skill：

```text
skills/
├── ccs-c2000-debug/
│   ├── SKILL.md
│   ├── references/
│   │   ├── dss-debug.md
│   │   ├── local-defaults.md
│   │   ├── ram-only.md
│   │   └── troubleshooting.md
│   └── scripts/
│       └── dss_verify_monotonic.js
│
└── anlogic-td-validation/
    ├── SKILL.md
    ├── references/
    │   ├── implementation.md
    │   └── programming-debug.md
    └── scripts/
        └── program_fpga.tcl
```

`skills/temp/` 暂时保留最初的两份大 Markdown，方便直接对比 Skill 化前后的结构和内容。

Skill 文档统一使用中文，命令、API 名称和常用工程术语保留原英文名称，方便人工审阅的同时避免技术含义发生变化。

## Skill 的分层设计

### `SKILL.md`

只负责 Agent 的核心行为：

- 什么任务应该触发这个 Skill
- 开始前需要确认哪些输入
- 如何选择工作模式
- Agent 按什么顺序执行
- 哪些规则不能违反
- 什么条件下才能报告 PASS
- 当前分支需要继续读取哪个 reference
- 最终应该输出哪些证据

### `references/`

保存详细工具知识、已经验证的工程经验和踩坑记录。

Agent 只有在当前任务进入对应分支时才需要读取，因此不会像原来的大 Markdown 一样每次把所有细节一起加载。

### `scripts/`

保存已经验证、适合稳定复用的确定性操作，避免 Agent 每次重新生成同一段脚本。

脚本的机器可解析输出继续使用稳定的英文 key / `PASS` / `FAIL`，方便自动判断；注释使用中文。

## 两个 Skill 的职责

### `ccs-c2000-debug`

用于 TI C2000 / F28335 的：

- CCS 工程编译
- RAM-only 快速下板
- Flash 验证
- DSS 下载和运行变量读取
- 断点 / 单步 / 调用栈调试
- XDS100 / XDS110 / JTAG 排障

### `anlogic-td-validation`

用于安陆 FPGA / TD 的：

- synthesis
- place & route
- SDC / PLL generated clock 检查
- WNS / TNS / setup / hold 时序验证
- resource / DRC / report
- bitgen
- AL-Link SRAM 下载
- ChipWatcher / 下板运行验证

## Codex 本地使用

Codex 的本地 Skill discovery 目录可使用 `.agents/skills`（仓库级）或 `$HOME/.agents/skills`（用户级）。

这个仓库作为 Skill 源仓库时，可以把对应 Skill 目录复制或 symlink 到用户级目录，例如：

```text
$HOME/.agents/skills/ccs-c2000-debug
$HOME/.agents/skills/anlogic-td-validation
```

也可以使用 Skill 安装机制从这个 GitHub 仓库安装。

日常使用时直接描述工程任务即可，由 Codex 根据 `SKILL.md` 顶部的 `name` 和 `description` 自动判断是否使用对应 Skill。

需要显式要求时，可以直接在 prompt 中写明 Skill 名称，例如：

```text
使用 ccs-c2000-debug skill，修改这个 F28335 工程后进行 RAM-only 下板验证。

使用 anlogic-td-validation skill，检查这个安陆 TD 工程的 PLL 时钟约束和最终时序。
```

## 原始经验文档

原来的完整探索记录仍保留：

```text
skills/temp/AI_AGENT_CCS28335_XDS100V3_VALIDATION_GUIDE.md
skills/temp/AI_AGENT_TD_VALIDATION_GUIDE.md
```

原始文档用于保留探索过程和完整历史；日常 Agent 执行优先使用整理后的 Skill。