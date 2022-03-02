// BlobProcessor.ts

import { IMAGE_HEIGHT } from "./util/Constants";
import { Fault } from "./util/Fault";
import { Kernel, KERNEL_MAX_X } from "./util/PythonUtil";
import { BlobBRAMPort, BLOB_BRAM_PORT_DEFAULT, EMPTY_BLOB  } from "./util/OtherUtil";
import { MAX_BLOBS, MAX_BLOB_POINTER_DEPTH, MAX_RUNS_PER_LINE, NULL_LINE_NUMBER, NULL_BLOB_ID, NULL_RUN_BUFFER_PARTION, NULL_BLACK_RUN_BLOB_ID, NULL_TIMESTAMP } from "./BlobConstants";
import { BlobData, BlobMetadata, BlobStatus, mergeBlobs, Run, RunBuffer, runsOverlap, runToBlob, doesBlobMatchCriteria, calcBlobAngle, BlobAngle, Target, TargetMode, distSqToTargetCenter } from "./BlobUtil";
import { inRangeInclusive, overflow, Vector } from "./util/Math";
import { virtexConfig } from "./util/VirtexConfig";

//(scripting only)
let blobColorBuffer: RunBuffer[];
let faults: Fault[] = [...Array(4)].map(_=>Fault.NO_FAULT);
let blobBRAM: BlobData[] = [...Array(MAX_BLOBS)].map(_=>(Object.assign({}, EMPTY_BLOB)));
let blobBRAMPorts: BlobBRAMPort[] = [...Array(2)].map(_=>(Object.assign({}, BLOB_BRAM_PORT_DEFAULT)));

//Blob Processor (registers + wires)
enum BlobRunState { IDLE, LAST_LINE, MERGE_READ, MERGE_WRITE_1, MERGE_WRITE_2, JOIN_1, JOIN_2, WRITE };
let blobRunState: BlobRunState = BlobRunState.IDLE; //[1:0]
let blobMetadatas: BlobMetadata[] = [...Array(MAX_BLOBS)].map(_=>({ status: BlobStatus.UNSCANED, pointer: NULL_BLOB_ID }));
let blobAngles: BlobAngle[] = [...Array(MAX_BLOBS)].map(_=>(BlobAngle.HORIZONTAL));
let blobIndex: number; //[MAX_BLOB_ID_SIZE-1:0]
let blobRunBuffersPartionCurrent: number; //partion of run buffer (0-2)
let blobRunBuffersPartionLast: number;
let blobRunBufferIndexCurrent: number; //index in run buffer [0-MAX_RUNS_PER_LINE]
let blobRunBufferIndexLast: number;
let blobRunBufferXCurrent: number; //[9:0] counter for RLE x position
let blobRunBufferXLast: number;
let blobMasterBlobID: number; //master blob for run to join into (following joining runs are slaves)
let blobUsingPort1: boolean; //whether blobProcessor is using port1 (so garbage collector won't)
let lastIsWorkingOnFrame: boolean;
let blobProcessorDoneWithLine = () => blobRunBuffersPartionCurrent === NULL_RUN_BUFFER_PARTION ||
    blobRunBufferIndexCurrent >= runBuffers[blobRunBuffersPartionCurrent].count; //done with line @ on NULL line OR all runs processed
let blobPartionCurrentValid = () => blobRunBuffersPartionCurrent !== NULL_RUN_BUFFER_PARTION;
let blobNextPartionCurrent = () => overflow(blobRunBuffersPartionCurrent + 1, 2); //note: overflow(NULL+1)=0
let blobNextLineAvailable = () => rleRunBuffersPartion !== blobNextPartionCurrent() &&
    runBuffers[blobNextPartionCurrent()].line !== NULL_LINE_NUMBER; //can move next line @ rle is done with it & its a valid location
let blobProcessorTooSlow = () => rlePartionValid() && rleRunBuffersPartion === blobRunBuffersPartionLast;
let blobProcessorReallyTooSlow = () => rlePartionValid() && rleRunBuffersPartion === blobRunBuffersPartionCurrent;
let blobLastLineRun = () => runBuffers[blobRunBuffersPartionLast].runs[blobRunBufferIndexLast];
let blobLastLineRunRealBlobID = () => getRealBlobID(blobLastLineRun().blobID);
let blobCurrentRun = () => runBuffers[blobRunBuffersPartionCurrent].runs[blobRunBufferIndexCurrent];
let blobCurrentLine = () => runBuffers[blobRunBuffersPartionCurrent].line;
let blobProcessorOnLastLine = () => runBuffers[blobRunBuffersPartionCurrent]?.line === IMAGE_HEIGHT-1;
let isWorkingOnFrame = () => !isLastKernel() || !blobProcessorDoneWithLine() || !blobProcessorOnLastLine();

