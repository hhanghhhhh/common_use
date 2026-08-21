---
name: ccs-c2000-debug
description: 在 Windows 下使用 Code Composer Studio（CCS）、Debug Server Scripting（DSS）和 XDS100/XDS110 对 TI C2000/F28335 固件进行默认 Debug 配置编译、Flash 烧录、运行验证和硬件调试。适用于 CCS 工程构建、F28335/2833x 下板验证、变量读取、断点/单步调试及 JTAG/仿真器排障。如果只是源码审查，不需要调用 CCS 工具链或真实目标硬件，则不要使用本 Skill。
---

# TI C2000 CCS/DSS 编译、下板与调试

目标是形成可复查的闭环：

```text
确认工程 → 默认 Debug clean build → Flash 烧录/校验 → 运行 → 观察业务证据 → PASS/FAIL → 明确最终状态
```

只执行当前任务需要的最短路径，验证统一使用工程现有的默认 `Debug` Flash 配置和输出。

## 一、开始前确认

优先从工程自动确定，不让用户重复提供仓库中已有的信息：

- 工程根目录、实际 build 目录和 generated makefile
- 工程选定的 compiler 版本
- 匹配目标芯片和 probe 的 `.ccxml`
- 当前 linker cmd、入口点、`.out` 和 `.map`
- 能证明本次行为正确的变量、状态、事件或通信结果
- 采样间隔、timeout，以及验证结束后期望的 target/session 状态

本机路径只作候选值；需要时读取 `references/local-defaults.md`，但每个工程都要重新确认上述事实。

## 二、任务路由

| 目标 | 方式 | 额外资料 |
|---|---|---|
| 只确认编译/链接 | 工程自身配置构建，到新 `.out` 为止 | 无 |
| 编译、算法、状态机、外设、变量观察 | 默认 `Debug` clean build，烧录其 Flash `.out` | `references/managed-build.md`、`references/dss-debug.md` |
| BootROM、上电启动、Flash copy/wait-state、升级或掉电保持 | 默认 `Debug` Flash 验证，并增加对应启动/持久化证据 | `references/dss-debug.md` |
| 已知成功条件的固定回归 | 一次性 DSS 脚本 | `references/dss-debug.md` |
| 未知 Bug、断点、单步、调用栈 | 常驻交互式 DSS session | `references/dss-debug.md` |
| XDS/FTDI/JTAG 连接异常 | 先查占用、驱动和链路 | `references/troubleshooting.md` |

## 三、硬性规则

- 使用工程实际 compiler 和 CCS Managed Build；不得手工维护自动生成的 `Debug/makefile`、`sources.mk`、`objects.mk`、`subdir_vars.mk` 或 `subdir_rules.mk`。
- 新增 `.c` 时，把它作为工程资源加入源码树，其他模块只包含其 `.h`。不得用 `#include "xxx.c"` 代替加入构建；遇到既被包含又被独立编译的 `.c`，优先改成标准 `.c + .h`。有意采用 unity build 时必须显式将被包含的 `.c` 从当前配置排除，并说明原因。
- 工程临时验证文件统一放在 `APP/validation/`：DSP 侧使用标准 `.c + .h`，上位机脚本和辅助文件也放在该目录；调用方使用 `validation/<name>.h`。验证 `.c` 需要参与当前构建时不得排除，退出验证或生成正式配置时同时移除调用点或用明确宏关闭，并按配置排除验证目录，避免临时代码混入发布镜像。
- 外部工具创建源码后，先刷新 CCS 工程资源并确认当前配置未 `Exclude from Build`，再用 Managed Build 执行一次 clean build，让 CCS 重建 generated makefile。不要直接运行旧 `Debug/gmake` 来发现新源文件。完整流程和判据见 `references/managed-build.md`。
- 不要为规避写权限而直接复制带 generated build 目录的 CCS 工程后原样构建；makefile、依赖文件和预构建命令可能嵌入原工程绝对路径。优先在权威工程目录按需申请写权限执行；必须隔离时重新生成构建文件，并验证所有输入、输出和预构建路径都指向副本。
- 默认对工程当前 `Debug` 配置执行 clean build，并烧录本次生成的 `.out`。新增源码由 CCS 刷新/导入工程资源后自动纳入构建。
- Flash 装载设置 Full verification，并为 erase/program/verify 留足 timeout。
- XDS 连接失败先检查 CCS/Debug Server 是否占用 probe；不要直接强杀可能有未保存内容的 CCS GUI。
- 单目标 `.ccxml` 才优先使用 `server.openSession()`；多核目标必须确认真实 session。
- 普通全局量优先运行中读取；需要一致快照、局部变量或调用栈时再 halt。
- 连续 buffer 使用批量 `memory.readData()`；不要逐元素高频求值，也不要轮询 read-clear 寄存器。
- `dss.bat` 退出码可能为 `0` 但脚本内部失败；必须检查明确 PASS 标记和业务证据。
- 同一时刻只启动一个 DSS/eclipsec 会话。保存并持续轮询启动器返回的 session，确认当前实例退出后才能重试；不要用第二个 headless 实例覆盖无输出问题。
- 已设置可写 `TI_APPDATA_DIR` 仍出现 `CSIDL`/AppData/权限错误时，把它判为执行环境问题，立即对同一最小 DSS 命令申请非沙箱执行；不要反复更换启动方式或继续叠加进程。
- “程序成功装载”不等于功能正确；PASS 必须来自变量、事件、通信或其他目标行为。
- 结束时明确 target 是 running/halted、session 是否断开以及原因；异常路径也必须 cleanup。

