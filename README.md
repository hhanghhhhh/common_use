# common_use

个人可复用的 Agent/Codex 工作流。

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

`skills/temp/` 暂时保留最初的两份大 Markdown，方便对比 Skill 化前后的结构。

## Skill 设计

`SKILL.md` 只放：

- 什么时候触发
- 输入需要确认什么
- Agent 的决策/执行流程
- 哪些规则不能违反
- 什么才算 PASS
- 什么时候继续读取哪个 reference

详细工具知识和踩坑记录放在 `references/`，只有当前任务需要时才读。

已经验证、适合稳定复用的确定性操作可以放在 `scripts/`，避免 Agent 每次重新生成同一段脚本。

## Codex 本地使用

Codex 的本地 Skill discovery 目录是 `.agents/skills`（仓库级）或 `$HOME/.agents/skills`（用户级）。这个仓库作为 Skill 源仓库使用时，可以把对应 Skill 目录复制或 symlink 到用户级目录，例如：

```text
$HOME/.agents/skills/ccs-c2000-debug
$HOME/.agents/skills/anlogic-td-validation
```

也可以让 Codex 的 `$skill-installer` 从这个 GitHub 仓库安装。

Codex CLI / IDE extension 中可以显式调用：

```text
$ccs-c2000-debug
$anlogic-td-validation
```

也可以直接描述任务，让 Codex 根据 `SKILL.md` 顶部的 `description` 自动匹配。

## Source guides

原始经验文档：

```text
skills/temp/AI_AGENT_CCS28335_XDS100V3_VALIDATION_GUIDE.md
skills/temp/AI_AGENT_TD_VALIDATION_GUIDE.md
```

它们用于保留探索过程和完整历史；日常 Agent 执行优先使用整理后的 Skill。