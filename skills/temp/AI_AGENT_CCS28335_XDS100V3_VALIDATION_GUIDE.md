# CCS 7.2 下 C2000 工程的命令行编译、烧录与变量验证指南

> 本文面向后续 Agent，记录 Windows 环境下使用 CCS 7.2、XDS100V3 和 Debug Server Scripting（DSS）操作 C2000 目标的通用方法。文中的工程路径、目标配置、输出文件和变量名均使用占位符，执行时必须根据当前工程重新确认。

## 1. 固定工具路径

本机 CCS 7.2 安装位置：

```text
D:\04-software\CCSv720\ccsv7
```

常用组件：

```text
CCS GUI：
D:\04-software\CCSv720\ccsv7\eclipse\ccstudio.exe

GNU Make：
D:\04-software\CCSv720\ccsv7\utils\bin\gmake.exe

C2000 编译器目录：
D:\04-software\CCSv720\ccsv7\tools\compiler

DSS 启动器：
D:\04-software\CCSv720\ccsv7\ccs_base\scripting\bin\dss.bat

XDS100 识别工具：
D:\04-software\CCSv720\ccsv7\ccs_base\common\uscif\xds100serial.exe

JTAG 诊断工具：
D:\04-software\CCSv720\ccsv7\ccs_base\common\uscif\dbgjtag.exe

TI 自带 DSS 示例：
D:\04-software\CCSv720\ccsv7\ccs_base\scripting\examples

DSS API 文档：
D:\04-software\CCSv720\ccsv7\ccs_base\scripting\docs\DS_API
```

不同工程可能指定不同版本的 C2000 编译器。应优先读取工程生成的 `Debug\makefile` 或 `.cproject`，不要擅自改用目录中最新的编译器。

## 2. 开始前需要从当前工程确认的信息

每次换工程后，先确定以下参数：

```text
<PROJECT_DIR>     CCS 工程根目录，通常包含 .project 和 .cproject
<BUILD_DIR>       生成 makefile 的构建目录，例如 <PROJECT_DIR>\Debug
<CCXML>           与目标芯片、仿真器匹配的目标配置文件
<OUT_FILE>        编译生成的 COFF/ELF 可执行文件
<COMPILER_DIR>    该工程实际使用的 C2000 编译器目录
<SESSION_PATTERN> 多核目标使用的调试 session 匹配表达式；单核目标可尝试无参数方式
<VARIABLE>        用于判断程序运行状态的全局变量或表达式
<SAMPLE_MS>       两次采样间隔
```

推荐检查命令：

```powershell
Get-ChildItem -Force '<PROJECT_DIR>'
Get-ChildItem '<PROJECT_DIR>' -Recurse -File -Include .project,.cproject,*.ccxml,*.out,*.map
Select-String -Path '<BUILD_DIR>\makefile' -Pattern 'CG_TOOL_ROOT|Building target'
rg -n '<VARIABLE>' '<PROJECT_DIR>'
```

如果没有 `rg`，可使用：

```powershell
Get-ChildItem '<PROJECT_DIR>' -Recurse -File | Select-String -Pattern '<VARIABLE>'
```

不要沿用其他工程的 `.ccxml`、输出文件名、变量名或编译器版本。

## 3. 命令行编译

### 3.1 优先使用工程已有的生成式 makefile

CCS 工程已经生成 `<BUILD_DIR>\makefile` 时，最直接的方法是调用 CCS 随附的 `gmake.exe`：

```powershell
$ccsRoot = 'D:\04-software\CCSv720\ccsv7'
$compilerDir = '<COMPILER_DIR>'
$env:PATH = "$ccsRoot\utils\bin;$compilerDir\bin;" + $env:PATH

Set-Location '<BUILD_DIR>'
& "$ccsRoot\utils\bin\gmake.exe" clean all --no-print-directory
if ($LASTEXITCODE -ne 0) {
    throw "Build failed: $LASTEXITCODE"
}
```

编译后检查输出：

```powershell
Get-Item '<OUT_FILE>'
```

判断成功应同时考虑：

- `gmake` 退出码为 0。
- 日志包含目标链接完成信息。
- `<OUT_FILE>` 存在并且时间戳已更新。

clean 阶段可能提示某些旧产物不存在，例如 `Could Not Find`。如果最终 `gmake` 返回 0 且目标文件生成，这类删除提示通常不是编译失败。

### 3.2 何时使用 CCS headless build

如果工程没有可直接使用的构建目录，或 makefile 与工程配置不同步，可使用 CCS Eclipse 的 headless project build。但这通常需要单独的 CCS workspace、导入工程和正确的 configuration 名称，参数也受 CCS 版本影响。

因此优先级应为：

1. 使用工程已有 makefile。
2. 若 makefile 缺失或失效，再查 CCS 7.2 的 `com.ti.ccstudio.apps.projectBuild` headless 接口。
3. 不要手工拼接几十条 `cl2000` 编译命令，除非确实要重建构建系统。

## 4. RAM-only 下载与功能验证

### 4.1 RAM 验证适用范围