//Target Selector (registers + wires)
let targetSelectorDone: boolean; //1-bit

//Garbage Collector (registers + wires)
let garbagePort: number; //1-bit
let garbageIndex: number; //[MAX_BLOB_ID_SIZE-1:0]
let lastGarbageIndex: number[] = [0, 0]; //2 x [MAX_BLOB_ID_SIZE-1:0]
let garbageCollectorWasUsingPorts: boolean[] = [false, false]; //BRAM ports
let garbageCollectorDone: boolean;
let garbageCollectorCanUsePorts = () => [!isWorkingOnFrame(), !blobUsingPort1];
let garbageCollectorUsingPorts = () => [garbageCollectorWasUsingPorts[0] && garbageCollectorCanUsePorts()[0],
    garbageCollectorWasUsingPorts[1] && garbageCollectorCanUsePorts()[1]]; //if read from Port A & can still use it
let nextValidGarbageIndex = () => getNextValidGarbageIndex(garbageIndex + 1);
let firstValidGarbageIndex = () => getNextValidGarbageIndex(0);

//Run Length Encoding (registers + wires)
let runBuffers: RunBuffer[] = [...Array(3)].map(_=>({
    runs: [...Array(MAX_RUNS_PER_LINE)].map(_=>({ length: 0, blobID: NULL_BLOB_ID })),
    count: 0,
    line: NULL_LINE_NUMBER
}));
let rleRunBuffersPartion: number;
let kernel: Kernel = { value: [...Array(8)].map(_=>false), pos: {x:0, y:0}, valid: false };
let lastKernelValid: boolean;
let isLastKernel = () => kernel?.pos.y === IMAGE_HEIGHT-1 && kernel?.pos.x === KERNEL_MAX_X;
let rlePartionValid = () => rleRunBuffersPartion !== NULL_RUN_BUFFER_PARTION;

//"180MHz" Always Loop
function alwaysLoop() {
    //Reset @ Frame End
    if (!isWorkingOnFrame() && lastIsWorkingOnFrame) {
        //FORK
        //reset garbage collector @ frame end because garbageIndex
        //may have passed blobs that were still being worked on
        resetGarbageCollector();
        //JOIN
    }
    lastIsWorkingOnFrame = isWorkingOnFrame();

    //Garbage Collection Loop
    if (!garbageCollectorDone) {
        updateGarbageCollector();
    }
    
    //Working on Frame
    if (isWorkingOnFrame()) {
        //New Kernel
        if (kernel.valid && !lastKernelValid) {
            //Run Length Encoding Loop
            updateRunLengthEncoder(kernel);
        }
        lastKernelValid = kernel.valid;

        //Blob Processor Loop
        updateBlobProcessor();
    }

    //Done with Frame
    else if (!targetSelectorDone && garbageCollectorDone) {
        //Target Selection Loop
        updateTargetSelector();
    }
}

//Run Length Encoding Loop
function updateRunLengthEncoder(kernel: Kernel): void {
    //start of line
    if (kernel.pos.x == 0) {
        //FORK
        //set line number of our RunBuffer
        runBuffers[rleRunBuffersPartion].line = kernel.pos.y;

        //zero count of our RunBuffer
        runBuffers[rleRunBuffersPartion].count = 0;
        //JOIN
    }
    
    //encode every pixel in kernel
    for (let x = 0; x < 8; x++) {
        //FORK
        //new run @ start of line OR color transition
        if ((kernel.pos.x == 0 && x == 0) ||
            kernel.value[x] !== (runBuffers[rleRunBuffersPartion].runs[runBuffers[rleRunBuffersPartion].count-1].blobID !== NULL_BLACK_RUN_BLOB_ID)) {

            //push run to buffer
            runBuffers[rleRunBuffersPartion].runs[runBuffers[rleRunBuffersPartion].count] = {
                length: 1,
                blobID: kernel.value[x] ? NULL_BLOB_ID : NULL_BLACK_RUN_BLOB_ID
            };

            //increment our buffer count for next run
            if (runBuffers[rleRunBuffersPartion].count == MAX_RUNS_PER_LINE) {
                faults[1] = Fault.OUT_OF_RLE_MEM_FAULT;
            }
            else {
                runBuffers[rleRunBuffersPartion].count = runBuffers[rleRunBuffersPartion].count + 1;
            }
        }

        //extend length of last run
        else {
            runBuffers[rleRunBuffersPartion].runs[runBuffers[rleRunBuffersPartion].count-1].length = 
            runBuffers[rleRunBuffersPartion].runs[runBuffers[rleRunBuffersPartion].count-1].length + 1;
        }
        //JOIN
    }

    //end line
    if (kernel.pos.x == KERNEL_MAX_X) {
        //FORK
        if (runBuffers[rleRunBuffersPartion].line === IMAGE_HEIGHT-1) {
            //done with frame => null
            rleRunBuffersPartion = NULL_RUN_BUFFER_PARTION;
        }
        else {
            //increment buffer partion for next line
            rleRunBuffersPartion = overflow(rleRunBuffersPartion + 1, 2);
        }
        //JOIN
    }
}

