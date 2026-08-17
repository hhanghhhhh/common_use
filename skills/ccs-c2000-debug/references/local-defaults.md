# 本机 CCS / F28335 默认配置

这些值只作为当前工作站的默认参考。每次执行任务前，仍必须重新确认工程相关事实。

## CCS 安装位置

已验证安装目录：

```text
D:\04-software\CCSv720\ccsv7
```

常用工具：

```text
CCS GUI
D:\04-software\CCSv720\ccsv7\eclipse\ccstudio.exe

GNU Make
D:\04-software\CCSv720\ccsv7\utils\bin\gmake.exe

C2000 compilers
D:\04-software\CCSv720\ccsv7\tools\compiler

DSS launcher
D:\04-software\CCSv720\ccsv7\ccs_base\scripting\bin\dss.bat

XDS100 discovery
D:\04-software\CCSv720\ccsv7\ccs_base\common\uscif\xds100serial.exe

JTAG diagnostics
D:\04-software\CCSv720\ccsv7\ccs_base\common\uscif\dbgjtag.exe

DSS examples
D:\04-software\CCSv720\ccsv7\ccs_base\scripting\examples

DSS API docs
D:\04-software\CCSv720\ccsv7\ccs_base\scripting\docs\DS_API
```

不要默认选择 `tools\compiler` 目录中版本号最新的编译器。

应读取当前工程的：

- `Debug\makefile`
- `.cproject`

并使用工程实际选定的 compiler 版本。

## 已验证的 F28335 双输出示例

之前实际跑通的工程结构：

```text
CCS 工程
D:\05-work\29_gpu_test\codex_proj\dsp_proj\MCU_2833x_Metre

CCS Flash 构建目录
Debug

独立 RAM 目录
ram_test

RAM 链接对象/options 清单
ram_test\ram_link.opt

RAM linker cmd
ram_test\F28335_nonBIOS_ram.cmd

RAM 输出
ram_test\DSP_Meter_ram.out
```

已验证流程：

1. 保持正常 CCS Flash 配置完全不变。
2. 使用现有 generated makefile 编译最新业务对象文件。
3. 在 CCS Flash 配置之外，复用这些最新 `.obj` 独立重新链接 RAM-only `.out`。
4. 检查 RAM map，确认没有 Flash 可装载段。
5. 使用 DSS 下载 RAM 镜像。
6. 观察与当前任务对应的运行变量。
7. 再次确认正常 Flash 入口点和启动对象没有被改变。

该工程在 `Debug` 目录中的正常构建命令：

```powershell
& 'D:\04-software\CCSv720\ccsv7\utils\bin\gmake.exe' -j4 all
```

该工程专用的 RAM re-link 示例：

```powershell
& 'D:\04-software\CCSv720\ccsv7\tools\compiler\ti-cgt-c2000_16.9.3.LTS\bin\cl2000.exe' `
    -v28 -ml --float_support=fpu32 -g `
    '--cmd_file=../ram_test/ram_link.opt' `
    '-m../ram_test/MCU_28335_ram.map' `
    --heap_size=1000 --stack_size=1000 --warn_sections `
    --entry_point=_c_int00 --rom_model `
    '--xml_link_info=../ram_test/MCU_28335_ram_linkInfo.xml' `
    -o '../ram_test/DSP_Meter_ram.out'
```

该工作区中已验证的可写 TI AppData 和 DSS 调用形式：

```powershell
$env:TI_APPDATA_DIR = 'D:\05-work\29_gpu_test\codex_proj\.ti-appdata'
New-Item -ItemType Directory -Force -Path $env:TI_APPDATA_DIR | Out-Null

& 'D:\04-software\CCSv720\ccsv7\ccs_base\scripting\bin\dss.bat' `
    '<DSS_SCRIPT>' `
    '<CCXML>' `
    '<RAM_OUT>' `
    '<VARIABLE>' `
    1000
```

**不要把这里的工程路径、对象清单、输出文件名、linker 文件或验证变量直接复制到其他 C2000 工程。**

## 已验证 RAM-only 运行证据

参考 F28335 工程已经实际证明：

- `.text/.cinit/.econst/.ebss/.stack` 均位于片内 RAM。
- F28335 Flash 地址范围内不存在可装载输出 section。
- DSS 能够成功下载 RAM 镜像并启动程序。
- 一次实测中 `task_run_cnt` 从 `0` 增长到 `7072`。
- 验证结束后，正常 CCS Flash 配置仍保持 `code_start`、`DSP28xxx_CodeStartBranch.obj`、`DSP28xxx_SectionCopy_nonBIOS.obj` 和 `F2833x_nonBIOS_flash.cmd`。
- Reset 或掉电后 RAM 镜像消失，DSP 重新执行之前烧录的 Flash 程序。

这些结果用于证明当前工作站和该工程族的流程已经跑通，**不能当成所有 C2000 工程的通用 memory map 或固定配置。**