RAM 下载适合高频的“修改—编译—下载—运行—观察变量”循环。它不会擦写 Flash，下载通常更快，也不会消耗 Flash 擦写寿命。

在不依赖存储布局和启动介质的功能上，RAM 版与 Flash 版通常应得到一致结果，例如：

- 算法和业务逻辑。
- 中断和状态机。
- 大部分外设驱动与通信功能。
- 变量观察、断点和单步调试。

以下项目不能只用 RAM 版代替 Flash 版：

- BootROM、上电启动和复位启动路径。
- `code_start` 和 Flash-to-RAM 段复制。
- Flash wait-state、流水线及执行时序。
- 链接地址和存储布局相关问题。
- Flash 擦写、升级和校验流程。
- 掉电保存及脱离仿真器独立运行。

推荐流程：日常功能验证优先 RAM；阶段性验证和发布前必须再执行 Flash 烧录、复位、断电重启及脱离仿真器测试。

### 4.2 不能把 Flash 版 `.out` 直接当作 RAM 版加载

`.out` 中包含每个 section 的链接地址和 LOAD/RUN 地址。若 Flash linker cmd 定义：

```text
.text/.cinit/.econst:
LOAD = FLASH
RUN  = RAM
```

那么 DSS 调用：

```javascript
session.memory.loadProgram("<FLASH_OUT>");
```

会遵守 LOAD 地址并启动 Flash 编程器。虽然程序随后可能复制到 RAM 中执行，但这仍然先擦写了 Flash。

要实现完全不写 Flash，必须使用 RAM linker cmd 重新链接生成独立的 `<RAM_OUT>`。通常不需要重新编译全部 C 源码，可以复用同一构建目录中的 `.obj` 文件，仅重新执行链接。

#### 4.2.1 默认采用“双输出、单配置”方式

以后不要为了生成 RAM-only 镜像而修改 CCS 的 `.cproject`、切换 Debug 配置的 linker cmd，或把 Flash 启动文件设为 Exclude from Build。CCS 工程始终保持可直接编译、烧录和调试的 Flash 配置；RAM-only 作为同一批业务 `.obj` 的第二个链接输出，在工程之外的独立目录生成。

```text
CCS现有Flash配置（保持不动）
├─ 正常编译全部C/ASM源码
├─ 生成最新业务和设备支持.obj
└─ 正常链接Flash .out，供人工CCS烧录调试

独立RAM重链接（不进入CCS配置）
├─ 复用上述最新.obj
├─ 排除CodeStartBranch和Flash SectionCopy对象
├─ 使用独立RAM linker cmd和_c_int00入口
└─ 生成独立RAM .out，供AI通过DSS下载验证
```

这种方式只有一套编译选项和一套源文件对象，不会出现“CCS上次被切到RAM配置，下一次人工编译却找不到`code_start`”的问题。RAM linker文件、options file和输出目录应在`.cproject`中整体排除，防止CCS managed build自动把它们加入Flash链接。

### 4.3 链接前先检查 RAM 容量

从现有 map 文件读取主要 section 大小：

```powershell
Select-String -Path '<FLASH_MAP>' `
    -Pattern '^\.text\s|^\.cinit\s|^\.const\s|^\.econst\s|^\.pinit\s|^\.switch\s|^\.ebss\s|^\.stack\s|^\.esysmem\s'
