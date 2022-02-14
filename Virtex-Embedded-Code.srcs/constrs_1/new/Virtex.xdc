# Virtex.xdc - the contraints file for Virtex's FPGA
# this file connects the ports from Top.sv to physical BGA pads
# this file should always match `34-Engineering/Virtex-PCBs`

#config
set_property BITSTREAM.GENERAL.COMPRESS TRUE [current_design]
set_property BITSTREAM.CONFIG.CONFIGRATE 33 [current_design]
set_property CONFIG_VOLTAGE 3.3 [current_design]
set_property CFGBVS VCCO [current_design]
set_property BITSTREAM.CONFIG.SPI_32BIT_ADDR NO [current_design]
set_property BITSTREAM.CONFIG.SPI_BUSWIDTH 1 [current_design]
set_property BITSTREAM.CONFIG.SPI_FALL_EDGE YES [current_design]

# Master (100MHz) Clock N14
set_property PACKAGE_PIN N14 [get_ports CLK]
set_property IOSTANDARD LVCMOS33 [get_ports CLK]
create_clock -period 10.000 -name sys_clk_pin -waveform {0.000 5.000} -add [get_ports CLK]

# USB
set_property PACKAGE_PIN F14 [get_ports {USB_FSDI}]
set_property PACKAGE_PIN F15 [get_ports {USB_FSCLK}]
set_property PACKAGE_PIN G16 [get_ports {USB_FSDO}]
set_property PACKAGE_PIN H16 [get_ports {USB_FSCTS}]
# set_property PACKAGE_PIN F14 [get_ports {USB_BD[0]}]
# set_property PACKAGE_PIN F15 [get_ports {USB_BD[1]}]
# set_property PACKAGE_PIN G16 [get_ports {USB_BD[2]}]
# set_property PACKAGE_PIN H16 [get_ports {USB_BD[3]}]
# set_property PACKAGE_PIN J16 [get_ports {USB_BD[4]}]
# set_property PACKAGE_PIN J15 [get_ports {USB_BD[5]}]
# set_property PACKAGE_PIN H14 [get_ports {USB_BD[6]}]
# set_property PACKAGE_PIN H13 [get_ports {USB_BD[7]}]
# set_property PACKAGE_PIN H12 [get_ports {USB_BC[0]}]
# set_property PACKAGE_PIN H11 [get_ports {USB_BC[1]}]
# set_property PACKAGE_PIN F12 [get_ports {USB_BC[2]}]
# set_property PACKAGE_PIN D15 [get_ports {USB_BC[3]}]
# set_property PACKAGE_PIN E11 [get_ports {USB_BC[4]}]
# set_property PACKAGE_PIN D13 [get_ports {USB_BC[5]}]
# set_property PACKAGE_PIN C16 [get_ports {USB_BC[6]}]
set_property PACKAGE_PIN F13 [get_ports {USB_SUS}]
set_property PACKAGE_PIN A9 [get_ports {USB_PWREN}]
set_property PACKAGE_PIN B12 [get_ports {USB_ON}]
set_property IOSTANDARD LVCMOS33 [get_ports {USB_*}]

# RoboRIO
set_property PACKAGE_PIN N12 [get_ports {RIO_SDA}]
set_property PACKAGE_PIN N11 [get_ports {RIO_SCL}]
set_property IOSTANDARD LVCMOS33 [get_ports {RIO_*}]

# Config EEPROM
set_property PACKAGE_PIN R8 [get_ports {CONF_CLK}]
set_property PACKAGE_PIN P8 [get_ports {CONF_MOSI}]
set_property PACKAGE_PIN R7 [get_ports {CONF_HOLD}]
set_property PACKAGE_PIN L14 [get_ports {CONF_WP}]
set_property PACKAGE_PIN M14 [get_ports {CONF_MISO}]
set_property PACKAGE_PIN L12 [get_ports {CONF_CS}]
set_property IOSTANDARD LVCMOS33 [get_ports {CONF_*}]

# Flash Memory
set_property PACKAGE_PIN E8 [get_ports {FLASH_CLK}]
set_property PACKAGE_PIN L12 [get_ports {FLASH_CS}]
set_property PACKAGE_PIN K16 [get_ports {FLASH_HOLD}]
set_property PACKAGE_PIN K15 [get_ports {FLASH_WP}]
set_property PACKAGE_PIN J14 [get_ports {FLASH_MISO}]
set_property PACKAGE_PIN J13 [get_ports {FLASH_MOSI}]
set_property IOSTANDARD LVCMOS33 [get_ports {FLASH_*}]

