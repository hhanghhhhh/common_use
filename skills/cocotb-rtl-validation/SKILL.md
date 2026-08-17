---
name: cocotb-rtl-validation
description: 使用 Cocotb 配合 Icarus Verilog 或 ModelSim/Questa，在隔离仿真目录中验证 Verilog/SystemVerilog RTL 的功能、协议时序、边界条件与代码覆盖率。适用于建立 Python 驱动的 RTL 测试、wrapper/开漏总线模型、快速回归、FST 波形，以及语句、分支、条件、表达式和 Toggle 覆盖率分析。综合、布局布线、时序收敛、bitstream 与 FPGA 下板验证应使用实现类 Skill，不要使用本 Skill 替代。
---

# Cocotb RTL 功能与覆盖率验证

目标是形成可重复的 RTL 证据链：独立编译 → 聚焦测试 → 完整回归 → 波形/结果 → 可选覆盖率。仿真 PASS 不等于综合、静态时序或真实硬件 PASS。

## 一、选择验证层级

1. 明确 DUT 顶层、源文件、语言版本、时钟复位、接口协议和通过条件。
2. 日常功能回归优先使用 Cocotb + Icarus。
3. 需要代码覆盖率时，在同一套测试上增加 ModelSim/Questa 回归。
4. 需要综合、时序、bitstream 或 SRAM 下载时，切换到对应 FPGA 实现 Skill；安陆工程使用 `anlogic-td-validation`。

## 二、保持工程隔离

- 不修改原 RTL 或原厂模型。
- 在专用验证目录保存 runner、测试、wrapper、临时适配文件和结果。
- 需要 `timescale`、端口暴露、参数覆盖或模型适配时使用 wrapper，或在构建目录生成临时副本。
- 每次最终回归使用独立 `sim_build_*`，保留结果 XML、波形和完整日志。
- 使用 UTF-8 保存新增文本文件。

## 三、快速功能回归

1. 检查仿真器和 Cocotb 可用性。
2. 先用仿真器独立编译 RTL，尽早发现语法、顶层名和源文件列表问题。
3. 建立最小 runner；Windows 下优先使用 Python runner，不依赖 `make`。
4. 确认 `hdl_toplevel` 是真实 `module` 名；使用 wrapper 时填写 wrapper 名。
5. 为所有边沿等待、响应等待和后台任务设置周期上限或超时。
6. 先跑复位与冒烟测试，再跑正常、边界、错误和恢复路径。
7. 生成单一波形源并保存 `results.xml` 与完整日志。

Icarus 命令、runner 和 FST 规则见 [icarus-workflow.md](references/icarus-workflow.md)。

## 四、协议与时序建模

- 开漏总线必须用高阻释放与上拉语义建模，禁止把“释放”直接驱动为逻辑 1。
- 缩短分频和 timeout 只能用于加速，不得破坏 CDC、输入滤波、最小脉宽和协议速率比例。
- 时钟、复位和跨时钟事件必须有清晰的同步假设。
- 失败时报告仿真时间、状态、关键信号和最近一次总线事务。

涉及 I2C/SMBus、CDC 或参数加速时读取 [protocol-timing.md](references/protocol-timing.md)。

## 五、ModelSim/Questa 覆盖率

1. 在 `vlog` 阶段按所需类型插桩；仅给 `vsim` 添加 `-coverage` 不足以得到完整结果。
2. 保持 RTL 的实际语言模式；不要无条件强制 `-sv`。
3. 在独立目录建立本地库与 `modelsim.ini`，不要修改全局安装。
4. 使用 `.do` 文件执行 `run -all`、保存 UCDB、再退出。
5. Cocotb `$finish` 场景使用 `-onfinish stop`，确保覆盖率保存命令仍会执行。
6. 分测试保存独立 UCDB，需要时合并，再生成 totals、by-file 和 HTML 报告。
7. 以 DUT 文件或实例的覆盖率为判断依据，排除 wrapper/testbench 干扰。

完整命令和常见陷阱见 [questa-coverage.md](references/questa-coverage.md)。

## 六、验收与报告

分别报告：

1. **编译**：工具版本、语言模式、顶层和源文件范围。
2. **功能**：用例数、通过/失败、关键协议证据和超时情况。
3. **波形**：FST/VCD 路径及失败时间点。
4. **覆盖率**：插桩类型、UCDB、DUT 指标和未覆盖关键分支。
5. **限制**：未覆盖的综合、STA、模拟电气或真实硬件行为。
6. **结论**：功能 PASS/FAIL 与覆盖率是否满足项目明确门槛；没有项目门槛时只报告数据，不擅自设定统一阈值。