```

对 F28335，应分别核对：

- 程序、常量和初始化表能否装入分配给 PAGE 0 的 M/L RAM。
- `.ebss`、stack、heap 和用户数据段能否装入分配给 PAGE 1 的 RAM。
- 同一物理 RAM 块不能同时在 PAGE 0 和 PAGE 1 中重复分配，否则会发生代码/数据覆盖。
- 保留 BootROM、栈、外设寄存器和 DMA 所需区域。

如果片内 RAM 不够，不能靠忽略 linker overflow 继续验证。应减少功能、关闭大缓冲区，或明确使用外部 RAM；使用外部 RAM 时还要保证 XINTF 在执行相关代码前已经正确初始化。

### 4.4 RAM linker cmd 的关键原则

RAM 版需要将所有可装载 section 放到 RAM。下面仅表示结构，实际地址和长度必须根据目标芯片手册及工程 map 调整：

```text
MEMORY
{
PAGE 0:
    PROGRAM_RAM : origin = <PROGRAM_RAM_ORIGIN>, length = <PROGRAM_RAM_LENGTH>
    ADC_CAL     : origin = <ADC_CAL_ORIGIN>,     length = <ADC_CAL_LENGTH>
    IQTABLES    : origin = <IQTABLES_ORIGIN>,    length = <IQTABLES_LENGTH>
    FPUTABLES   : origin = <FPUTABLES_ORIGIN>,   length = <FPUTABLES_LENGTH>

PAGE 1:
    STACK_RAM   : origin = <STACK_RAM_ORIGIN>,   length = <STACK_RAM_LENGTH>
    DATA_RAM    : origin = <DATA_RAM_ORIGIN>,    length = <DATA_RAM_LENGTH>
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

    .stack      : > STACK_RAM,   PAGE = 1
    .ebss       : > DATA_RAM,    PAGE = 1
    .esysmem    : > DATA_RAM,    PAGE = 1

    IQmathTables : > IQTABLES,   PAGE = 0, TYPE = NOLOAD
    FPUmathTables: > FPUTABLES,  PAGE = 0, TYPE = NOLOAD
    .adc_cal     : > ADC_CAL,    PAGE = 0, TYPE = NOLOAD
}
```

如果某些对象仍声明了 Flash/security/boot section，应将这些 section 设为 `TYPE = DSECT`，或从 RAM 链接中排除对应对象，确保它们不会成为可装载 Flash section。

### 4.5 RAM 入口与 Flash 段复制代码

典型 Flash 工程可能采用：

```text
code_start
→ 关闭看门狗
→ copy_sections 从 Flash 复制到 RAM
→ _c_int00
→ main
```

RAM-only 版本不应继续走这条路径，否则 `copy_sections` 会从旧 Flash 内容复制并覆盖刚下载的 RAM 内容。

推荐做法：

1. RAM 链接时排除 `CodeStartBranch` 和 Flash `SectionCopy` 对象。
2. 将链接入口改为 `_c_int00`：

   ```text
   --entry_point=_c_int00
   ```

3. 让调试器装载 `<RAM_OUT>` 后直接从 C 运行环境入口启动。

如果工程有自定义 RAM 初始化入口，应使用工程实际入口，不能机械套用 `_c_int00`。

### 4.6 复用 `.obj` 重新链接 RAM 输出

可创建 linker options/command file，列出：

- 外设 header linker cmd。
- 当前构建产生的全部业务 `.obj`。
- 需要的驱动和设备支持 `.obj`。
- RAM linker cmd。
- 工程库和正确版本的 RTS 库。
- 不包含 Flash 启动和 Flash 段复制对象。

TI 编译器读取 options file 的语法为：

```text
--cmd_file=<OPTIONS_FILE>
```

注意：`-z` 必须在 options file 的对象和 linker cmd 之前生效，否则 `.cmd` 可能被编译器误当作 C 源文件。options file 可以这样开头：

```text
-z
"<HEADER_LINKER_CMD>"
"<OBJECT_1>"
"<OBJECT_2>"
"<RAM_LINKER_CMD>"
"<PROJECT_LIBRARY>"
"<COMPILER_DIR>/lib/rts2800_fpu32.lib"
```

重新链接示例：

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

if ($LASTEXITCODE -ne 0) {
    throw "RAM link failed: $LASTEXITCODE"
}
```

RTS 库最好使用绝对路径或保证 search path 在库参数之前生效。否则可能出现：

```text
cannot find file "rts2800_fpu32.lib"
undefined symbol _c_int00
```

#### 4.6.1 当前F28335工程的固定执行方法

当前工程已经按“双输出、单配置”方式准备好以下文件：

```text
CCS工程：
D:\05-work\29_gpu_test\codex_proj\dsp_proj\MCU_2833x_Metre

CCS Flash构建目录：
Debug

独立RAM目录：
ram_test

RAM链接对象清单：
ram_test\ram_link.opt

RAM linker cmd：
ram_test\F28335_nonBIOS_ram.cmd

RAM输出：
ram_test\DSP_Meter_ram.out
```

新会话默认执行以下步骤，不修改`.cproject`和`Debug\makefile`。

第一步，在`Debug`目录调用CCS原有makefile。源码有变化时会重新编译相关`.obj`，同时仍生成可供CCS烧录的Flash输出：

```powershell
& 'D:\04-software\CCSv720\ccsv7\utils\bin\gmake.exe' -j4 all
```

第二步，仍在`Debug`目录复用最新`.obj`，单独链接RAM输出：

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

第三步，检查RAM map满足4.7节的判据，再设置可写的TI应用数据目录并通过DSS下载。下面的命令从`codex_proj`目录执行：

```powershell
$env:TI_APPDATA_DIR = 'D:\05-work\29_gpu_test\codex_proj\.ti-appdata'
New-Item -ItemType Directory -Force -Path $env:TI_APPDATA_DIR | Out-Null

& 'D:\04-software\CCSv720\ccsv7\ccs_base\scripting\bin\dss.bat' `
    'D:\05-work\29_gpu_test\codex_proj\dsp_proj\ccs28335_run_verify.js' `
    'D:\05-work\29_gpu_test\codex_proj\dsp_proj\MCU_2833x_Metre\XDS100V3.ccxml' `
    'D:\05-work\29_gpu_test\codex_proj\dsp_proj\MCU_2833x_Metre\ram_test\DSP_Meter_ram.out' `
    1000
```

验收时必须看到运行计数或当前任务的业务变量发生预期变化。DSS脚本退出码为0但只输出`Access denied`时不算通过，应设置`TI_APPDATA_DIR`后重试。

第四步，完成后复查Flash配置仍满足：入口为`code_start`，包含`DSP28xxx_CodeStartBranch.obj`、`DSP28xxx_SectionCopy_nonBIOS.obj`和`F2833x_nonBIOS_flash.cmd`，且`ram_test`仍被CCS工程排除。不要手工修改生成的`Debug\makefile`，因为CCS clean/build会重新生成它。

