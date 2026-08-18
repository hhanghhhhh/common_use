---
name: ccs-c2000-debug
description: 在 Windows 下使用 Code Composer Studio（CCS）、Debug Server Scripting（DSS）和 XDS100/XDS110 对 TI C2000/F28335 固件进行编译、下载、运行验证和硬件调试。适用于 CCS 工程编译、F28335/2833x 下板验证、RAM-only 下载、Flash 烧录、运行变量读取、断点/单步调试以及 JTAG/仿真器排障。如果只是源码审查，不需要调用 CCS 工具链或真实目标硬件，则不要使用本 Skill。
---

# TI C2000 CCS/DSS 编译、下板与调试

目标是形成可复查的闭环：

```text
确认工程 → 原配置编译 → 选择 RAM/Flash → DSS 连接/装载 → 观察业务证据 → PASS/FAIL → 明确最终状态
```

只执行当前任务需要的最短路径，不把本 Skill 当成 C2000 教程。

## 一、开始前确认

优先从工程自动确定，不让用户重复提供仓库中已有的信息：

- 工程根目录、实际 build 目录和 generated makefile
- 工程选定的 compiler 版本
- 匹配目标芯片和 probe 的 `.ccxml`
- 当前 linker cmd、入口点、`.out` 和 `.map`
- RAM-only 时的独立输出及其 map
- 能证明本次行为正确的变量、状态、事件或通信结果
- 采样间隔、timeout，以及验证结束后期望的 target/session 状态

本机路径只作候选值；需要时读取 `references/local-defaults.md`，但每个工程都要重新确认上述事实。

## 二、任务路由

| 目标 | 方式 | 额外资料 |
|---|---|---|
| 只确认编译/链接 | 工程自身配置构建，到新 `.out` 为止 | 无 |
| 算法、状态机、外设、变量观察 | 优先独立 RAM-only 输出 | `references/ram-only.md` |
| BootROM、上电启动、Flash copy/wait-state、升级或掉电保持 | Flash 验证 | `references/dss-debug.md` |
| 已知成功条件的固定回归 | 一次性 DSS 脚本 | `references/dss-debug.md` |
| 未知 Bug、断点、单步、调用栈 | 常驻交互式 DSS session | `references/dss-debug.md` |
| XDS/FTDI/JTAG 连接异常 | 先查占用、驱动和链路 | `references/troubleshooting.md` |

RAM-only 不能靠文件名判断；必须从 map 证明所有可装载 section 都不在 Flash。

## 三、硬性规则

- 使用工程实际 compiler 和 CCS Managed Build；不得手工维护自动生成的 `Debug/makefile`、`sources.mk`、`objects.mk`、`subdir_vars.mk` 或 `subdir_rules.mk`。
- 新增 `.c` 时，把它作为工程资源加入源码树，其他模块只包含其 `.h`。不得用 `#include "xxx.c"` 代替加入构建；遇到既被包含又被独立编译的 `.c`，优先改成标准 `.c + .h`。有意采用 unity build 时必须显式将被包含的 `.c` 从当前配置排除，并说明原因。
- 工程临时验证文件统一放在 `APP/validation/`：DSP 侧使用标准 `.c + .h`，上位机脚本和辅助文件也放在该目录；调用方使用 `validation/<name>.h`。验证 `.c` 需要参与当前构建时不得排除，退出验证或生成正式配置时同时移除调用点或用明确宏关闭，并按配置排除验证目录，避免临时代码混入发布镜像。
- 外部工具创建源码后，先刷新 CCS 工程资源并确认当前配置未 `Exclude from Build`，再用 Managed Build 执行一次 clean build，让 CCS 重建 generated makefile。不要直接运行旧 `Debug/gmake` 来发现新源文件。完整流程和判据见 `references/managed-build.md`。
- 不要为规避写权限而直接复制带 generated build 目录的 CCS 工程后原样构建；makefile、依赖文件和预构建命令可能嵌入原工程绝对路径。优先在权威工程目录按需申请写权限执行；必须隔离时重新生成构建文件，并验证所有输入、输出和预构建路径都指向副本。
- RAM-only 首选布局：在权威工程目录用原 generated build 完整编译，得到本轮 `.obj`；另建 `ram_test` 等辅助目录，只放 RAM linker、link options、RAM `.out/.map`、DSS 脚本和日志，并从 options 显式引用权威 build 目录的新 `.obj`。如果 `ram_test` 位于 CCS 工程根目录内，必须在所有正常 Debug/Release 配置中排除整个目录，否则 Managed Build 会把其中的 RAM `.cmd` 自动加入正常 Flash 链接，造成 memory range 重复定义。也可把辅助目录放到工程资源树外。不要复制源码工程或 `Debug` 目录来生成 RAM 输出。
- 正常 Flash 配置保持不动。RAM 验证优先复用最新 `.obj`，用独立 RAM linker 生成第二个 `.out`。
- RAM 输出不得执行会用旧 Flash 内容覆盖 RAM 的 Flash section-copy 启动链。
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

