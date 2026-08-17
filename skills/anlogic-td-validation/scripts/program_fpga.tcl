# Legacy 安陆 AL-Link 直接 SRAM 下载辅助脚本。
#
# TD 2026.1 SP2 使用环境变量传参：
#   ANLOGIC_BIT_FILE      必填，bitstream 绝对路径，Windows 下使用 /
#   ANLOGIC_CABLE_INDEX   可选，默认 0
#   ANLOGIC_JTAG_MHZ      可选，默认 5
#
# 只向 td_commands_prompt.exe 传 Tcl 脚本路径。不要追加 argv；该版本会把
# 追加参数交给内部 source 命令，并在脚本执行前报 wrong # args。
#
# 本脚本仅用于已经验证过的 legacy Anlogic AL-Link 数字 -cable 直连模式。
# 不要直接套用到 AL-LINK-FT/HwServer 或远程 cable 配置。

if {![info exists ::env(ANLOGIC_BIT_FILE)] || $::env(ANLOGIC_BIT_FILE) eq ""} {
    puts "ERROR: ANLOGIC_BIT_FILE is required"
    puts "PROGRAM_RESULT=FAIL"
    exit 2
}

set bit_file $::env(ANLOGIC_BIT_FILE)
set cable_index 0
set jtag_mhz 5

if {[info exists ::env(ANLOGIC_CABLE_INDEX)] && $::env(ANLOGIC_CABLE_INDEX) ne ""} {
    set cable_index $::env(ANLOGIC_CABLE_INDEX)
}
if {[info exists ::env(ANLOGIC_JTAG_MHZ)] && $::env(ANLOGIC_JTAG_MHZ) ne ""} {
    set jtag_mhz $::env(ANLOGIC_JTAG_MHZ)
}

if {![string is integer -strict $cable_index] || $cable_index < 0} {
    puts "ERROR: cable_index must be a non-negative integer"
    puts "PROGRAM_RESULT=FAIL"
    exit 2
}

if {![string is integer -strict $jtag_mhz] || $jtag_mhz <= 0} {
    puts "ERROR: jtag_mhz must be a positive integer"
    puts "PROGRAM_RESULT=FAIL"
    exit 2
}

set bit_file [file normalize $bit_file]

if {![file exists $bit_file]} {
    puts "ERROR: bit file not found: $bit_file"
    puts "PROGRAM_RESULT=FAIL"
    exit 2
}

puts "PROGRAM_BIT=$bit_file"
puts "PROGRAM_CABLE=$cable_index"
puts "PROGRAM_JTAG_MHZ=$jtag_mhz"

set rc [catch {
    download \
        -bit $bit_file \
        -mode jtag_burst \
        -spd $jtag_mhz \
        -cable $cable_index
} result options]

puts "DOWNLOAD_RC=$rc"
puts "DOWNLOAD_RESULT=$result"

if {$rc != 0} {
    if {[dict exists $options -errorinfo]} {
        puts [dict get $options -errorinfo]
    }
    puts "PROGRAM_RESULT=FAIL"
    exit 1
}

puts "PROGRAM_RESULT=PASS"
exit 0