这里所说的RAM“烧录”实际是仿真器下载：它会替换当前芯片RAM中的程序并立即运行，但不擦写Flash。复位或断电后RAM镜像消失，DSP仍从CCS此前烧录的Flash程序启动。

### 4.7 下载前确认 RAM `.out` 不包含 Flash 可装载段

不能只根据文件名判断。应检查 RAM map 中所有主要输出 section 的地址：

```powershell
Select-String -Path '<RAM_MAP>' `
    -Pattern '^\.text\s|^\.cinit\s|^\.const\s|^\.econst\s|^\.pinit\s|^\.switch\s|^\.ebss\s|^\.stack\s'
```

还应搜索目标芯片的 Flash 地址范围，确认没有可装载输出 section。例如 F28335 的 Flash 主要位于 `0x300000～0x33FFFF`：

```powershell
Select-String -Path '<RAM_MAP>' -Pattern '^\S.*\s+[01]\s+003[0-3][0-9a-f]{4}\s+[0-9a-f]{8}'
```

若只出现 `DSECT`、`NOLOAD` 或外设映射结构，不会产生 Flash 编程；若 `.text`、`.cinit`、`.econst` 等可装载段仍在 Flash 地址，必须先修正 linker cmd。

### 4.8 使用 DSS 下载 RAM 并验证

确认 map 后，仍使用：

```javascript
session.memory.loadProgram("<RAM_OUT>");
```

CCS loader 会按照 RAM `.out` 中的地址直接写入 RAM，不会因为 API 名称是 `loadProgram` 就自动擦写 Flash。是否使用 Flash 编程器取决于 `.out` 的可装载地址。

后续默认在目标持续运行时读取普通全局变量，并按相同方式清理 session；需要一致快照或实时访问不受支持时才暂停目标。

本机 F28335 已完成一次实际 RAM-only 验证：

- RAM `.out` 的 `.text/.cinit/.econst/.ebss/.stack` 均位于片内 RAM。
- map 中没有 Flash 地址范围内的可装载输出 section。
- DSS 成功下载并启动程序。
- 启动初始化后，运行计数变量从初始值开始明显增长，证明 RAM 程序运行成功。
- 连接、RAM 下载、启动及约 2 秒变量采样总计约 10 秒，明显快于 Flash 擦写验证。
- 验证结束后目标继续运行；复位或掉电后 RAM 程序消失，设备重新执行原 Flash 内容。
- 在CCS Flash配置完全不变的条件下再次实测通过：独立链接入口为`_c_int00`，`.text`位于`0x8000`，DSS下载后`task_run_cnt`由`0`增长到`7072`；随后复查`.cproject`和Debug makefile仍保持`code_start`及Flash启动对象/链接文件。

## 5. 检查 XDS100V3 是否可用

烧录前先检查仿真器，避免把设备占用误判成驱动或硬件故障。

### 5.1 检查可能占用仿真器的进程

```powershell
Get-Process | Where-Object {
    $_.ProcessName -match 'ccstudio|eclipsec|java|DebugServer|DSLite'
} | Select-Object ProcessName,Id,Path
```

CCS GUI 的活动调试会话会独占 XDS100 的 JTAG 通道。运行 DSS 前应正常结束 GUI 调试会话并关闭 CCS。

不要在可能有未保存内容时直接强制杀死 `ccstudio.exe`。优先让用户正常关闭，或只发送正常关闭请求并确认进程确实退出。

### 5.2 使用 TI 工具识别 XDS100

```powershell
& 'D:\04-software\CCSv720\ccsv7\ccs_base\common\uscif\xds100serial.exe'
```

正常时会列出 VID/PID、XDS100 类型、序列号和描述。

如果返回：

```text
No XDS100 emulators were found on the system.
```

按以下顺序处理：

1. 检查 CCS GUI 或其他调试工具是否占用探针。
2. 结束占用后重新运行 `xds100serial.exe`。
3. 检查 Windows 是否枚举了 FTDI/XDS100 接口。
4. 最后再检查驱动、USB 线缆、EEPROM 和硬件。

检查 Windows PnP 枚举：

```powershell
pnputil /enum-devices /connected | Select-String -Pattern 'XDS|FTDI|VID_0403' -Context 2,4
pnputil /enum-drivers | Select-String -Pattern 'xds100|ftdi|Texas Instruments' -Context 3,5
```

## 6. 使用 DSS 连接、装载程序和读取变量

DSS 使用 JavaScript 控制 CCS Debug Server，不需要启动 CCS GUI。

### 6.1 设置可写的 TI 数据目录

受限执行环境中，TI 工具可能无法写入默认 AppData，并提示：

```text
Access denied
If this continues, please run fsclean or set TI_APPDATA_DIR to directory you have permissions to access
```

执行 DSS 前将 `TI_APPDATA_DIR` 指向当前工作区内可写目录：

```powershell
$env:TI_APPDATA_DIR = '<WRITABLE_DIR>\ti-appdata'
New-Item -ItemType Directory -Force -Path $env:TI_APPDATA_DIR | Out-Null
```

### 6.2 通用 DSS 脚本框架

创建一个临时或工程辅助 JavaScript，例如 `<DSS_SCRIPT>`：

```javascript
importPackage(Packages.com.ti.debug.engine.scripting);
importPackage(Packages.com.ti.ccstudio.scripting.environment);
importPackage(Packages.java.lang);