//Blob Processor Loop
function updateBlobProcessor(): void {
    blobBRAMPorts[0].wea = false;

    //Next Line
    if ((blobProcessorDoneWithLine() && blobNextLineAvailable()) || blobProcessorTooSlow() || blobProcessorReallyTooSlow()) {
        //FORK
        //Fault
        if ((blobProcessorReallyTooSlow() || blobProcessorTooSlow()) && !(blobProcessorDoneWithLine() && blobNextLineAvailable())) {
            faults[3] = Fault.BLOB_PROCESSOR_TOO_SLOW_FAULT;
        }

        //Get partions for new line
        if (blobProcessorReallyTooSlow()) {
            //blob processor is so slow that we it caught up to our current position
            // => skip 2 lines so we can still use the last line wo/ RLE overwriting it
            //this can happen on the first line of the image, where blobRunBuffersPartionLast is NULL
            //get partions for new line
            const nextPartionLast = blobNextPartionCurrent();
            blobRunBuffersPartionLast = 
                (nextPartionLast !== overflow(blobNextPartionCurrent() + 1, 2) && runBuffers[nextPartionLast].line !== NULL_LINE_NUMBER) ?
                nextPartionLast : NULL_RUN_BUFFER_PARTION;
            blobRunBuffersPartionCurrent = overflow(blobNextPartionCurrent() + 1, 2);
        }
        else {
            const nextPartionLast = overflow(blobRunBuffersPartionCurrent, 2);
            blobRunBuffersPartionLast = 
                (nextPartionLast !== blobNextPartionCurrent() && runBuffers[nextPartionLast].line !== NULL_LINE_NUMBER) ?
                nextPartionLast : NULL_RUN_BUFFER_PARTION;
            blobRunBuffersPartionCurrent = blobNextPartionCurrent();
        }

        //Reset Intra-Buffer Indexes
        blobRunBufferIndexCurrent = 0;
        blobRunBufferXCurrent = 0;
        blobRunState = BlobRunState.IDLE;
        //JOIN
    }

    //Handle Run (if we are on a valid partion of the RunBuffer & there are more Runs to handle)
    if (blobPartionCurrentValid() && blobRunBufferIndexCurrent < runBuffers[blobRunBuffersPartionCurrent].count) {
        //run is black => continue to next run
        if (blobCurrentRun().blobID == NULL_BLACK_RUN_BLOB_ID) {
            //push to blob color buffer (scripting only)
            blobColorBuffer[blobCurrentLine()].runs[blobRunBufferIndexCurrent] = 
                Object.assign({}, runBuffers[blobRunBuffersPartionCurrent].runs[blobRunBufferIndexCurrent]);
            blobColorBuffer[blobCurrentLine()].count = blobRunBufferIndexCurrent + 1;

            //continue to next run
            blobRunBufferXCurrent = blobRunBufferXCurrent + runBuffers[blobRunBuffersPartionCurrent].runs[blobRunBufferIndexCurrent].length;
            blobRunBufferIndexCurrent = blobRunBufferIndexCurrent + 1;
        }

        //run is white => process
        else {
            //start run (if done with last one, or last one timed out)
            if (blobRunState == BlobRunState.IDLE) {
                //FORK
                //mark this run as doesn't have another run to join
                blobMasterBlobID = NULL_BLOB_ID;

                //reset last run buffer indexes
                blobRunBufferIndexLast = 0;
                blobRunBufferXLast = 0;

                //proceed to look for runs to join OR go straight to writing if on the first line of image
                blobRunState = (blobRunBuffersPartionLast == NULL_RUN_BUFFER_PARTION) ? BlobRunState.WRITE : BlobRunState.LAST_LINE;
                //JOIN
            }

            //loop through all runs that were filled up in the last run buffer (line above)
            if (blobRunState == BlobRunState.LAST_LINE) {
                //FORK
                for (blobRunBufferIndexLast; blobRunBufferIndexLast < runBuffers[blobRunBuffersPartionLast].count; blobRunBufferIndexLast++) {
                    //FORK
                    if (blobLastLineRun().blobID !== NULL_BLACK_RUN_BLOB_ID) {
                        if (runsOverlap(blobCurrentRun(), blobRunBufferXCurrent, blobLastLineRun(), blobRunBufferXLast)) {
                            //pointer fault
                            if (blobLastLineRunRealBlobID() == NULL_BLOB_ID) {
                                faults[2] = Fault.BLOB_POINTER_DEPTH_FAULT;
                            }

                            //found master (1st valid blob)
                            else if (blobMasterBlobID === NULL_BLOB_ID) {
                                blobMasterBlobID = blobLastLineRunRealBlobID();
                            }

                            //found another valid blob => merge with master
                            else if (blobLastLineRunRealBlobID() !== blobMasterBlobID) {
                                //read slave & master blobs
                                blobBRAMPorts[0].addr = blobMasterBlobID;
                                blobBRAMPorts[1].addr = blobLastLineRunRealBlobID();
                                blobUsingPort1 = true;

                                //mark slave as pointer to master
                                blobMetadatas[blobLastLineRunRealBlobID()] = {
                                    status: BlobStatus.POINTER,
                                    pointer: blobMasterBlobID
                                };

                                //go merge blobs & write once we read them
                                blobRunState = BlobRunState.MERGE_WRITE_1;
                            }
                        }
                    }
                    //JOIN
                    blobRunBufferXLast = blobRunBufferXLast + runBuffers[blobRunBuffersPartionLast].runs[blobRunBufferIndexLast].length; //BLOCKING
                }
                //JOIN

                //done looping last line => write blob
                if (blobRunState == BlobRunState.LAST_LINE) {
                    //FORK
                    blobRunState = blobMasterBlobID == NULL_BLOB_ID ? BlobRunState.WRITE : BlobRunState.JOIN_1;
                    //JOIN
                }
            }

            else if (blobRunState == BlobRunState.MERGE_WRITE_1) {
                //account for read delay
                //FORK
                blobRunState = BlobRunState.MERGE_WRITE_2;
                //JOIN
            }

            else if (blobRunState == BlobRunState.MERGE_WRITE_2) {
                //FORK
                blobBRAMPorts[0].din = mergeBlobs(blobBRAMPorts[1].dout, blobBRAMPorts[0].dout);
                blobBRAMPorts[0].wea = true;
                blobUsingPort1 = false;
                blobRunState = BlobRunState.LAST_LINE;
                //JOIN
            }

            if (blobRunState == BlobRunState.JOIN_1) {
                //FORK
                //account for read delay
                blobBRAMPorts[0].addr = blobMasterBlobID;
                blobRunState = BlobRunState.JOIN_2;
                //JOIN
            }

            else if (blobRunState == BlobRunState.JOIN_2) {
                //FORK
                blobRunState = BlobRunState.WRITE;
                //JOIN
            }

            else if (blobRunState == BlobRunState.WRITE) {
                //FORK
                //add this pixel to blob if we have a valid blob to join
                if (blobMasterBlobID !== NULL_BLOB_ID) {
                    blobBRAMPorts[0].din = mergeBlobs(runToBlob(blobCurrentRun(), blobRunBufferXCurrent, blobCurrentLine()), blobBRAMPorts[0].dout);
                    blobBRAMPorts[0].wea = true;

                    //set ID of the blob we joined
                    runBuffers[blobRunBuffersPartionCurrent].runs[blobRunBufferIndexCurrent].blobID = blobMasterBlobID;
                }
                
                //not touching a blob => make new blob
                else {
                    //create blob at next available index
                    blobBRAMPorts[0].addr = blobIndex;
                    blobBRAMPorts[0].din = runToBlob(blobCurrentRun(), blobRunBufferXCurrent, blobCurrentLine());
                    blobBRAMPorts[0].wea = true;
                    blobMetadatas[blobIndex].status = BlobStatus.UNSCANED; //tell garbage collector to check this once it is done

                    //set ID of the blob we made in runBuffer
                    runBuffers[blobRunBuffersPartionCurrent].runs[blobRunBufferIndexCurrent].blobID = blobIndex;

                    
                    if (blobIndex == MAX_BLOBS-1) {
                        //fault
                        faults[0] = Fault.OUT_OF_BLOB_MEM_FAULT;
                        blobIndex = 0;
                    }
                    else {
                        //increment index for next blob
                        blobIndex = blobIndex + 1;
                    }  
                }
                //JOIN

                //push to blob color buffer (scripting only)
                blobColorBuffer[blobCurrentLine()].runs[blobRunBufferIndexCurrent] = 
                    Object.assign({}, runBuffers[blobRunBuffersPartionCurrent].runs[blobRunBufferIndexCurrent]);
                blobColorBuffer[blobCurrentLine()].count = blobRunBufferIndexCurrent + 1;

                //FORK
                //continue to next run
                blobRunBufferXCurrent = blobRunBufferXCurrent + runBuffers[blobRunBuffersPartionCurrent].runs[blobRunBufferIndexCurrent].length;
                blobRunBufferIndexCurrent = blobRunBufferIndexCurrent + 1;
                blobRunState = BlobRunState.IDLE;
                //JOIN
            }
        }
    }
}

