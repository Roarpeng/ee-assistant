"""Commissioning step generator (GuidePanel data source).

Pure deterministic — no LLM cost, predictable output, easy to QA in
production. Steps are composed from:
- A baseline of six universal stages every electrical commissioning
  goes through (powering → wiring → program → IO → HMI/SCADA → field).
- Conditional steps injected based on what's actually in the BOM
  (VFD parameter setup, servo tuning, HMI screen download,
  fieldbus diagnostics).
- Conditional steps injected based on requirement metadata
  (safety validation when SIL2+ or PLd+).

Output shape: list[{title, body}] matching frontend's
`commissioningSteps`. The GuidePanel renders title in big numerals
and body as the actionable detail below.
"""
from __future__ import annotations


def _baseline_steps() -> list[dict]:
    """Universal commissioning stages, in dependency order. Conditional
    steps are spliced into this list at the right phase."""
    return [
        {
            "title": "上电与绝缘检查",
            "body": (
                "断开主开关,用 500V 兆欧表测量主电路对地绝缘 ≥ 0.5MΩ;"
                "确认控制电源 24VDC ± 5% 输出正常,纹波 < 200mV。"
            ),
        },
        {
            "title": "接线核对",
            "body": (
                "按原理图与接线表 (Wiring 标签页) 逐路核对端子号、线径、颜色;"
                "重点检查急停回路 (黄/绿,1.0mm²) 与模拟量屏蔽地的单点接地。"
            ),
        },
        {
            "title": "PLC 程序下载",
            "body": (
                "TIA Portal 在线连接,Compile All 通过后下载到 PLC;"
                "首次下载需在 STOP 模式,下载后切回 RUN。"
            ),
        },
        {
            "title": "IO 单元测试",
            "body": (
                "强制每路 DI/DO 单独通断,在 Watch Table 中验证状态与 Wiring 表一致;"
                "AI/AO 用信号发生器或万用表注入边界值校验线性度。"
            ),
        },
        {
            "title": "HMI / 上位机联调",
            "body": (
                "下载 HMI 工程,通讯指示灯转绿后切换到运行画面;"
                "逐个画面元素验证读写双向 — 不要漏掉报警画面的复位按钮。"
            ),
        },
        {
            "title": "现场调试与试运行",
            "body": (
                "按工艺顺序逐工步空载点动,再带载分段运行,记录任何异常并整改;"
                "完成后填写验收记录交付客户。"
            ),
        },
    ]


def _has_category(bom_items: list[dict], category: str) -> bool:
    return any((it.get("category") or "").strip() == category for it in (bom_items or []))


def _requires_safety_validation(safety_level: str | None) -> bool:
    if not safety_level:
        return False
    s = safety_level.strip().upper()
    return s in {"SIL2", "SIL3", "SIL 2", "SIL 3", "PLD", "PL D", "PLE", "PL E"}


def generate_commissioning_steps(
    bom_items: list[dict] | None,
    requirement: dict | None,
) -> list[dict]:
    """Produce a commissioning step list tailored to this project."""
    steps = _baseline_steps()
    req = requirement or {}

    # Conditional insertions — each placed at the right phase of the
    # baseline. Position rules:
    # - VFD parameter setup: after program download, before IO test
    # - Servo tuning: after IO test, before HMI
    # - HMI screen: replaces the generic HMI step body with model-specific text
    # - Safety validation: just before field test (last)
    # - Fieldbus scan: after program download, before IO test (parallel
    #   to VFD setup so we group them)

    if _has_category(bom_items or [], "Communication_Module"):
        insert_at = next(
            (i for i, s in enumerate(steps) if "IO 单元" in s["title"]),
            len(steps),
        )
        steps.insert(insert_at, {
            "title": "现场总线网络扫描",
            "body": (
                "在 PROFINET/EtherCAT 主站执行设备扫描,确认拓扑与设计一致;"
                "重点核对 IP/MAC 地址、设备名 (PN-Name) 与 GSD/ESI 文件版本。"
            ),
        })

    if _has_category(bom_items or [], "VFD"):
        insert_at = next(
            (i for i, s in enumerate(steps) if "IO 单元" in s["title"]),
            len(steps),
        )
        steps.insert(insert_at, {
            "title": "变频器参数设置 (VFD)",
            "body": (
                "电机铭牌数据写入 P0300-P0335;启停源 P0700=2/5 (端子/总线);"
                "频率源 P1000;加减速时间 P1120/P1121;电流限幅 P0640;"
                "首次启动执行电机自学习 (P1910/P1960)。"
            ),
        })

    if _has_category(bom_items or [], "Servo_Drive"):
        # Insert after IO test, before HMI联调
        insert_at = next(
            (i for i, s in enumerate(steps) if "HMI" in s["title"]),
            len(steps),
        )
        steps.insert(insert_at, {
            "title": "伺服调谐与原点回归",
            "body": (
                "确认编码器接线 ABZ 三相后,JOG 模式低速验证旋转方向;"
                "执行自动增益调谐 (One-Touch Tuning),记录 Pn100/Pn101;"
                "建立原点 (Home Position) 并测试软限位与硬限位。"
            ),
        })

    if _requires_safety_validation(req.get("safety_level")):
        # Insert just before the last step (field commissioning)
        steps.insert(-1, {
            "title": "安全回路验证",
            "body": (
                "按 ISO 13849-1 / IEC 62061 计算 PFHd,使用 SISTEMA 工具"
                "形成验证文档;实测急停响应时间 < 设计值,记录测试结果交付。"
            ),
        })

    return steps
