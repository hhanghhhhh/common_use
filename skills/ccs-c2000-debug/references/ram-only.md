# C2000 RAM-only 验证参考

当任务需要在**不擦写/烧录 Flash** 的情况下快速进行真实目标验证时读取本文件。

## 什么时候适合 RAM 验证

只要行为不依赖启动介质或 Flash 地址布局，RAM 下载适合作为频繁“修改 → 编译 → 下载 → 运行 → 观察”的默认方式。

通常适合：

- 算法、业务逻辑、控制逻辑
- 中断和状态机
- 大部分外设驱动与通信逻辑
- 变量观察、断点和单步调试

以下问题不能只靠 RAM-only 作为最终证据：

- BootROM、Reset、上电启动
- `code_start` 和 Flash → RAM 段复制
- Flash wait-state / pipeline 时序
- 与 Flash 地址布局有关的 linker 问题
- Flash 擦除、烧录、升级、校验
- 掉电保持
- 拔掉仿真器后的独立运行

## 不能把 Flash 版 `.out` 直接当成 RAM-only

Loader 会遵守 executable 中 section 的 **LOAD 地址**。

典型 Flash linker 可能定义：

```text
.text/.cinit/.econst:
LOAD = FLASH
RUN  = RAM
```

此时调用：

```javascript
session.memory.loadProgram("<FLASH_OUT>");
```

仍然会先向 Flash 的 LOAD 地址编程，然后程序再把代码复制到 RAM 执行。

真正的 RAM-only 必须生成一个**可装载 section 本身就链接到 RAM** 的独立 executable。

## 推荐：单一源码/编译配置 + 双输出

保持人工正常使用的 CCS Flash 配置不动：

```text
正常 CCS Flash build
├─ 编译当前 C/ASM 源码
├─ 生成最新 .obj
└─ 正常链接 Flash .out

独立 RAM re-link
├─ 复用上述最新 .obj
├─ 按需要排除 Flash startup / section-copy 对象
├─ 使用独立 RAM linker cmd
├─ 使用适合 RAM 的入口点
└─ 生成供 Agent 快速验证的独立 RAM .out
```

这样可以避免 Agent 为了测试切换 CCS 配置，最后把用户下一次人工 Flash build 留在错误状态。

不要通过长期修改 `Debug\makefile` 来维护这个流程，因为它是 CCS 自动生成文件。

### 不要盲目复制 generated build 目录

CCS 生成的 `makefile`、`subdir_vars.mk`、依赖文件和 pre-build 命令可能保存 `${ProjDirPath}` 展开的绝对路径。把整个工程复制到隔离目录后直接运行旧 `Debug/makefile`，可能发生：

- 源文件仍从原工程读取；
- `build_info.h` 等生成文件仍写回原工程；
- 旧对象因时间戳被误判为 up to date；
- 表面构建成功，实际产物并不属于隔离副本。

优先在权威工程目录使用原配置构建并按需申请写权限。必须隔离时，通过 CCS 重新生成 build 目录，或逐项验证 source/include/pre-build/output/dependency 的绝对路径；不能只修一个 makefile 路径后就认定隔离构建可靠。

## 链接前先检查 RAM 容量

从已有 map 估算程序和数据占用：

```powershell
Select-String -Path '<FLASH_MAP>' `
    -Pattern '^\.text\s|^\.cinit\s|^\.const\s|^\.econst\s|^\.pinit\s|^\.switch\s|^\.ebss\s|^\.stack\s|^\.esysmem\s'
```

对于 F28335，重点确认：

- 程序、常量、初始化表能够放入 PAGE 0 分配的 RAM。
- `.ebss`、stack、heap、用户数据能够放入 PAGE 1。
- 同一物理 RAM block 不能同时在 PAGE 0 / PAGE 1 被重叠使用。
- 保留 BootROM 约定、stack、外设映射、DMA 和工程自身需要的内存。
- 如果使用外部 RAM，访问该 RAM 之前必须保证 XINTF/对应接口已经初始化完成。

不能为了拿到 `.out` 而忽略 linker overflow。

## RAM linker 的基本结构

实际地址必须依据目标芯片手册和当前工程 memory map，不能机械复制示例。

典型结构：

```text
MEMORY
{
PAGE 0:
    PROGRAM_RAM : origin = <PROGRAM_RAM_ORIGIN>, length = <PROGRAM_RAM_LENGTH>
    ADC_CAL     : origin = <ADC_CAL_ORIGIN>,     length = <ADC_CAL_LENGTH>
    IQTABLES    : origin = <IQTABLES_ORIGIN>,    length = <IQTABLES_LENGTH>
    FPUTABLES   : origin = <FPUTABLES_ORIGIN>,   length = <FPUTABLES_LENGTH>

PAGE 1:
    STACK_RAM   : origin = <STACK_RAM_ORIGIN>, length = <STACK_RAM_LENGTH>
    DATA_RAM    : origin = <DATA_RAM_ORIGIN>,  length = <DATA_RAM_LENGTH>
}