var ccxml = arguments[0];
var program = arguments[1];
var variable = arguments[2];
var sampleMs = arguments.length > 3 ? parseInt(arguments[3], 10) : 1000;

var env = ScriptingEnvironment.instance();
var server = null;
var session = null;
var passed = false;

function log(message) {
    System.out.println("[CCS-DSS] " + message);
}

try {
    env.setScriptTimeout(300000);
    server = env.getServer("DebugServer.1");
    server.setConfig(ccxml);

    // 单核且 ccxml 中只有一个目标时使用无参数形式。
    session = server.openSession();

    // 多核目标应改用实际 session 名称匹配，例如：
    // session = server.openSession("<SESSION_PATTERN>");

    session.target.connect();

    session.options.setBoolean("AddCIOBreakpointAfterLoad", false);
    session.options.setBoolean("AddCEXITbreakpointAfterLoad", false);
    session.options.setBoolean("AutoRunToLabelOnRestart", false);
    session.options.setString("VerifyAfterProgramLoad", "Full verification");

    session.memory.loadProgram(program);
    log("Program load/flash verify completed.");

    session.target.runAsynch();
    Thread.sleep(sampleMs);

    // 默认在目标持续运行时读取普通全局变量，不主动 halt。
    var first = Number(session.expression.evaluate(variable));
    log(variable + " sample 1 = " + first);

    var current = first;
    var sampleNumber = 2;
    while (current <= first && sampleNumber <= 6) {
        Thread.sleep(sampleMs);
        current = Number(session.expression.evaluate(variable));
        log(variable + " sample " + sampleNumber + " = " + current);
        sampleNumber++;
    }

    if (current > first) {
        log("PASS: variable increased by " + (current - first));
        passed = true;
    } else {
        log("FAIL: variable did not increase");
    }

    // 此读取方式未暂停目标；正常情况下目标始终处于运行状态。
} catch (err) {
    log("ERROR: " + err);
    if (err.javaException) {
        log("DETAIL: " + err.javaException.getMessage());
    }
} finally {
    try {
        if (session !== null) {
            if (session.target.isConnected()) {
                session.target.disconnect();
            }
            session.terminate();
        }
    } catch (cleanupError) {
        log("Cleanup warning: " + cleanupError);
    }

    try {
        if (server !== null) {
            server.stop();
        }
    } catch (serverError) {
        log("Server cleanup warning: " + serverError);
    }
}

System.exit(passed ? 0 : 1);
```

这里假设 `<VARIABLE>` 是单调递增的运行计数器。若当前工程使用心跳位、状态机状态、时间戳或其他指标，应按其语义调整成功条件，不能机械套用“大于首次值”。

### 6.3 执行 DSS

```powershell
$dss = 'D:\04-software\CCSv720\ccsv7\ccs_base\scripting\bin\dss.bat'

$dssOutput = & $dss `
    '<DSS_SCRIPT>' `
    '<CCXML>' `
    '<OUT_FILE>' `
    '<VARIABLE>' `
    1000 2>&1

$dssOutput | ForEach-Object { Write-Host $_ }
```

### 6.4 默认使用运行中变量读取

对于 RAM 中的普通全局变量、运行计数器、状态值和心跳变量，默认采用不暂停目标的表达式读取：

```javascript
session.target.runAsynch();

var haltedBefore = session.target.isHalted();
var value = session.expression.evaluate("<VARIABLE>");
var haltedAfter = session.target.isHalted();
```

在 C2000 工程中通常需要启用实时调试模式，例如程序执行：

```c
ERTM;
```

并确保 CCS/目标配置允许 Real-time Memory Access。成功时 `haltedBefore` 和 `haltedAfter` 都应为 `false`。

表达式读取过程为：

```text
变量名
→ CCS 从 .out 调试符号解析地址和类型
→ XDS100 通过 JTAG 实时读取目标内存
→ CCS 按变量类型返回结果
```

它不需要目标程序执行专用指令，也不依赖串口、CAN 等应用通信协议。

本机 XDS100V3/F28335 连续读取 500 次的实测结果：

```text
运行中 expression.evaluate：约 1.19 ms/次，约 838 次/秒
暂停后 expression.evaluate：约 0.66 ms/次，约 1520 次/秒
```

运行中读取略慢，但不会破坏程序连续运行，更适合作为默认监测方式。

运行中读取的限制：

- 多个变量是依次读取，不是同一时刻的原子快照。
- CPU 可能正在修改变量；多字变量可能出现撕裂读，需结合数据发布协议处理。
- 局部变量、调用栈、CPU 寄存器或某些特殊地址可能要求暂停。
- 高频 JTAG 读取可能产生总线竞争和少量实时性扰动。
- 具有“读清零”等副作用的外设寄存器不能随意连续读取。