//Garbage Collector Loop
function updateGarbageCollector(): void {
    //FORK
    let writingAngle = false;
    //Process Port X (if read from)
    if (garbageCollectorUsingPorts()[garbagePort]) {
        //if blob is finished adding to
        if (blobPartionCurrentValid() && blobBRAMPorts[garbagePort].dout.boundBottomRight.y + 2 < blobCurrentLine()) {
            const blob: BlobData = blobBRAMPorts[garbagePort].dout;
            const angle: BlobAngle = calcBlobAngle(blob);

            //Mark blob as Valid or Garbage
            blobMetadatas[lastGarbageIndex[1]].status = doesBlobMatchCriteria(blob, angle) ? BlobStatus.VALID : BlobStatus.GARBAGE;

            //Save blob angle if its valid (for target selector)
            blobAngles[lastGarbageIndex[1]] = angle;
        }
    }
    //JOIN

    //FORK
    //Read Port X (if available & not writing angle)
    if (garbageCollectorCanUsePorts()[garbagePort] && !writingAngle) {
        //Go To Next Garbage Index
        setNextGarbageIndex();

        //Read Port X
        if (garbageIndex !== NULL_BLOB_ID && !garbageCollectorDone) {
            blobBRAMPorts[garbagePort].addr = garbageIndex;
            blobBRAMPorts[garbagePort].wea = false;
            garbageCollectorWasUsingPorts[garbagePort] = true;
        }
        else {
            garbageCollectorWasUsingPorts[garbagePort] = false;
        }
    }
    //JOIN

    lastGarbageIndex[1] = lastGarbageIndex[0];
    lastGarbageIndex[0] = garbageIndex;
    garbagePort = garbagePort == 1 ? 0 : 1;
}
function setNextGarbageIndex(): void {
    //FORK
    if (garbageIndex === NULL_BLOB_ID || nextValidGarbageIndex() === NULL_BLOB_ID) {
        //still on frame => keep doing garbage duty :(
        if (isWorkingOnFrame()) {
            garbageIndex = firstValidGarbageIndex();
        }

        //done with frame => stop garbage duty :)
        else {
            garbageCollectorDone = true;
        }
    }
    else {
        garbageIndex = nextValidGarbageIndex();
    }
    //JOIN
}
function getNextValidGarbageIndex(startIndex: number): number {
    //find next unscaned blob >= startIndex
    //(and < blobIndex because anything above that is invalid)
    for (let i = 0; i < MAX_BLOBS; i++) {
        if (i >= startIndex && i <= blobIndex && blobMetadatas[i].status == BlobStatus.UNSCANED) {
            return i;
        }
    }
    return NULL_BLOB_ID;
}
function resetGarbageCollector(): void {
    garbagePort = 0;
    garbageIndex = 0;
    lastGarbageIndex = [0, 0];
    garbageCollectorWasUsingPorts = [false, false];
    garbageCollectorDone = false;
}

