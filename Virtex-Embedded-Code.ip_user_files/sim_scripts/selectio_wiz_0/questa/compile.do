vlib questa_lib/work
vlib questa_lib/msim

vlib questa_lib/msim/xpm
vlib questa_lib/msim/xil_defaultlib

vmap xpm questa_lib/msim/xpm
vmap xil_defaultlib questa_lib/msim/xil_defaultlib

vlog -work xpm  -incr -mfcu -sv \
"C:/Xilinx/Vivado/2021.1/data/ip/xpm/xpm_cdc/hdl/xpm_cdc.sv" \

vcom -work xpm  -93 \
"C:/Xilinx/Vivado/2021.1/data/ip/xpm/xpm_VCOMP.vhd" \

vlog -work xil_defaultlib  -incr -mfcu \
"../../../../Virtex-Embedded-Code.gen/sources_1/ip/selectio_wiz_0/selectio_wiz_0_selectio_wiz.v" \
"../../../../Virtex-Embedded-Code.gen/sources_1/ip/selectio_wiz_0/selectio_wiz_0.v" \

vlog -work xil_defaultlib \
"glbl.v"
