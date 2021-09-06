`timescale 1ns / 1ps
//////////////////////////////////////////////////////////////////////////////////
// Company: 34 Engineering
// Engineer: Liam Snow
// 
// Create Date: 06/08/2021 11:14:59 AM
// Module Name: CameraManager
// Project Name: Virtex
// 
//////////////////////////////////////////////////////////////////////////////////

/* CameraManager - 
   Python 300 Notes: https://docs.google.com/document/d/1I_gz72WDF619c93o520tFeQNC_jHlEsQBOqtdv9CuxE/edit?usp=sharing*/
module CameraManager(
    input CLK,
    input LVDS_CLK_P,
    input LVDS_CLK_N,
    input LVDS_SYNC_P,
    input LVDS_SYNC_N,
    input [3:0] LVDS_DOUT_P,
    input [3:0] LVDS_DOUT_N,
    output SPI_CS,
    output SPI_MOSI,
    input SPI_MISO,
    output SPI_CLK,
    output TRIGGER,
    input MONITOR,
    output RESET
    );

    //Sub-Components
    BlobProcessor BlobProcessor(
        .CLK200(CLK200),
        .LVDS_CLK(LVDS_CLK),
        .LVDS_SYNC(LVDS_SYNC),
        .LVDS_DOUT(LVDS_DOUT)
    ); /* synthesis preserve */

    CameraConfigManager CameraConfigManager(
        .CLK(CLK),
        .SPI_CS(SPI_CS),
        .SPI_MOSI(SPI_MOSI),
        .SPI_MISO(SPI_MISO),
        .SPI_CLK(SPI_CLK),
        .TRIGGER(TRIGGER),
        .MONITOR(MONITOR),
        .RESET(RESET)
    ); /* synthesis preserve */

    wire CLK200;
    clk_wiz_0 clk_wiz_0(
        .clk_in1(CLK),
        .clk_out1(CLK200)
    );

    //LVDS Input Buffers
    wire LVDS_CLK;
    wire LVDS_SYNC;
    wire [3:0] LVDS_DOUT;
    IBUFGDS #(.DIFF_TERM("TRUE"),.IBUF_LOW_PWR("FALSE"),.IOSTANDARD("LVDS_25"))
    LVDS_CLK_IBUF   (.O(LVDS_CLK    ),.I(LVDS_CLK_P    ),.IB(LVDS_CLK_N     ));
    IBUFDS  #(.DIFF_TERM("TRUE"),.IBUF_LOW_PWR("FALSE"),.IOSTANDARD("LVDS_25"))
    LVDS_SYNC_IBUF  (.O(LVDS_SYNC   ),.I(LVDS_SYNC_P   ),.IB(LVDS_SYNC_N    ));
    IBUFDS  #(.DIFF_TERM("TRUE"),.IBUF_LOW_PWR("FALSE"),.IOSTANDARD("LVDS_25"))
    LVDS_DOUT0_IBUF (.O(LVDS_DOUT[0]),.I(LVDS_DOUT_P[0]),.IB(LVDS_DOUT_N[0]));
    IBUFDS  #(.DIFF_TERM("TRUE"),.IBUF_LOW_PWR("FALSE"),.IOSTANDARD("LVDS_25"))
    LVDS_DOUT1_IBUF (.O(LVDS_DOUT[1]),.I(LVDS_DOUT_P[1]),.IB(LVDS_DOUT_N[1]));
    IBUFDS  #(.DIFF_TERM("TRUE"),.IBUF_LOW_PWR("FALSE"),.IOSTANDARD("LVDS_25"))
    LVDS_DOUT2_IBUF (.O(LVDS_DOUT[2]),.I(LVDS_DOUT_P[2]),.IB(LVDS_DOUT_N[2]));
    IBUFDS  #(.DIFF_TERM("TRUE"),.IBUF_LOW_PWR("FALSE"),.IOSTANDARD("LVDS_25"))
    LVDS_DOUT3_IBUF (.O(LVDS_DOUT[3]),.I(LVDS_DOUT_P[3]),.IB(LVDS_DOUT_N[3]));

endmodule