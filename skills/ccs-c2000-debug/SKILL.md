---
name: ccs-c2000-debug
description: 在 Windows 下使用 Code Composer Studio（CCS）、Debug Server Scripting（DSS）和 XDS100/XDS110 对 TI C2000/F28335 固件进行编译、下载、运行验证和硬件调试。适用于 CCS 工程编译、F28335/2833x 下板验证、RAM-only 下载、Flash 烧录、运行变量读取、断点/单步调试以及 JTAG/仿真器排障。如果只是源码审查，不需要调用 CCS 工具链或真实目标硬件，则不要使用本 Skill。
---

# TI C2000 CCS/DSS 编译、下板与调试

使用本 Skill，把一次 C2000 固件修改闭环到真实工具链和目标板上的可验证证据。

默认流程：

```text
确认当前工程
→ 使用工程自身配置编译
→ 选择 RAM 或 Flash 验证
→ 通过 DSS 连接目标
→ 运行程序
→ 观察与当前任务对应的证据
→ 判定 PASS / FAIL
→ 按任务要求留下目标和调试会话状态
```

不要把本 Skill 当成 C2000 教程。只执行当前任务需要的最短流程，并且只在需要时读取对应 reference。

## 一、开始前必须确认的输入

优先从当前工程和工具输出中自动确认，不要沿用其他工程的值，也不要让用户重复提供仓库中可以安全确定的信息。

需要确认：

- `PROJECT_DIR`：CCS 工程根目录，通常包含 `.project` / `.cproject`。
- `BUILD_DIR`：当前实际构建目录，例如 `Debug`。
- `COMPILER_DIR`：该工程实际选择的编译器版本。
- `CCXML`：与当前芯片和仿真器匹配的目标配置。
- `FLASH_OUT`：CCS 正常 Flash 配置生成的 `.out`。
- `RAM_OUT`：采用 RAM-only 验证时生成的独立 `.out`。
- `MAP_FILE`：与当前待验证输出对应的 map 文件。
- `VALIDATION_EVIDENCE`：能够证明本次修改正确的变量、状态、波形、断点条件、通信结果或其他行为。
- `SAMPLE_MS` / timeout：需要运行时采样时的间隔与总超时。

## 二、本机默认值与工程事实要分开

本机已经有一套验证过的 CCS 7.2 / XDS100V3 / F28335 环境。需要使用本机固定路径或参考工程时，再读取：

`references/local-defaults.md`

以下内容即使本机已有参考值，每个工程仍必须重新确认：

- 编译器版本
- `.ccxml`
- linker cmd
- 输出文件名
- 入口点
- target session 名称
- 验证变量或表达式

## 三、先选择正确的验证模式

### 1. 只编译

用户只要求确认工程能否编译/链接时，到编译结果为止，不要无理由连接目标硬件。

成功至少需要：

- 编译命令成功完成
- 链接成功
- 目标输出文件存在且时间戳属于本次构建
- 没有阻塞性的编译/链接错误
- 对重要 warning 做分类，而不是忽略

### 2. RAM-only 功能验证

对于频繁的“修改 → 编译 → 下板 → 运行 → 观察”循环，只要问题不依赖 Flash 布局或启动过程，默认优先 RAM-only。

典型适用：

- 算法、控制逻辑
- 状态机
- 中断逻辑
- 大部分外设和通信功能
- 运行变量观察
- 断点、单步调试

创建或修改 RAM linker 流程前读取：

`references/ram-only.md`

**不能因为文件名里有 `ram` 就认为它是 RAM-only。必须检查 map，确认所有可装载 section 没有落入 Flash。**

### 3. Flash 验证

以下问题必须使用 Flash 或最终再补 Flash 验证：

- BootROM / Reset / 上电启动路径
- `code_start`
- Flash → RAM 段复制
- Flash wait-state / 执行时序
- linker / 存储布局问题
- 在线升级、擦除、烧录、校验
- 掉电保存
- 脱离仿真器独立运行

发布级验证需要时，还应包含 reset、断电重启、脱离仿真器运行。

### 4. 未知 Bug 的交互式调试

遇到未知 Bug，不要一开始把完整调试过程写死成一次性脚本。

优先保持一个常驻 DSS session，保留：

- 断点
- PC
- 调用栈
- 当前暂停位置
- target 运行/暂停状态

需要断点、单步、调用栈、实时变量或常驻 DSS 服务时读取：

`references/dss-debug.md`

### 5. 已知行为的固定回归

如果成功条件明确而稳定，可以使用一次性 DSS 脚本。

`scripts/dss_verify_monotonic.js` 只适用于“某个数值表达式在目标持续运行时应单调增加”的场景。

不要把所有验证都机械转换成“计数器必须增加”。

## 四、必须遵守的执行流程

### Step 1：先检查工程，再修改

检查：

- `.cproject`
- 当前生成的 makefile
- linker cmd
- `.ccxml`
- 已有 `.out` / `.map`
- 与本次验证证据相关的代码