只有在需要严格一致快照、检查调用栈/局部变量、实时读取不受支持或实时读取报错时，才主动执行：

```javascript
session.target.halt();
var value = session.expression.evaluate("<VARIABLE>");
```

### 6.5 大段连续数据使用 `memory.readData()`

读取数组、采样缓冲区、波形数据或一段连续 RAM 时，不要逐个调用 `expression.evaluate()`。先从符号表解析一次首地址：

```javascript
var address = session.symbol.getAddress("<BUFFER_SYMBOL>");
```

然后批量读取：

```javascript
var data = session.memory.readData(
    Memory.Page.DATA,
    address,
    16,              // 每个元素的 bit 数，根据实际类型填写
    count,
    false            // false 表示按无符号数返回
);
```

读取单个 32 位变量也可以直接按地址读取：

```javascript
var address = session.symbol.getAddress("<VARIABLE>");
var value = session.memory.readData(
    Memory.Page.DATA,
    address,
    32,
    false
);
```

本机运行中单次 32 位直接内存读取实测约为：

```text
约 1.05 ms/次，约 950 次/秒
```

单变量时它只比运行中的表达式读取快约 10%～15%；读取连续大块数据时，一次调用返回多个元素，可以显著减少 JTAG/API 往返次数，优势更明显。

使用直接内存读取时必须自己保证：

- 地址属于正确的 `Memory.Page`。
- C28x 使用 16 位 word addressing，地址增量不是通用字节地址语义。
- `nTypeSize` 和元素数量与实际数据类型一致。
- 正确处理有符号数、端序和多字变量一致性。
- `.out` 符号与当前目标中实际运行的程序版本一致。

## 7. DSS 的关键兼容性注意点

### 7.1 不要随意猜单核目标的 session 名称

用芯片名称正则调用：

```javascript
server.openSession(".*<DEVICE_NAME>.*");
```

可能报：

```text
Could not open session. No devices found matching: ...
```

原因是 CCS 7.2 暴露的内部 session 名称不一定包含 ccxml 中显示的芯片名称。

对于已确认只有一个调试目标的 ccxml，优先使用 TI 示例中的无参数方式：

```javascript
session = server.openSession();
```

多核设备不能盲目使用无参数形式，应先通过配置或 DSS API 确认目标 session 名称，再分别打开所需核。

### 7.2 通常应关闭装载后的自动运行到标签

`session.memory.loadProgram()` 在装载完成后会 restart 目标。若 CCS 启用了自动运行到 `main` 或其他标签，而工程使用自定义启动入口、启动代码耗时较长或目标标签不可达，可能出现：

```text
Timed out while waiting for target to halt after an auto-run to "main"
```

烧录验证脚本应在 `loadProgram()` 前设置：

```javascript
session.options.setBoolean("AutoRunToLabelOnRestart", false);
```

如果确实需要 run-to-main 调试，应根据该工程启动流程单独决定，不要沿用烧录验证脚本的假设。

### 7.3 Flash 编程应启用校验并留足超时

```javascript
env.setScriptTimeout(300000);
session.options.setString("VerifyAfterProgramLoad", "Full verification");
session.memory.loadProgram(program);
```

超时时间应覆盖连接、擦除、编程、校验和目标 restart。大程序、慢速 JTAG 或低速 Flash 可能需要更长时间。

### 7.4 冷启动阶段不要过早判定失败

程序在时钟、外设、Flash/RAM 拷贝和中断初始化期间，运行计数器可能暂时保持初始值。

建议：

- 默认采样间隔从 1000 ms 开始。
- 在有限次数内保持目标运行并重复读取；实时访问不受支持时再改用“暂停—读取—恢复”。
- 设置总体超时，避免目标异常时无限等待。
- 只有观察到符合变量语义的状态变化才判定运行成功。

### 7.5 验证完成后恢复运行并清理会话

默认运行中读取不需要恢复动作。如果脚本因为一致性要求或兼容性问题暂停了目标，成功后应根据任务要求恢复运行：

```javascript
session.target.runAsynch();
```

随后执行：

```javascript
session.target.disconnect();
session.terminate();
server.stop();
```

使用 `try/finally` 保证异常路径也清理资源，否则可能残留调试会话并导致下一次连接失败。

## 8. 常见错误及处理顺序

### 8.1 `Error -151` / `SC_ERR_FTDI_OPEN`

典型信息：

```text
One of the FTDI driver functions used during the connect returned bad status or an error.
```

它可能由以下原因导致：

- CCS GUI 或其他工具已经打开 XDS100 的 JTAG 通道。
- 无效的探针序列号配置。
- FTDI/XDS100 驱动问题。
- EEPROM 配置异常。
- USB 线缆、供电或探针硬件问题。

实际排查顺序：

1. 检查并释放 CCS GUI/其他调试进程。
2. 运行 `xds100serial.exe`。
3. 检查 Windows PnP 枚举和驱动。
4. 检查 ccxml 是否指定了错误序列号。
5. 重新插拔探针、检查 USB 线缆和目标供电。
6. 最后才考虑重装驱动、EEPROM 或硬件故障。