1. 检查 `.project`、`.cproject`、generated makefile、linker、`.ccxml`、现有输出和待观察代码；新增源码时同时检查 `APP/validation` 归档、重复编译、`.c` 直包含和 `Exclude from Build`，并确认 `ram_test` 等辅助目录不会进入正常配置。
2. 在权威工程目录刷新资源并用 CCS Managed Build 编译；从 `Building file` 和最终链接命令确认每个新增 `.c` 恰好产生并链接一个 `.obj`，再确认 `.obj/.out` 时间戳属于本次构建并分类 warning。
3. 如需 RAM-only，在独立辅助目录复用上述 `.obj` 重新链接并检查 map；辅助目录只保存 RAM 专用输入和输出，不复制或修改 generated build。若辅助目录位于工程树内，先从所有正常配置排除，并确认正常 `sources.mk` 和最终 Flash 链接命令均不含该目录或 RAM linker cmd。
4. 设置可写 `TI_APPDATA_DIR`，通过 DSS 连接、装载并进入预期运行状态。
5. 按任务选择运行中读取、一致快照、断点或批量内存读取，直到得到终态或 timeout。
6. 根据行为证据判定并有意识地结束调试。

## 五、固定回归脚本

- `scripts/dss_verify_monotonic.js`：表达式应随运行单调增加。
- `scripts/dss_verify_state_machine.js`：状态机应进入 PASS/FAIL 终态，并联合检查 pass flag、error 和可选 progress；脚本用周期性 run/halt 获得一致快照。

两者都必须看到明确的 `[CCS-DSS] PASS:`。状态机脚本还应保留最后一条 `SAMPLE`；首次采样仍是启动默认值不应立即判失败。

## 六、PASS 条件

只有当前任务适用项全部满足才能报告 PASS：

- 使用预期源码、配置、compiler、probe 和 target
- 构建/链接完成，输出属于本次执行，无阻塞错误
- 正常 Debug/Release 链接没有混入 `ram_test` 或 RAM-only linker cmd
- RAM-only map 无 Flash 可装载段；Flash 任务实际加载的是预期 Flash 镜像
- 程序进入预期运行状态，业务证据满足判据
- warning 和工具日志已分类，不依赖外层退出码猜测成功
- 最终 target/session 状态明确

## 七、Reference 路由

- 新增/删除源码、Managed Build、generated makefile、重复定义 → `references/managed-build.md`
- RAM linker、双输出、map 检查 → `references/ram-only.md`
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
LOAD: RAM | FLASH | NOT RUN
TARGET: 实际设备/仿真器 | NOT RUN
RUN: PASS | FAIL | INCONCLUSIVE | NOT RUN
VALIDATION: PASS | FAIL | INCONCLUSIVE
EVIDENCE: 实际观察到的变量/事件/结果
WARNINGS: 仍存在的重要 warning
FINAL STATE: target running/halted/disconnected，以及原因
```

失败时只突出第一个可执行故障点和下一步最有效诊断动作。
