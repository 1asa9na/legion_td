"""One-off reader for Legion TD War v1.50c.

Reads war3map.j, war3map.w3u and war3map.wts from a map extract and writes
content/src/data.ts. It is not part of the game runtime.

Stock weapon and balance rows are the Warcraft III values a unit inherits
when the map does not override that field. The map does not ship those
tables. Guard Tower dice and sides are what make Pyro's 100 dps hold.
"""

from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

# Vanilla rows for the base units this map's custom units inherit from.
STOCK = {
    "hfoo": {
        "dmgplus1": 11,
        "dice1": 1,
        "sides1": 2,
        "cool1": 1.35,
        "rangeN1": 90,
        "atkType1": "normal",
        "def": 2,
        "defType": "large",
        "HP": 420,
    },
    "hgtw": {
        "dmgplus1": 22,
        "dice1": 1,
        "sides1": 5,
        "cool1": 0.9,
        "rangeN1": 700,
        "atkType1": "pierce",
        "def": 5,
        "defType": "large",
        "HP": 500,
    },
    "hrif": {
        "dmgplus1": 16,
        "dice1": 2,
        "sides1": 4,
        "cool1": 1.5,
        "rangeN1": 400,
        "atkType1": "pierce",
        "def": 0,
        "defType": "medium",
        "HP": 520,
    },
    "hdhw": {
        "dmgplus1": 18,
        "dice1": 1,
        "sides1": 3,
        "cool1": 1.75,
        "rangeN1": 300,
        "atkType1": "pierce",
        "def": 1,
        "defType": "small",
        "HP": 575,
    },
    "Hpal": {
        "dmgplus1": 0,
        "dice1": 2,
        "sides1": 6,
        "cool1": 2.2,
        "rangeN1": 100,
        "atkType1": "hero",
        "def": 2,
        "defType": "hero",
        "HP": 100,
    },
}

ARMOR = {
    "small": "light",
    "medium": "medium",
    "large": "heavy",
    "fort": "fortified",
    # This map's misc table and armor icon make "normal" fortified.
    "normal": "fortified",
    "none": "unarmored",
    "hero": "hero",
    "divine": "divine",
}

FIELD = {
    "ua1b": "dmgplus1",
    "ua1d": "dice1",
    "ua1s": "sides1",
    "ua1c": "cool1",
    "ua1r": "rangeN1",
    "ua1t": "atkType1",
    "udef": "def",
    "udty": "defType",
    "uhpm": "HP",
}


def parse_wts(text: str) -> dict[int, str]:
    strings: dict[int, str] = {}
    current: int | None = None
    body: list[str] = []
    inside = False
    for line in text.splitlines():
        if line.startswith("STRING "):
            current = int(line.split()[1])
            body = []
            inside = False
            continue
        if current is not None and not inside and line.strip() == "{":
            inside = True
            continue
        if inside and line.strip() == "}":
            strings[current] = "\n".join(body).strip()
            current = None
            inside = False
            continue
        if inside:
            body.append(line)
    return strings


def parse_w3u(data: bytes) -> dict[str, tuple[str, dict]]:
    pos = 0

    def u32() -> int:
        nonlocal pos
        value = struct.unpack_from("<I", data, pos)[0]
        pos += 4
        return value

    def i32() -> int:
        nonlocal pos
        value = struct.unpack_from("<i", data, pos)[0]
        pos += 4
        return value

    def f32() -> float:
        nonlocal pos
        value = struct.unpack_from("<f", data, pos)[0]
        pos += 4
        return value

    def raw4() -> str:
        nonlocal pos
        chunk = data[pos : pos + 4]
        pos += 4
        return chunk.decode("latin1")

    def cstr() -> str:
        nonlocal pos
        end = data.index(b"\x00", pos)
        value = data[pos:end].decode("utf-8", "replace")
        pos = end + 1
        return value

    version = u32()
    if version != 2:
        raise SystemExit(f"unexpected w3u version {version}")

    objects: dict[str, tuple[str, dict]] = {}
    for _table in range(2):
        count = u32()
        for _ in range(count):
            base = raw4()
            new = raw4()
            mods: dict = {}
            for _mod in range(u32()):
                field = raw4()
                kind = u32()
                if kind == 0:
                    value = i32()
                elif kind in (1, 2):
                    value = f32()
                elif kind == 3:
                    value = cstr()
                else:
                    raise SystemExit(f"unknown field type {kind} on {new or base}")
                u32()
                mods[field] = value
            unit_id = base if "\x00" in new else new
            objects[unit_id] = (base, mods)
    if pos != len(data):
        raise SystemExit(f"w3u parse stopped at {pos} of {len(data)}")
    return objects


