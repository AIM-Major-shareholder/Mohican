from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CONFIGS = ROOT / "configs"

FORBIDDEN_BLOCK_KEYS = {"actions", "steps", "sequence", "pipeline", "chain"}
GENERATE_FORBIDDEN_PARAMS = {"strategies", "buffs", "target", "evaluator", "storage"}
STRENGTHEN_FORBIDDEN_PARAMS = {"categories", "modules", "target", "evaluator", "storage"}


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def fail(message: str) -> None:
    raise SystemExit(f"validation failed: {message}")


def validate_blocks(blocks_doc: dict[str, Any]) -> dict[str, dict[str, Any]]:
    blocks = blocks_doc.get("blocks")
    if not isinstance(blocks, list) or not blocks:
        fail("configs/blocks.json must contain a non-empty blocks list")

    by_id: dict[str, dict[str, Any]] = {}
    button_ids: set[str] = set()

    for block in blocks:
        block_id = block.get("id")
        if not isinstance(block_id, str) or not block_id:
            fail("each block must have an id")
        if block_id in by_id:
            fail(f"duplicate block id: {block_id}")
        by_id[block_id] = block

        if block.get("one_action") is not True:
            fail(f"{block_id} must set one_action=true")
        if not isinstance(block.get("operation"), str) or not block["operation"]:
            fail(f"{block_id} must define one operation")
        if FORBIDDEN_BLOCK_KEYS.intersection(block):
            fail(f"{block_id} contains composite action keys: {FORBIDDEN_BLOCK_KEYS.intersection(block)}")

        button_id = block.get("button_id")
        if not isinstance(button_id, str) or not button_id.startswith("btn-"):
            fail(f"{block_id} must define a btn-* button_id")
        if button_id in button_ids:
            fail(f"duplicate button id: {button_id}")
        button_ids.add(button_id)

        output_state = block.get("output_state")
        if not isinstance(output_state, str) or not output_state:
            fail(f"{block_id} must define exactly one output_state")

        params = block.get("params", {})
        if not isinstance(params, dict):
            fail(f"{block_id} params must be an object")
        operation = block["operation"]
        if operation.startswith("payload.generate") and GENERATE_FORBIDDEN_PARAMS.intersection(params):
            fail(f"{block_id} generate block includes non-generation params")
        if operation.startswith("payload.strengthen") and STRENGTHEN_FORBIDDEN_PARAMS.intersection(params):
            fail(f"{block_id} strengthen block includes non-strengthen params")

    return by_id


def validate_placements(placements_doc: dict[str, Any], block_ids: set[str]) -> None:
    layout = placements_doc.get("layout", {})
    if not isinstance(layout, dict):
        fail("module_placements layout must be an object")
    for zone, refs in layout.items():
        if not isinstance(refs, list):
            fail(f"layout zone {zone} must contain block ids")
        for block_id in refs:
            if block_id not in block_ids:
                fail(f"layout zone {zone} references missing block {block_id}")

    sources = placements_doc.get("sources")
    if not isinstance(sources, list) or not sources:
        fail("module_placements must contain sources")
    for source in sources:
        for key in ("payload_generate_block", "strengthen_block"):
            if source.get(key) not in block_ids:
                fail(f"{source.get('source')} references missing {key}: {source.get(key)}")
        for module in source.get("modules", []):
            for key in ("select_block", "generate_block"):
                if module.get(key) not in block_ids:
                    fail(f"module {module.get('id')} references missing {key}: {module.get(key)}")
        for strengthener in source.get("strengtheners", []):
            if strengthener.get("block") not in block_ids:
                fail(f"strengthener {strengthener.get('id')} references missing block")


def validate_scenarios(scenarios_doc: dict[str, Any], block_ids: set[str]) -> None:
    scenarios = scenarios_doc.get("scenarios")
    if not isinstance(scenarios, list) or not scenarios:
        fail("scenarios.json must contain scenarios")
    for scenario in scenarios:
        scenario_id = scenario.get("id")
        steps = scenario.get("steps")
        if not isinstance(steps, list) or not steps:
            fail(f"scenario {scenario_id} must contain steps")

        seen_orders: list[int] = []
        for step in steps:
            if FORBIDDEN_BLOCK_KEYS.intersection(step) - {"steps"}:
                fail(f"scenario {scenario_id} step contains composite action key")
            block_id = step.get("block_id")
            if block_id not in block_ids:
                fail(f"scenario {scenario_id} references missing block {block_id}")
            order = step.get("order")
            if not isinstance(order, int):
                fail(f"scenario {scenario_id} step {block_id} must have integer order")
            seen_orders.append(order)
            if "operation" in step:
                fail(f"scenario {scenario_id} step {block_id} must not override operation")
        if seen_orders != sorted(seen_orders) or len(seen_orders) != len(set(seen_orders)):
            fail(f"scenario {scenario_id} step orders must be unique and ascending")


def main() -> int:
    blocks_doc = load_json(CONFIGS / "blocks.json")
    placements_doc = load_json(CONFIGS / "module_placements.json")
    scenarios_doc = load_json(CONFIGS / "scenarios.json")

    blocks_by_id = validate_blocks(blocks_doc)
    block_ids = set(blocks_by_id)
    validate_placements(placements_doc, block_ids)
    validate_scenarios(scenarios_doc, block_ids)

    print(
        "ok: "
        f"{len(blocks_by_id)} blocks, "
        f"{len(placements_doc['sources'])} sources, "
        f"{len(scenarios_doc['scenarios'])} scenarios"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