## 四、执行顺序

1. 检查 `.project`、`.cproject`、默认 `Debug`、linker、`.ccxml`、现有输出和待观察代码；新增源码时同时检查重复编译、`.c` 直包含和 `Exclude from Build`。
2. 在权威工程目录刷新资源并用 CCS Managed Build 编译；从 `Building file` 和最终链接命令确认每个新增 `.c` 恰好产生并链接一个 `.obj`，再确认 `.obj/.out` 时间戳属于本次构建并分类 warning。
3. 设置可写 `TI_APPDATA_DIR`，通过 DSS 连接，烧录默认 `Debug` `.out` 并执行 Full verification。
4. 运行程序，按任务选择运行中读取、一致快照、断点或批量内存读取，直到得到终态或 timeout。
5. 根据行为证据判定并有意识地结束调试。

## 五、固定回归脚本

- `scripts/dss_verify_monotonic.js`：表达式应随运行单调增加。
- `scripts/dss_verify_state_machine.js`：状态机应进入 PASS/FAIL 终态，并联合检查 pass flag、error 和可选 progress；脚本用周期性 run/halt 获得一致快照。

两者都必须看到明确的 `[CCS-DSS] PASS:`。状态机脚本还应保留最后一条 `SAMPLE`；首次采样仍是启动默认值不应立即判失败。

## 六、PASS 条件

只有当前任务适用项全部满足才能报告 PASS：

- 使用预期源码、配置、compiler、probe 和 target
- 构建/链接完成，输出属于本次执行，无阻塞错误
- 实际加载并完整校验的是本次默认 `Debug` 生成的 Flash 镜像
- 程序进入预期运行状态，业务证据满足判据
- warning 和工具日志已分类，不依赖外层退出码猜测成功
- 最终 target/session 状态明确

## 七、Reference 路由

- 新增/删除源码、Managed Build、generated makefile、重复定义 → `references/managed-build.md`
- DSS API、状态机回归、断点/单步、实时读取 → `references/dss-debug.md`
- XDS100、FTDI、连接占用和 JTAG 排障 → `references/troubleshooting.md`
- 本机 CCS 路径和已验证能力 → `references/local-defaults.md`

## 八、经验沉淀

只沉淀已经由真实工具或硬件验证、可跨工程复用的结论：

- 决策、禁止事项、验收门槛写入 `SKILL.md`。
- 版本差异和排障细节写入对应 reference。
- 稳定重复操作优先写成参数化脚本。
- 工程私有路径、变量、linker 和目标配置留在工程内。
- 只留最小可审阅 diff；除非用户明确要求，不 commit、不 push。

## 九、最终报告

```text
BUILD: PASS | FAIL | NOT RUN
LOAD: FLASH | NOT RUN
TARGET: 实际设备/仿真器 | NOT RUN
RUN: PASS | FAIL | INCONCLUSIVE | NOT RUN
VALIDATION: PASS | FAIL | INCONCLUSIVE
EVIDENCE: 实际观察到的变量/事件/结果
WARNINGS: 仍存在的重要 warning
FINAL STATE: target running/halted/disconnected，以及原因
```

失败时只突出第一个可执行故障点和下一步最有效诊断动作。