//Target Selector Loop
let target: Target;
let targetIndexA: number = 0;
let targetIndexB: number = 0;
let blobA: BlobData, blobB: BlobData;
let nextTargetIndexA = () => getNextValidTargetIndex(targetIndexA);
let nextTargetIndexB = () => getNextValidTargetIndex(targetIndexB);
let currentTarget: Target; //TODO rename //current target for "a"
let currentValidTarget: Target; //biggest target that is valid for "a"; starts null bc a GROUP need 2+ blobs
function updateTargetSelector() {
    //Init
    if (targetIndexA == NULL_BLOB_ID) {
        //start A @ 0 if its valid, otherwise pick the next valid index after 0
        targetIndexA = blobMetadatas[0].status === BlobStatus.VALID ? 0 : nextTargetIndexA(); //BLOCKING
        initNewA();

        if (virtexConfig.targetMode !== TargetMode.SINGLE) {
            if (nextTargetIndexA() == NULL_BLOB_ID) {
                //working in mode that requires 2+ blobs but only one valid blob exists
                // => quietly exit the stage
                //FIXME?
                targetSelectorDone = true;
            }
            else {
                //start B @ valid index after A
                targetIndexB = nextTargetIndexA(); //BLOCKING
                initNewB();
            }
        }
    }

    //TODO TARGET_SELECTOR_TOO_SLOW_FAULT
    //TODO BRAM read delay
    //TODO organize

    //Single
    if (virtexConfig.targetMode == TargetMode.SINGLE) {
        //Convert Blob A Bounding Box from TopLeft/BottomRight => Center/Width/Height
        const center: Vector = {
            x: (blobA.boundBottomRight.x + blobA.boundTopLeft.x) >> 1,
            y: (blobA.boundBottomRight.y + blobA.boundTopLeft.y) >> 1
        };
        const width:  number = blobA.boundBottomRight.x - blobA.boundTopLeft.x + 1;
        const height: number = blobA.boundBottomRight.y - blobA.boundTopLeft.y + 1;

        //aspect ratio valid
        const aspectRatioValid: boolean = inRangeInclusive(width, //TODO fixed point mult
            virtexConfig.targetAspectRatioMin*height, virtexConfig.targetAspectRatioMax*height);

        //bound area valid
        const boundAreaValid: boolean = inRangeInclusive((width * height) >> 1,
            virtexConfig.targetBoundAreaMin, virtexConfig.targetBoundAreaMax);

        //if this target is valid AND this target is better OR we dont have a target yet
        if (aspectRatioValid && boundAreaValid &&
            (target.timestamp === NULL_TIMESTAMP || distSqToTargetCenter(center) < distSqToTargetCenter(target.center))) {
            target = {
                center, width, height,
                timestamp: 10,
                blobCount: 2,
                angle: blobAngles[targetIndexA]
            };
        }
    }

    //Group
    else if (virtexConfig.targetMode == TargetMode.GROUP) {
        //chain other blobs together starting a Blob A

        //make new enclosing bound that includes currentTarget & blobB
        const currentTargetTopLeft: Vector = {
            x: currentTarget.center.x - (currentTarget.width >> 1),
            y: currentTarget.center.y - (currentTarget.height >> 1)
        };
        const currentTargetBottomRight: Vector = {
            x: currentTarget.center.x + (currentTarget.width >> 1),
            y: currentTarget.center.y + (currentTarget.height >> 1)
        };
        const topLeft: Vector = {
            x: Math.min(blobB.boundTopLeft.x, currentTargetTopLeft.x),
            y: Math.min(blobB.boundTopLeft.y, currentTargetTopLeft.y)
        };
        const bottomRight: Vector = {
            x: Math.max(blobB.boundBottomRight.x, currentTargetBottomRight.x),
            y: Math.max(blobB.boundBottomRight.y, currentTargetBottomRight.y)
        };
        const center: Vector = {
            x: (topLeft.x + bottomRight.x) >> 1,
            y: (topLeft.y + bottomRight.y) >> 1
        };
        const width: number = bottomRight.x - topLeft.x + 1;
        const height: number = bottomRight.y - topLeft.y + 1;

        //gap valid between Blob B & target
        const gapX: number = Math.min(
            Math.abs(blobB.boundTopLeft.x - currentTargetBottomRight.x),
            Math.abs(blobB.boundBottomRight.x - currentTargetTopLeft.x)
        );
        const gapY: number = Math.min(
            Math.abs(blobB.boundTopLeft.y - currentTargetBottomRight.y),
            Math.abs(blobB.boundBottomRight.y - currentTargetTopLeft.y)
        );
        const gapValid: boolean = inRangeInclusive(gapX, virtexConfig.targetBlobXGapMin, virtexConfig.targetBlobXGapMax) &&
            inRangeInclusive(gapY, virtexConfig.targetBlobYGapMin, virtexConfig.targetBlobYGapMax);

        //area diff between Blob A & B
        const areaLeft = (blobA.boundBottomRight.x - blobA.boundTopLeft.x + 1) * (blobA.boundBottomRight.y - blobA.boundTopLeft.y + 1);
        const areaRight = (blobB.boundBottomRight.x - blobB.boundTopLeft.x + 1) * (blobB.boundBottomRight.y - blobB.boundTopLeft.y + 1);
        const areaDiffValid: boolean = inRangeInclusive(Math.abs(areaRight - areaLeft),
            virtexConfig.targetBlobAreaDiffMin, virtexConfig.targetBlobAreaDiffMax);

        if (gapValid && areaDiffValid) {
            //join current target
            currentTarget = {
                center, width, height,
                timestamp: 10,
                blobCount: currentTarget.blobCount + 1,
                angle: blobAngles[targetIndexA]
            };

            //aspect ratio of new currentTarget valid
            const aspectRatioValid: boolean = inRangeInclusive(width, //TODO fixed point mult
                virtexConfig.targetAspectRatioMin*height, virtexConfig.targetAspectRatioMax*height);

            //bound area of new currentTarget valid
            const boundAreaValid: boolean = inRangeInclusive((width * height) >> 1,
                virtexConfig.targetBoundAreaMin, virtexConfig.targetBoundAreaMax);

            if (aspectRatioValid && boundAreaValid) {
                //join current valid target
                currentValidTarget = Object.assign({}, currentTarget);
            }
        }
    }

    //Dual
    else {
        //pick left & right
        const blobACenterX: number = (blobA.boundTopLeft.x + blobA.boundBottomRight.x) >> 1;
        const blobBCenterX: number = (blobB.boundTopLeft.x + blobB.boundBottomRight.x) >> 1;
        const leftBlob : BlobData    = blobACenterX < blobBCenterX ? blobA : blobB;
        const leftBlobIndex : number = blobACenterX < blobBCenterX ? targetIndexA : targetIndexB;
        const rightBlob: BlobData    = blobACenterX < blobBCenterX ? blobB : blobA;
        const rightBlobIndex: number = blobACenterX < blobBCenterX ? targetIndexB : targetIndexA;

        //make enclosing bound
        const topLeft: Vector = {
            x: Math.min(leftBlob.boundTopLeft.x, rightBlob.boundTopLeft.x),
            y: Math.min(leftBlob.boundTopLeft.y, rightBlob.boundTopLeft.y)
        };
        const bottomRight: Vector = {
            x: Math.max(leftBlob.boundBottomRight.x, rightBlob.boundBottomRight.x),
            y: Math.max(leftBlob.boundBottomRight.y, rightBlob.boundBottomRight.y)
        };
        const center: Vector = {
            x: (topLeft.x + bottomRight.x) >> 1,
            y: (topLeft.y + bottomRight.y) >> 1
        };
        const width: number = bottomRight.x - topLeft.x + 1;
        const height: number = bottomRight.y - topLeft.y + 1;

        //find if angles are valid
        const isAngleValid: boolean = virtexConfig.targetMode === TargetMode.DUAL_UP ?
            blobAngles[leftBlobIndex] == BlobAngle.FORWARD && blobAngles[rightBlobIndex] == BlobAngle.BACKWARD :
            virtexConfig.targetMode === TargetMode.DUAL_DOWN ?
            blobAngles[leftBlobIndex] == BlobAngle.BACKWARD && blobAngles[rightBlobIndex] == BlobAngle.FORWARD : true;

        //gap valid
        const gapX: number = Math.abs(rightBlob.boundTopLeft.x - leftBlob.boundBottomRight.x);
        const gapY: number = Math.abs(rightBlob.boundTopLeft.y - leftBlob.boundBottomRight.y);
        const gapValid: boolean = inRangeInclusive(gapX, virtexConfig.targetBlobXGapMin, virtexConfig.targetBlobXGapMax) &&
            inRangeInclusive(gapY, virtexConfig.targetBlobYGapMin, virtexConfig.targetBlobYGapMax);

        //aspect ratio valid
        const aspectRatioValid: boolean = inRangeInclusive(width, //TODO fixed point mult
            virtexConfig.targetAspectRatioMin*height, virtexConfig.targetAspectRatioMax*height);

        //bound area valid
        const boundAreaValid: boolean = inRangeInclusive((width * height) >> 1,
            virtexConfig.targetBoundAreaMin, virtexConfig.targetBoundAreaMax);

        //area diff valid
        const areaLeft = (leftBlob.boundBottomRight.x - leftBlob.boundTopLeft.x + 1) * (leftBlob.boundBottomRight.y - leftBlob.boundTopLeft.y + 1);
        const areaRight = (rightBlob.boundBottomRight.x - rightBlob.boundTopLeft.x + 1) * (rightBlob.boundBottomRight.y - rightBlob.boundTopLeft.y + 1);
        const areaDiffValid: boolean = inRangeInclusive(Math.abs(areaRight - areaLeft),
            virtexConfig.targetBlobAreaDiffMin, virtexConfig.targetBlobAreaDiffMax);
        
        //if this target is valid AND this target is better OR we dont have a target yet
        if (isAngleValid && gapValid && aspectRatioValid && boundAreaValid && areaDiffValid &&
            (target.timestamp === NULL_TIMESTAMP || distSqToTargetCenter(center) < distSqToTargetCenter(target.center))) {
            target = {
                center, width, height,
                timestamp: 10,
                blobCount: 2,
                angle: blobAngles[targetIndexA]
            };
        }
    }

    //Increment Indexes OR Finish 
    if (virtexConfig.targetMode === TargetMode.SINGLE || nextTargetIndexB() == NULL_BLOB_ID) {
        //increment A
        targetIndexA = nextTargetIndexA(); //BLOCKING

        //if next A index is null OR next B index is null AND dual target mode
        if (targetIndexA == NULL_BLOB_ID ||
            (nextTargetIndexA() == NULL_BLOB_ID && virtexConfig.targetMode !== TargetMode.GROUP && virtexConfig.targetMode !== TargetMode.SINGLE)) {
            //finish
            targetSelectorDone = true;
        }
        else {
            //init new A
            initNewA();
            
            if (virtexConfig.targetMode === TargetMode.GROUP) {
                //wrap up group
                //if we made a valid target AND its better than the current one OR we dont have a current one
                if (currentValidTarget.timestamp !== NULL_TIMESTAMP &&
                    (target.timestamp === NULL_TIMESTAMP || distSqToTargetCenter(currentValidTarget.center) < distSqToTargetCenter(target.center))) {
                    target = currentValidTarget;
                }

                //reset B
                targetIndexB = 0; //BLOCKING
            }
            else {
                //set new B
                targetIndexB = nextTargetIndexA(); //BLOCKING
            }
            initNewB();
        }
    }
    else {
        //increment B
        targetIndexB = nextTargetIndexB(); //BLOCKING
        initNewB();
    }
}
function getNextValidTargetIndex(startIndex: number): number {
    //find next valid blob > startIndex
    //(and < blobIndex because anything above that is invalid)
    for (let i = 0; i < MAX_BLOBS; i++) {
        if (i > startIndex && i <= blobIndex && blobMetadatas[i].status == BlobStatus.VALID) {
            return i;
        }
    }
    return NULL_BLOB_ID;
}
function initNewA() {
    blobA = blobBRAM[targetIndexA];
    currentTarget = { 
        center: {
            x: (blobA.boundBottomRight.x + blobA.boundTopLeft.x) >> 1,
            y: (blobA.boundBottomRight.y + blobA.boundTopLeft.y) >> 1
        },
        width:  blobA.boundBottomRight.x - blobA.boundTopLeft.x + 1,
        height: blobA.boundBottomRight.y - blobA.boundTopLeft.y + 1,
        timestamp: 10,
        angle: blobAngles[targetIndexA],
        blobCount: 1
    };
    currentValidTarget = {
        center: {x:0, y:0},
        width: 0, height: 0,
        timestamp: NULL_TIMESTAMP,
        angle: blobAngles[targetIndexA],
        blobCount: 0
    };
}
function initNewB() {
    blobB = blobBRAM[targetIndexB];
}