SECTIONS
{
    .text       : > PROGRAM_RAM, PAGE = 0
    .cinit      : > PROGRAM_RAM, PAGE = 0
    .const      : > PROGRAM_RAM, PAGE = 0
    .econst     : > PROGRAM_RAM, PAGE = 0
    .pinit      : > PROGRAM_RAM, PAGE = 0
    .switch     : > PROGRAM_RAM, PAGE = 0
    IQmath      : > PROGRAM_RAM, PAGE = 0

    .stack      : > STACK_RAM, PAGE = 1
    .ebss       : > DATA_RAM,  PAGE = 1
    .esysmem    : > DATA_RAM,  PAGE = 1

    IQmathTables : > IQTABLES,  PAGE = 0, TYPE = NOLOAD
    FPUmathTables: > FPUTABLES, PAGE = 0, TYPE = NOLOAD
    .adc_cal     : > ADC_CAL,   PAGE = 0, TYPE = NOLOAD
}
```

如果 startup/security/Flash 专用 object 仍声明不希望装载的 section，可以：

- 从 RAM link 中排除对应 object；或
- 在语义正确的前提下把无关 section 映射为 `DSECT` / `NOLOAD`。

## RAM 入口点与 Flash section-copy

典型 Flash 应用启动链：

```text
code_start
→ watchdog / startup
→ 从 Flash copy_sections 到 RAM
→ _c_int00
→ main
```

RAM-only 镜像不能盲目继续执行 Flash section-copy 逻辑，否则可能用旧 Flash 内容覆盖刚刚下载到 RAM 的新程序。

在已经验证的 F28335 non-BIOS 工程中，RAM link 做法是：

1. 排除 `CodeStartBranch` 和 Flash `SectionCopy` object。
2. 使用：

```text
--entry_point=_c_int00
```

3. 直接下载这个 RAM executable。

**不要假设所有项目都应该使用 `_c_int00`。** 如果工程有自定义 RAM startup，必须采用工程真实入口。

## 优先复用最新 `.obj`，不要产生第二套编译参数

可以用 options file 列出：

- 当前 build 产生的业务 `.obj`
- header linker cmd
- RAM linker cmd
- 工程库
- 正确版本 RTS library

示例：

```text
-z
"<HEADER_LINKER_CMD>"
"<OBJECT_1>"
"<OBJECT_2>"
"<RAM_LINKER_CMD>"
"<PROJECT_LIBRARY>"
"<COMPILER_DIR>/lib/rts2800_fpu32.lib"
```

`-z` 必须在 linker cmd/options 被解析前生效，否则 `.cmd` 有可能被误当成源码输入。

示例 re-link 形式：

```powershell
& '<COMPILER_DIR>\bin\cl2000.exe' `
    -v28 -ml --float_support=fpu32 -g `
    '--cmd_file=<RAM_LINK_OPTIONS>' `
    -m'<RAM_MAP>' `
    --heap_size=<HEAP_SIZE> `
    --stack_size=<STACK_SIZE> `
    --warn_sections `
    --entry_point=_c_int00 `
    --rom_model `
    -o '<RAM_OUT>'
```

这里的 ABI、编译选项和库必须来自当前工程。不要把 F28335 的 flags 机械复制到别的 C2000 芯片。

## 下载前必须证明没有 Flash 可装载段

检查 RAM map 的主要 section：

```powershell
Select-String -Path '<RAM_MAP>' `
    -Pattern '^\.text\s|^\.cinit\s|^\.const\s|^\.econst\s|^\.pinit\s|^\.switch\s|^\.ebss\s|^\.stack\s'
```

对于 F28335，参考工程还检查了主要 Flash 地址范围 `0x300000-0x33FFFF`：

```powershell
Select-String -Path '<RAM_MAP>' -Pattern '^\S.*\s+[01]\s+003[0-3][0-9a-f]{4}\s+[0-9a-f]{8}'
```

不要简单地看到地址匹配就判失败，要区分：

- 真正可装载的 `.text/.cinit/.econst/...`
- `DSECT`
- `NOLOAD`
- 外设映射声明

只要仍存在需要加载的程序/常量 section 位于 Flash，就不能继续把它当 RAM-only 验证。

## 下载 RAM 镜像

确认 map 后，DSS 仍然可以使用：

```javascript
session.memory.loadProgram("<RAM_OUT>");
```

`loadProgram` 这个 API 名称本身不意味着一定烧 Flash；真正决定写 RAM 还是 Flash 的是 executable 中的 load address。

## 验证结束后

RAM 镜像是易失的：Reset 或掉电后会消失，目标会重新执行已有的持久化 Boot/Flash 镜像。

采用双输出方案时，验证完成后再次确认正常 Flash 配置仍保持正确的：

- entry point
- startup object
- linker cmd
- RAM test/helper 目录排除规则。