不要一看到 `-151` 就立即重装驱动。

### 8.2 连接成功但装载后等待 `main` 超时

确认脚本是否在 `loadProgram()` 前执行：

```javascript
session.options.setBoolean("AutoRunToLabelOnRestart", false);
```

如果超时后出现“可能残留 breakpoint opcode”的提示，下一次连接应重新装载并校验程序，不要直接假定 Flash 内容完整。

### 8.3 变量读取失败

检查：

- `<OUT_FILE>` 是否包含调试符号。
- 变量是否被优化掉。
- 名称是否需要 C 编译器前缀、文件作用域限定或结构体路径。
- 当前是否加载了与 Flash 中程序一致的符号文件。
- 当前内存区域是否支持运行中实时读取；不支持时先暂停目标再重试。
- 表达式类型能否正确转为 JavaScript `Number`。

可先用 map 文件或链接信息确认符号：

```powershell
Select-String -Path '<MAP_FILE>' -Pattern '<VARIABLE>'
```

### 8.4 DSS 日志报错但外层退出码仍为 0

CCS 7.2 的 `dss.bat` 通过 Eclipse headless launcher 执行。实测 JavaScript 内部失败或调用 `System.exit(1)` 后，外层 PowerShell 仍可能得到退出码 0。

因此必须检查明确的成功标记。PowerShell 应先把输出数组拼接为字符串：

```powershell
$dssText = $dssOutput -join [Environment]::NewLine
if ($dssText -notmatch '\[CCS-DSS\] PASS:') {
    throw 'DSS verification failed; inspect output above.'
}
```

不要直接写：

```powershell
if ($dssOutput -notmatch 'PASS') { ... }
```

因为 `$dssOutput` 是数组，`-notmatch` 会返回所有不匹配的元素，可能在存在 PASS 行时仍误判失败。

## 9. AI 调试模式与常驻交互式 DSS

### 9.1 一次性脚本与交互式调试的选择

DSS 支持两种使用方式：

1. 一次性批处理脚本：预先写好连接、下载、运行、读取、判定和退出流程，然后一次执行到底。
2. 常驻交互式调试：保持同一个 Debug Server、DebugSession 和 XDS100 连接，由外部命令行逐条发送调试命令。

选择原则：

| 场景 | 推荐方式 |
|---|---|
| 未知 bug、需要根据现场状态决定下一步 | 常驻交互式 DSS |
| AI 自主断点、单步、调用栈分析 | 常驻交互式 DSS |
| 固定功能回归、启动后检查若干变量 | 一次性 DSS 脚本 |
| 大批量自动测试 | 一次性脚本或测试框架 |
| 修改后快速调试 | RAM 下载 + 常驻交互式 DSS |
| 发布前最终确认 | Flash 下载 + 自动验证 + 断电重启 |

未知问题不适合一开始把完整调试过程写死。AI 应根据每一步结果动态决定下一条命令，例如：

```text
设置函数入口断点
→ 命中后读取参数、局部变量和调用栈
→ 根据异常状态决定 Step Into 或 Step Over
→ 在可疑分支设置新的源码断点
→ 继续运行并检查变量变化
→ 找到原因后修改源码
→ 重新编译并 RAM 下载
→ 复现和验证修复
→ 最后生成固定回归脚本
```

### 9.2 为什么要保持同一个调试 session

如果每条命令都单独运行一次 `dss.bat`，每次都会重复：

```text
启动 Eclipse headless
→ 创建 Debug Server
→ 连接仿真器
→ 加载符号
→ 执行一条命令
→ 断开并退出
```

这样速度慢，而且断点 ID、当前 PC、暂停位置、调用栈等调试状态难以连续保存。

交互式调试应启动一个长期运行的 DSS 服务，让它持有：

```text
ScriptingEnvironment
DebugServer
DebugSession
已加载的符号
断点列表
当前运行/暂停状态
```

外部 PowerShell、Python 或 AI 客户端通过标准输入、TCP socket 或其他 IPC 逐条发送命令。CCS 7.2 自带参考实现：

```text
D:\04-software\CCSv720\ccsv7\ccs_base\scripting\examples\TestServer
```

实际给 AI 使用时，建议在该思路上实现更小、更明确的命令服务，而不是直接依赖 GUI。

### 9.3 推荐的交互命令集

```text
connect
load-ram <out>
load-flash <out>
symbols <out>

break <symbol>
break <file>:<line>
breaks
delete <id>
delete-all

continue
halt
status
restart
reset

step
next
finish
stepi
nexti

print <expression>
x <address> <bits> <count>
set <expression>=<value>

pc
reg <name>
regs
bt
disasm <address> <count>

detach
quit
```

命令应映射到 DSS API，例如：