//Resetting for New Frame
function reset() {
    //FORK
    blobIndex = 0;
    blobRunBuffersPartionCurrent = NULL_RUN_BUFFER_PARTION;
    blobRunBuffersPartionLast = NULL_RUN_BUFFER_PARTION;
    blobUsingPort1 = false;
    
    rleRunBuffersPartion = 0;
    kernel.valid = false;
    lastKernelValid = false;
    for (let i = 0; i < 3; i++) {
        runBuffers[i].count = 0;
        runBuffers[i].line = NULL_LINE_NUMBER;
    }
    lastIsWorkingOnFrame = false;

    resetGarbageCollector();

    targetSelectorDone = false;
    target = {
        center: {x:0, y:0},
        width: 0, height: 0,
        timestamp: 0,
        blobCount: 0,
        angle: BlobAngle.HORIZONTAL
    }
    targetIndexA = NULL_BLOB_ID;
    targetIndexB = NULL_BLOB_ID;
    //JOIN

    //(scripting only)
    blobColorBuffer = [...Array(IMAGE_HEIGHT)].map(_=>({
        runs: [...Array(MAX_RUNS_PER_LINE)].map(_=>({ length: 0, blobID: NULL_BLOB_ID })),
        count: 0,
        line: NULL_LINE_NUMBER
    }));
}