def string_value(strings: dict[int, str], mods: dict, field: str) -> str:
    raw = mods.get(field, "")
    if isinstance(raw, str) and raw.startswith("TRIGSTR_"):
        return strings.get(int(raw.split("_")[1]), raw)
    return raw if isinstance(raw, str) else ""


def number(value) -> int | float:
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, float):
        return round(value, 5)
    return value


def combat(base: str, mods: dict) -> dict:
    stock = STOCK[base]
    merged = dict(stock)
    for field, stock_key in FIELD.items():
        if field in mods and mods[field] != "":
            merged[stock_key] = mods[field]
    dice = int(merged["dice1"])
    sides = int(merged["sides1"])
    damage_base = int(merged["dmgplus1"])
    armor_raw = merged["defType"]
    attack = merged["atkType1"]
    if armor_raw not in ARMOR:
        raise SystemExit(f"unknown armor {armor_raw}")
    if attack not in {"pierce", "normal", "magic", "siege", "chaos", "hero", "spells"}:
        raise SystemExit(f"unknown attack {attack}")
    return {
        "hp": int(merged["HP"]),
        "armor": int(merged["def"]),
        "armorType": ARMOR[armor_raw],
        "attackType": attack,
        "damageMin": damage_base + dice,
        "damageMax": damage_base + dice * sides,
        "cooldown": number(float(merged["cool1"])),
        "range": number(float(merged["rangeN1"])),
    }


def comma_numbers(text: str) -> list[int]:
    """Same scan as the map: a comma starts a number, and S2I reads it."""
    values = []
    index = 0
    while index < len(text):
        if text[index] == ",":
            chunk = text[index + 1 : index + 3]
            digits = ""
            for char in chunk:
                if char.isdigit():
                    digits += char
                else:
                    break
            values.append(int(digits) if digits else 0)
        index += 1
    return values


def bounty_numbers(text: str) -> list[int]:
    return [int(part) for part in text.split(",") if part != ""]