```javascript
// 运行控制
session.target.runAsynch();
session.target.halt();
session.target.isHalted();

// 源码单步
session.target.sourceStep.into();
session.target.sourceStep.over();
session.target.sourceStep.out();

// 汇编单步
session.target.asmStep.into();
session.target.asmStep.over();

// 断点
session.breakpoint.add("<SYMBOL>");
session.breakpoint.add("<SOURCE_FILE>", <LINE>);
session.breakpoint.remove(<ID>);
session.breakpoint.removeAll();

// 表达式、内存和调用栈
session.expression.evaluate("<EXPRESSION>");
session.memory.readData(Memory.Page.DATA, address, bits, count, false);
session.callStack.print();
```

### 9.4 `run()` 与 `runAsynch()` 的区别

```javascript
session.target.run();
```

是同步调用。它会阻塞当前 DSS 命令，直到目标因为断点、异常或其他原因停止。适合一次性脚本中的“运行到预期断点”，但断点不命中时可能长时间阻塞。

```javascript
session.target.runAsynch();
```

启动目标后立即返回，更适合交互式服务。AI 随后可以发送：

```text
status
halt
print <variable>
```

交互服务应优先使用 `runAsynch()`，并通过事件或轮询报告断点命中。即使使用同步 `run()`，也必须设置明确超时，不能无限等待。

### 9.5 AI 调试的推荐工作流

```text
1. 阅读源码、map、linker cmd 和已有日志。
2. 编译 RAM 版本，确认没有 Flash 可装载段。
3. 启动常驻 DSS session 并下载 RAM 程序。
4. 在目标函数或可疑源码行设置断点。
5. 异步继续运行并等待断点事件。
6. 命中后读取 PC、调用栈、参数、局部变量和相关全局状态。
7. 根据实际结果选择 step、next、finish 或新增断点。
8. 找到根因后修改源码并重新构建。
9. RAM 下载复现并验证修复。
10. 将已经确定的复现步骤写成一次性 DSS 回归脚本。
11. 最终使用 Flash 版本验证真实启动和独立运行。
```

调试过程中不要无目的地高频单步。应先利用源码、断点和状态变量缩小范围，再进入可疑函数或分支。

### 9.6 推荐返回结构化结果

给 AI 使用的调试服务最好返回 JSON，而不是只输出自然语言日志。例如：

```json
{
  "event": "breakpoint_hit",
  "breakpoint_id": 3,
  "pc": "0x00A955",
  "file": "Main.c",
  "line": 101,
  "function": "main",
  "locals": {
    "index": 2
  }
}
```

其他建议事件：

```text
connected
program_loaded
running
halted
breakpoint_hit
step_complete
expression_result
memory_result
target_error
disconnected
```

每个响应至少应包含成功状态、错误码/错误文本和当前目标运行状态。这样 AI 能可靠决定下一步，不需要从复杂 CCS 日志中猜测状态。

### 9.7 已验证的命令行调试能力

本机 CCS 7.2、XDS100V3 和 F28335 已实际验证以下 DSS 操作：

- 按符号设置断点并准确命中。
- 按源码文件和行号设置断点并准确命中。
- 读取 PC、全局变量和函数局部变量。
- 打印从当前函数到 C 运行库入口的调用栈。
- 源码级 Step Over，并观察语句执行后的变量变化。
- 删除单个断点和全部断点。
- 调试结束后恢复目标运行。

这些能力不要求 CCS GUI 或鼠标操作。一次性测试脚本只是验证 API；正式让 AI 调试时应将同样的 API 暴露为常驻交互命令。

## 10. 推荐的 Agent 操作顺序

处理任意新 C2000 工程时按以下顺序执行：

1. 确认当前工程目录、构建目录、ccxml、输出文件、编译器和验证变量。
2. 阅读 `makefile`/`.cproject`，不要沿用其他工程的构建参数。
3. 检查 CCS GUI 和其他调试进程是否占用仿真器。
4. 用 `xds100serial.exe` 确认探针可见。
5. 使用工程 makefile 执行 clean/build，并检查新输出文件。
6. 创建或调整通用 DSS 脚本，传入当前工程的 ccxml、out 文件和变量。
7. 设置可写的 `TI_APPDATA_DIR`。
8. DSS 连接目标，关闭不适用的自动 run-to-label，装载并完整校验程序。
9. 运行目标，默认不暂停地采样普通全局变量；大段连续数据使用批量 `memory.readData()`。
10. 根据变量实际语义判断程序是否运行。
11. 成功后恢复目标运行，并在所有路径清理 session/server。
12. 同时检查 DSS 日志成功标记，不只依赖进程退出码。

## 11. 通用成功判据

一次完整验证通常应满足：

- 编译工具退出码为 0。
- 输出文件存在且时间戳已更新。
- XDS100 能被 TI 工具识别。
- DSS 成功连接目标。
- 程序装载和 Flash 校验完成。
- 目标运行后，选定的状态变量按预期变化。
- 日志出现明确的 PASS 标记。
- 成功后目标处于任务要求的运行/暂停状态。
- 调试 session 和 server 已正确释放。

如果当前项目的成功条件不是计数器递增，应替换变量判断逻辑，但编译、探针检查、DSS 连接、装载校验和资源清理方法仍可复用。