优先使用工程已有的构建系统。

除非生成式构建缺失，或者任务本身就是重建构建系统，否则不要手工拼出几十条 `cl2000` 命令。

不要把 `Debug/makefile` 当成长期配置文件直接修改，因为 CCS 会重新生成它。

### Step 2：使用工程自己的配置编译

使用项目实际选中的 compiler。

已有有效 generated makefile 时，在当前构建目录调用 CCS 自带 `gmake`。

编译成功至少确认：

- build 成功
- link 完成
- 输出文件存在
- 输出文件为本次新生成
- 没有阻塞错误

### Step 3：保护人工使用的 Flash 配置

为了 AI 快速 RAM 验证，优先采用：

```text
正常 CCS Flash 配置保持不动
+ 最新 .obj
+ 独立 RAM linker
= 第二个 RAM-only 输出
```

不要为了 Agent 测试而反复修改 `.cproject`、删除 Flash startup object，或者把人工使用的 CCS 配置永久切到 RAM。

### Step 4：连接失败先检查仿真器是否被占用

XDS 连接失败时，第一步不是重装驱动。

先检查 CCS GUI 或其他 Debug Server/DSLite 进程是否已经占用仿真器。

不要直接强杀可能存在未保存内容的 `ccstudio.exe`。

XDS100 / FTDI / JTAG 排障读取：

`references/troubleshooting.md`

### Step 5：通过 DSS 下载和运行

受限环境无法写 TI AppData 时，把 `TI_APPDATA_DIR` 指向工作区内可写目录。

对于已经确认 `.ccxml` 只有一个目标的情况，优先使用已经验证的：

```javascript
server.openSession();
```

不要根据界面显示的芯片名随意猜 session regex。

多核目标必须先确认真实 session 名称。

自定义启动路径下，程序装载前关闭不适用的自动 run-to-label 行为。

### Step 6：尽量不扰动目标地观察证据

普通 RAM 全局变量、计数器、状态量，在目标支持实时访问时，优先让目标继续运行并读取 expression。

只有以下情况才主动 halt：

- 需要一致快照
- 实时访问不支持
- 检查局部变量/寄存器/调用栈
- 当前调试操作本身要求暂停

数组、波形和连续 buffer 优先使用批量 `memory.readData()`，不要逐元素执行大量 `expression.evaluate()`。

禁止无目的轮询具有 read-clear 等副作用的寄存器。

### Step 7：PASS 必须来自行为证据

**不能仅根据 `dss.bat` 退出码判断成功。**

在已验证的 CCS 7.2 环境中，即使 JavaScript 内部失败，外层 PowerShell 仍可能看到退出码 `0`。

必须同时检查：

- 程序是否真正完成预期装载
- 目标是否进入预期运行状态
- 本次任务的业务证据是否满足要求
- 日志是否存在明确成功标记

对于 `dss_verify_monotonic.js`，必须看到：

```text
[CCS-DSS] PASS:
```

“程序成功下载”不能自动升级成“功能验证通过”。

### Step 8：有意识地结束调试

DSS 资源清理使用 `try/finally` 思路。

完成后明确说明：

- target 最终是 running 还是 halted
- session 是否断开
- 为什么留下这个状态

## 五、PASS 验收条件

只有所有当前任务适用的条件都满足，才能报告 PASS：

- 使用了预期源码和配置
- 构建产物属于本次执行
- 连接到了预期 probe / target
- 实际加载的是预期 RAM 或 Flash 镜像
- RAM-only 情况下没有意外的 Flash 可装载段
- 程序进入了预期运行状态
- 本次任务要求的变量/事件/通信/状态证据符合预期
- 工具日志没有未分类的阻塞错误
- 最终 target/session 状态明确

## 六、Reference 按需加载规则

只读当前任务需要的资料：

- RAM linker、RAM-only 下载、双输出结构 → `references/ram-only.md`
- DSS API、实时变量、断点、单步、常驻 session → `references/dss-debug.md`
- XDS100、FTDI、连接失败、CCS 7.2 特殊问题 → `references/troubleshooting.md`
- 本机 CCS 路径和已验证 F28335 示例 → `references/local-defaults.md`

## 七、最终输出格式

工具链/硬件任务结束时给出简洁证据报告：

```text
BUILD: PASS | FAIL | NOT RUN
LOAD: RAM | FLASH | NOT RUN
TARGET: 实际连接的设备/仿真器 | NOT RUN
RUN: PASS | FAIL | INCONCLUSIVE | NOT RUN
VALIDATION: PASS | FAIL | INCONCLUSIVE
EVIDENCE: 实际观察到的变量/事件/结果
WARNINGS: 仍存在的重要 warning
FINAL STATE: target running/halted/disconnected，以及原因
```

某一步失败时，优先给出**第一个可执行的故障点 + 下一步最有效的诊断动作**，不要直接倾倒整份 CCS 日志。