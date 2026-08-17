# 日志、断言与结论

## 日志标签

建议使用一致标签：

- `[STEP]`：当前测试阶段或用例。
- `[MOCK]`：底层调用、地址、长度和返回值。
- `[ASSERT]`：断言对象、期望和实际值。
- `[DIFF]`：首个差异位置和邻近数据。
- `[SUMMARY]`：总数、通过、失败与退出码。

PASS 文本不是充分证据。至少保留编译命令、编译器版本、运行命令和完整控制台日志。

## 失败分类

- **BUILD_FAIL**：头文件、类型、声明、链接或警告升级失败。
- **HARNESS_FAIL**：测试架构、Mock、fixture 或 runner 自身错误。
- **LOGIC_FAIL**：业务输出或状态与预期不符。
- **TARGET_GAP**：主机无法代表的寄存器、并发、布局或时序行为。
- **BLOCKED**：缺少源码、工具或关键目标语义。

先证明 harness 自身可信，再把失败归因于业务模块。

## 最终报告模板

```text
Scope: <被测模块和入口>
Target semantics: <已确认/假设/未知>
Target compiler check: <范围和结果>
Host build: <GCC 版本、flags、结果>
Tests: <通过数/总数>
Key evidence: <状态、输出、Mock 交互>
Artifacts: <日志和产物路径>
Residual risks: <硬件相关未覆盖项>
Conclusion: PASS | FAIL | BLOCKED
```

如果仅主机测试通过，结论应写“主机逻辑验证 PASS”，不要写成“固件验证 PASS”。
