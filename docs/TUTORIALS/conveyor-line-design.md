# Tutorial: Conveyor Line Control System Design

This tutorial walks through designing a conveyor line control system with Volta.

## Prerequisites

- Volta installed and running
- LLM providers configured (Chat + Embedding)
- Basic knowledge of electrical control systems

## Overview

We'll design a conveyor line system with:
- 3 conveyor motors
- Emergency stop functionality
- Interlock logic
- Siemens S7-1200 PLC
- PROFINET communication

## Step 1: Create Project

1. Click "New Project"
2. Name: "Conveyor Line System"
3. Click "Create"

## Step 2: Define Requirements

In the chat panel, enter:

```
Design a conveyor line control system with the following requirements:

- 3 conveyor motors (0.75kW each)
- Emergency stop button at each end of line
- Photoelectric sensors for product detection
- Interlock logic: upstream conveyor stops if downstream is full
- Use Siemens S7-1200 PLC
- PROFINET communication protocol
- Safety level: SIL 1
- Control voltage: 24V DC
- Ambient temperature: 0-40°C
```

Click "完整工程生成" (Full Engineering Run).

## Step 3: Review Analysis Progress

Watch the progress in the chat panel as Volta executes:

1. **Requirements Analysis**: Structured requirements extracted
2. **Category Mapping**: System categorized as material handling
3. **Safety Assessment**: SIL 1 requirements identified
4. **Constraint Extraction**: Voltage, protocol, temperature constraints
5. **Component Selection**: BOM generated with confidence scores
6. **Rule Validation**: 5 hard constraints checked
7. **Schematic Generation**: Mermaid diagram created
8. **Code Generation**: ST code written
9. **Wiring Generation**: Wiring table created
10. **Commissioning Guide**: Step-by-step instructions generated

## Step 4: Review Topology

Navigate to the "拓扑图" (Topology) tab.

You should see:
- **PLC Node**: Siemens S7-1200 CPU
- **Motor Starter Nodes**: 3 motor starters (contactor + thermal overload)
- **E-Stop Nodes**: 2 emergency stop buttons
- **Sensor Nodes**: Photoelectric sensors
- **Power Supply**: 24V DC power supply
- **Connections**: Power, signal, and communication links

### Edit Topology (Optional)

If needed:
- Right-click to add components
- Drag to move nodes
- Click and drag to create connections
- Double-click to edit component properties

## Step 5: Review BOM

Navigate to the "BOM" tab.

Review the Bill of Materials:

| Component | Manufacturer | Model | Qty | Confidence |
|-----------|-------------|-------|-----|------------|
| PLC CPU | Siemens | 6ES7 1214C-1/... | 1 | High |
| Motor Starter | Siemens | 3RV2011-... | 3 | High |
| E-Stop Button | Siemens | 3SU1 000-... | 2 | High |
| Photoelectric Sensor | Sick | WSE12-3... | 3 | Medium |
| Power Supply | Siemens | 6EP1 334-... | 1 | High |

### Provide Feedback

- Click 👍 if selections are correct
- Click 👎 if incorrect and provide feedback
- Click edit to manually correct

## Step 6: Review Schematic

Navigate to "原理图" (Schematic) tab.

View the Mermaid-based electrical schematic showing:
- Power distribution (24V DC, 230V AC)
- Control circuit
- Safety circuit (E-Stop)
- Motor control circuits
- Sensor connections

Export as SVG or PNG if needed.

## Step 7: Review ST Code

Navigate to "ST 代码" (ST Code) tab.

Review the generated structured text code:

```st
// Main OB
ORGANIZATION_BLOCK MAIN
BEGIN
    // E-Stop monitoring
    IF NOT E_Stop_1 AND NOT E_Stop_2 THEN
        Safety_OK := TRUE;
    ELSE
        Safety_OK := FALSE;
        Stop_All_Motors();
    END_IF;

    // Conveyor control logic
    IF Safety_OK AND Start_Command THEN
        // Interlock logic
        IF NOT Conveyor_3_Full THEN
            Conveyor_2_Run := TRUE;
            IF NOT Conveyor_2_Full THEN
                Conveyor_1_Run := TRUE;
            END_IF;
        END_IF;
    END_IF;

    // Motor control
    Conveyor_1_Output := Conveyor_1_Run AND NOT Conveyor_1_Fault;
    Conveyor_2_Output := Conveyor_2_Run AND NOT Conveyor_2_Fault;
    Conveyor_3_Output := Conveyor_3_Run AND NOT Conveyor_3_Fault;
END_ORGANIZATION_BLOCK
```

Download as .scl file for TIA Portal import.

## Step 8: Review Wiring Table

Navigate to "接线表" (Wiring) tab.

Review the terminal wiring list:

| Tag | Signal | From | To | Wire |
|-----|--------|------|-----|------|
| X1.1 | 24V+ | PSU | PLC X1 | 1.5mm² |
| X1.2 | 0V | PSU | PLC X2 | 1.5mm² |
| X2.1 | E-Stop 1 | ESB1 | PLC I0.0 | 0.75mm² |
| X2.2 | E-Stop 2 | ESB2 | PLC I0.1 | 0.75mm² |
| ... | ... | ... | ... | ... |

Export as Excel for panel builder.

## Step 9: Review Commissioning Guide

Navigate to "调试手册" (Commissioning) tab.

Follow the step-by-step guide:

1. **Pre-commissioning Checklist**
   - Verify all wiring per wiring table
   - Check power supply voltage
   - Verify E-Stop circuit continuity
   - Test sensor operation

2. **Power-Up Procedure**
   - Apply control power (24V DC)
   - Apply main power (230V AC)
   - Verify PLC power LED
   - Check for fault indicators

3. **I/O Testing**
   - Test each digital input
   - Test each digital output
   - Verify sensor feedback
   - Test E-Stop functionality

4. **Functional Testing**
   - Test individual conveyor operation
   - Test interlock logic
   - Test emergency stop
   - Verify product detection

5. **Commissioning Sign-off**
   - Document all test results
   - Sign off by commissioning engineer
   - Handover to operations

## Step 10: Confirm Topology

When satisfied with the design:

1. Click "确认拓扑" (Confirm Topology)
2. All deliverables are regenerated based on confirmed topology
3. A new topology version is saved

## Step 11: Export Project

Navigate to "概览" (Overview) tab.

Click "导出工程包" (Export Package).

The ZIP file contains:
- `bom.xlsx`: Bill of Materials
- `wiring.xlsx`: Wiring table
- `program.scl`: PLC code
- `schematic.mmd`: Mermaid schematic
- `topology.json`: Topology snapshot
- `commissioning.md`: Commissioning guide
- `project-meta.json`: Project metadata

## Step 12: Iterate (Optional)

If changes are needed:

1. Edit topology
2. Click "确认拓扑" again
3. Review updated deliverables
4. Provide feedback on selections
5. Repeat as needed

## Tips

- **Be Specific**: Include all requirements in initial prompt for better results
- **Review Knowledge Base**: Upload relevant datasheets for better component selection
- **Provide Feedback**: Help Volta learn by providing 👍/👎 feedback
- **Save Versions**: Confirm topology at key milestones to save versions
- **Export Often**: Export packages regularly for backup

## Next Steps

- Try [Motor Control System Tutorial](motor-control-system.md)
- Explore [Safety Interlock Tutorial](safety-interlock.md)
- Read [User Guide](../USER_GUIDE.md) for more features