//Get Real Blob ID (AKA Follow Pointer)
function getRealBlobID(startID: number): number {
    //without recursion for FPGA :(
    for (let i = 0; i < MAX_BLOB_POINTER_DEPTH; i++) {
        if (blobMetadatas[startID].status == BlobStatus.POINTER) {
            startID = blobMetadatas[startID].pointer; //BLOCKING
        }
        else {
            return startID;
        }
    }
    return NULL_BLOB_ID;
}

//Module (scripting only)
let sendKernel = (newKernel: Kernel) => kernel = Object.assign({}, newKernel);
let isDone = () => targetSelectorDone;
let getRealBlobIDDebug = (startID: number): number => blobMetadatas[startID].status == BlobStatus.POINTER ? 
    getRealBlobIDDebug(blobMetadatas[startID].pointer) : startID;
let resetFaults = () => faults = [...Array(4)].map(_=>Fault.NO_FAULT);
let lastAddresses: number[] = [0, 0];
function updateBRAM() {
    for (const p in blobBRAMPorts) {
        if (blobBRAMPorts[p].wea) {
            //write to din
            blobBRAM[blobBRAMPorts[p].addr] = Object.assign({}, blobBRAMPorts[p].din);
        }
        else {
            //read to dout
            blobBRAMPorts[p].dout = Object.assign({}, blobBRAM[lastAddresses[p]]);
        }
        lastAddresses[p] = blobBRAMPorts[p].addr;
    }
}
export { sendKernel, isDone, getRealBlobIDDebug, resetFaults, updateBRAM };
export { blobColorBuffer, faults, blobBRAM, blobMetadatas, blobIndex, target };
export { alwaysLoop, reset };