# LEDs (R = 0, G = 1, B = 2)
set_property PACKAGE_PIN A10 [get_ports {LED_TAR[0]}]
set_property PACKAGE_PIN B10 [get_ports {LED_TAR[0]}]
set_property PACKAGE_PIN B11 [get_ports {LED_TAR[1]}]
set_property PACKAGE_PIN C11 [get_ports {LED_TAR[1]}]
set_property PACKAGE_PIN D10 [get_ports {LED_TAR[2]}]
set_property PACKAGE_PIN D11 [get_ports {LED_TAR[2]}]
set_property PACKAGE_PIN A8 [get_ports {LED_COM[0]}]
set_property PACKAGE_PIN B9 [get_ports {LED_COM[0]}]
set_property PACKAGE_PIN C8 [get_ports {LED_COM[1]}]
set_property PACKAGE_PIN C9 [get_ports {LED_COM[1]}]
set_property PACKAGE_PIN D8 [get_ports {LED_COM[2]}]
set_property PACKAGE_PIN D9 [get_ports {LED_COM[2]}]
set_property PACKAGE_PIN A14 [get_ports {LED_PWR[0]}]
set_property PACKAGE_PIN A15 [get_ports {LED_PWR[0]}]
set_property PACKAGE_PIN B14 [get_ports {LED_PWR[1]}]
set_property PACKAGE_PIN B15 [get_ports {LED_PWR[1]}]
set_property PACKAGE_PIN C14 [get_ports {LED_PWR[2]}]
set_property PACKAGE_PIN D14 [get_ports {LED_PWR[2]}]
set_property PACKAGE_PIN A12 [get_ports {LED_EN[0]}]
set_property PACKAGE_PIN A13 [get_ports {LED_EN[0]}]
set_property PACKAGE_PIN C12 [get_ports {LED_EN[1]}]
set_property PACKAGE_PIN C13 [get_ports {LED_EN[1]}]
set_property PACKAGE_PIN E12 [get_ports {LED_EN[2]}]
set_property PACKAGE_PIN E13 [get_ports {LED_EN[2]}]
set_property PACKAGE_PIN P13 [get_ports {LED_IR}]
set_property PACKAGE_PIN P14 [get_ports {LED_IR}]
set_property PACKAGE_PIN B16 [get_ports {LED_USER}]
set_property PACKAGE_PIN T13 [get_ports {LED_FAULT}]
set_property IOSTANDARD LVCMOS33 [get_ports {LED_*}]

# Power Data
set_property PACKAGE_PIN N16 [get_ports {PWR_12V_EN}]
set_property IOSTANDARD LVCMOS33 [get_ports {PWR_*}]

# Python/Image Sensor LVDS
set_property PACKAGE_PIN J5 [get_ports {PYTHON_CLK_P}]
set_property PACKAGE_PIN J4 [get_ports {PYTHON_CLK_N}]
set_property PACKAGE_PIN H2 [get_ports {PYTHON_SYNC_P}]
set_property PACKAGE_PIN H1 [get_ports {PYTHON_SYNC_N}]
set_property PACKAGE_PIN J3 [get_ports {PYTHON_DOUT_P[3]}]
set_property PACKAGE_PIN H3 [get_ports {PYTHON_DOUT_N[3]}]
set_property PACKAGE_PIN K1 [get_ports {PYTHON_DOUT_P[2]}]
set_property PACKAGE_PIN J1 [get_ports {PYTHON_DOUT_N[2]}]
set_property PACKAGE_PIN L3 [get_ports {PYTHON_DOUT_P[1]}]
set_property PACKAGE_PIN L2 [get_ports {PYTHON_DOUT_N[1]}]
set_property PACKAGE_PIN K3 [get_ports {PYTHON_DOUT_P[0]}]
set_property PACKAGE_PIN K2 [get_ports {PYTHON_DOUT_N[0]}]
set_property DIFF_TERM TRUE [get_ports {PYTHON_CLK_*}];
set_property DIFF_TERM TRUE [get_ports {PYTHON_SYNC_*}];
set_property DIFF_TERM TRUE [get_ports {PYTHON_DOUT_*}];
set_property IOSTANDARD LVDS_25 [get_ports {PYTHON_CLK_*}]
set_property IOSTANDARD LVDS_25 [get_ports {PYTHON_SYNC_*}]
set_property IOSTANDARD LVDS_25 [get_ports {PYTHON_DOUT_*}]
# 280MHZ (8-bit Mode) Input Clock not on MRCC pin ❤️
set PYTHON_CLK_FREQUENCY 280.0
set PYTHON_CLK_PERIOD [expr 1000.0/$PYTHON_CLK_FREQUENCY]
create_clock -add -name PYTHON_CLK_P -period PYTHON_CLK_PERIOD [get_ports PYTHON_CLK_P]

# Python/Image Sensor IO
set_property PACKAGE_PIN T10 [get_ports {PYTHON_SPI_CS}]
set_property PACKAGE_PIN T9 [get_ports {PYTHON_SPI_MOSI}]
set_property PACKAGE_PIN T8 [get_ports {PYTHON_SPI_MISO}]
set_property PACKAGE_PIN T7 [get_ports {PYTHON_SPI_CLK}]
set_property PACKAGE_PIN R11 [get_ports {PYTHON_TRIG[2]}]
set_property PACKAGE_PIN P11 [get_ports {PYTHON_TRIG[1]}]
set_property PACKAGE_PIN R13 [get_ports {PYTHON_TRIG[0]}]
set_property PACKAGE_PIN R10 [get_ports {PYTHON_MON[0]}]
set_property PACKAGE_PIN N9 [get_ports {PYTHON_MON[1]}]
set_property PACKAGE_PIN P9 [get_ports {PYTHON_RESET}]
set_property IOSTANDARD LVCMOS33 [get_ports {PYTHON_SPI_*}]
set_property IOSTANDARD LVCMOS33 [get_ports {PYTHON_TRIG}]
set_property IOSTANDARD LVCMOS33 [get_ports {PYTHON_MON}]
set_property IOSTANDARD LVCMOS33 [get_ports {PYTHON_RESET}]