def assign_levels(text: str, label: str) -> dict[int, str]:
    found: dict[int, str] = {}
    for level in comma_numbers(text):
        if level in found:
            raise SystemExit(f"{label} assigns level {level} twice")
        found[level] = label
    return found


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: extract-catalog.py <extract-dir>")
    root = Path(sys.argv[1])
    jass = (root / "war3map.j").read_text("utf-8", errors="replace")
    strings = parse_wts((root / "war3map.wts").read_text("utf-8-sig", errors="replace"))
    units = parse_w3u((root / "war3map.w3u").read_bytes())

    def grab(name: str) -> str:
        marker = f"set {name} = "
        found = None
        for line in jass.splitlines():
            stripped = line.strip()
            if stripped.startswith(marker):
                found = stripped.split("=", 1)[1].strip().strip('"')
        if found is None:
            raise SystemExit(f"missing {name}")
        return found

    sell = bounty_numbers(grab("udg_TowerSellAmountListMech"))
    counts = comma_numbers(grab("udg_LevelWaveCountList"))
    bounties = bounty_numbers(grab("udg_LevelBountyList"))
    attacks = {}
    for raw, label in (
        ("udg_ATKPierceList", "pierce"),
        ("udg_ATKNormalList", "normal"),
        ("udg_ATKMagicList", "magic"),
        ("udg_ATKSiegeList", "siege"),
        ("udg_ATKChaosList", "chaos"),
    ):
        attacks.update({level: label for level in comma_numbers(grab(raw))})
    armors = {}
    for raw, label in (
        ("udg_DEFLightList", "light"),
        ("udg_DEFMediumList", "medium"),
        ("udg_DEFHeavyList", "heavy"),
        ("udg_DEFFortifiedList", "fortified"),
        ("udg_DEFUnarmoredList", "unarmored"),
    ):
        armors.update({level: label for level in comma_numbers(grab(raw))})
    air = set(comma_numbers(grab("udg_AirList")))
    bosses = set(comma_numbers(grab("udg_BossList")))
    ranged = set(comma_numbers(grab("udg_RangeList")))

    pairs: list[tuple[str, str]] = []
    in_mech = False
    building = None
    for line in jass.splitlines():
        if "// Mech" in line:
            in_mech = True
            continue
        if in_mech and "// Beast" in line:
            break
        if "udg_TowerUnitArr[" in line:
            building = line.split("'")[1]
        elif "udg_TowerTypeArr[" in line and building:
            pairs.append((building, line.split("'")[1]))
            building = None
    if len(pairs) != len(sell):
        raise SystemExit(f"{len(pairs)} mech towers but {len(sell)} sell values")

    towers = []
    for (building_id, fighter_id), value in zip(pairs, sell):
        base, mods = units[fighter_id]
        upgrades = [
            part
            for part in str(mods.get("uupt", "")).split(",")
            if part and part != "0"
        ]
        towers.append(
            {
                "buildingId": building_id,
                "fighterId": fighter_id,
                "name": string_value(strings, mods, "unam"),
                "goldCost": int(mods["ugol"]),
                "value": value,
                # R2I in the map cuts off the fraction, so an odd value sells for half rounded down.
                "sellGold": int(value * 0.5),
                "food": int(mods.get("ufoo", 0)),
                "upgradesTo": upgrades,
                "stats": combat(base, mods),
            }
        )

    creep_ids = []
    for line in jass.splitlines():
        if "udg_Level_UnitType[" in line and "'" in line:
            creep_ids.append(line.split("'")[1])
        if "udg_bonusUnitType = '" in line:
            bonus_id = line.split("'")[1]
    if creep_ids[-1] != bonus_id or len(creep_ids) != 31:
        raise SystemExit(f"expected 30 waves plus bonus, got {creep_ids}")

    creeps = {}
    for creep_id in dict.fromkeys(creep_ids):
        base, mods = units[creep_id]
        creeps[creep_id] = {
            "id": creep_id,
            "name": string_value(strings, mods, "unam"),
            "stats": combat(base, mods),
        }

    waves = []
    for level in range(1, 31):
        creep_id = creep_ids[level - 1]
        creep = creeps[creep_id]
        if attacks.get(level) != creep["stats"]["attackType"]:
            raise SystemExit(
                f"level {level} attack list {attacks.get(level)} != unit {creep['stats']['attackType']}"
            )
        if armors.get(level) != creep["stats"]["armorType"]:
            raise SystemExit(
                f"level {level} armor list {armors.get(level)} != unit {creep['stats']['armorType']}"
            )
        waves.append(
            {
                "level": level,
                "creepId": creep_id,
                "count": counts[level - 1],
                "bounty": bounties[level - 1],
                "prepareSeconds": 35 + level,
                "endRoundGold": (5 * level) // 3 + 12,
                "attackType": attacks[level],
                "armorType": armors[level],
                "boss": level in bosses,
                "air": level in air,
                "ranged": level in ranged,
            }
        )

    bonus = {
        "level": 31,
        "creepId": bonus_id,
        "count": 5,
        "bounty": bounties[30],
        "attackType": creeps[bonus_id]["stats"]["attackType"],
        "armorType": creeps[bonus_id]["stats"]["armorType"],
    }

    payload = {
        "builderId": "u000",
        "sellPercent": 0.5,
        "towers": towers,
        "creeps": creeps,
        "waves": waves,
        "bonus": bonus,
    }
    out = Path(__file__).resolve().parents[1] / "content" / "src" / "data.ts"
    out.write_text(render(payload), encoding="utf-8")
    print(f"wrote {out}")
    print(f"mech towers {len(towers)} waves {len(waves)}")


def render(payload: dict) -> str:
    body = json.dumps(payload, indent=2, ensure_ascii=False)
    # JSON is also TypeScript when the values are plain data.
    return (
        "import type { CatalogData } from \"./types.js\";\n\n"
        "// Generated by tools/extract-catalog.py from Legion TD War v1.50c.\n"
        f"export const data: CatalogData = {body};\n"
    )


if __name__ == "__main__":
    main()
