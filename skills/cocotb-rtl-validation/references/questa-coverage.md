# Cocotb + ModelSim/Questa 覆盖率

## 建立本地库

在独立覆盖率目录执行：

```text
vmap -c
vlib top
vlog -work top +cover=bcest <wrapper.v> <rtl_sources...>
```

`bcest` 对应 Branch、Condition、Expression、Statement、Toggle。只启用项目需要的类型。纯 Verilog 默认按 Verilog 编译；确认源码需要 SystemVerilog 后再使用 `-sv`。

## Cocotb 环境

设置与本次测试匹配的变量：

```text
MODULE=test_xxx
TOPLEVEL=<wrapper_module>
TOPLEVEL_LANG=verilog
PYTHONPATH=<test_directory>
COCOTB_RESULTS_FILE=results_coverage.xml
```

不要猜测 VPI 动态库路径，可查询：

```text
python -c "import cocotb.config; print(cocotb.config.lib_name_path('vpi','questa'))"
```

## 保存 UCDB

推荐使用 `run_coverage.do`，避免 Windows、Python 与 Tcl 多层转义：

```tcl
run -all
coverage save coverage.ucdb
quit -f
```

启动示例：

```text
vsim -c -onfinish stop -pli <cocotbvpi_modelsim.dll> -coverage top.<wrapper_module> -do run_coverage.do
```

必须保证 Cocotb 调用 `$finish` 后仍有机会执行 `coverage save`。不要把包含空格的 Tcl 命令错误地作为单个旧版 runner 参数传递。

## 报告与合并

```text
vcover report -totals -code bcest coverage.ucdb
vcover report -byfile -code bcest -file coverage_byfile.txt coverage.ucdb
vcover report -html -htmldir coverage_html -summary -details -code bcest coverage.ucdb
vcover merge merged.ucdb test1.ucdb test2.ucdb test3.ucdb
```

总覆盖率可能包含 wrapper 和 testbench。评估 DUT 时查看 RTL 文件或 DUT instance。RTL 修改后清理旧优化结果并重新 `vlog`，避免复用旧 `_opt` 设计。

## 覆盖率判定

优先分析关键功能、关键 FSM 状态和重要错误路径。覆盖率目标由项目决定；没有明确门槛时报告实际指标与未覆盖原因，不为追求数字编造激励。不可达防御分支或无意义的大总线 Toggle 应说明并按项目规则排除。
