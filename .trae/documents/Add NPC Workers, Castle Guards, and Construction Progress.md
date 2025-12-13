## Scope
- Add simple NPCs: `Worker` and `CastleGuard` that spawn with the Castle.
- Implement building construction and repair progress based on building HP.
- Update AI loops, UI, and Build flow so buildings require workers to finish construction before functioning.

## Data & Config
- Buildings: add lifecycle flags: `constructed:boolean`, `isUnderConstruction:boolean`.
- Construction tuning: `buildRatePerWorker` default 25 HP/sec; repair rate 20 HP/sec.
- Castle: add `level:number` placeholder; use level=1 to spawn 1 guard; scalable later.

## Entities
- Create `Worker` entity (simple, like monsters):
  - Stats: `hp:70`, `speed:55`, `repair:20`, `build:25`, `radius:12`, `color:'#c2b280'`.
  - State: `IDLE`, `MOVE`, `BUILD`, `REPAIR`, `FLEE`.
  - Behavior: stays near Castle when idle; seeks nearest `EconomicBuilding` with `!constructed` to BUILD; else seeks damaged buildings to REPAIR; flees if monster within 120 and HP < 30%.
- Create `CastleGuard` entity:
  - Stats: `hp:140`, `damage:12`, `speed:60`, `radius:14`, `color:'#5c7a99'`.
  - Behavior: patrol in ring around Castle (radius ~180); engage nearest monster within 220; basic attack cooldown using Hero/Monster pattern.

## Building Lifecycle
- When placing a building:
  - Start at `hp=0`, `constructed=false`, `isUnderConstruction=true`.
  - Workers add to `hp` each tick while at the door; clamp to `maxHp`.
  - On reaching `hp>=maxHp`: set `constructed=true`, `isUnderConstruction=false` and enable building features.
- During repair:
  - If `constructed` and `hp<maxHp`, workers add repair ticks until full.

## AI Behaviors
- Worker:
  - `behaviorIdle`: find target building: prefer `isUnderConstruction`, else damaged.
  - `behaviorBuildRepair`: path to building door; when within 16px, add `buildRatePerWorker*dt` to `building.hp` (or `repairRate*dt`). Spawn small particles.
  - `behaviorFlee`: move to Castle if threatened.
- Guard:
  - `behaviorPatrol`: orbit Castle; reposition if too far.
  - `behaviorFight`: chase within range; attack if in range.

## Door Targeting
- Reuse door calculation used by heroes: `door = { x: b.x, y: b.y + b.height/2 - 5 }`.

## UI Updates
- Building inspector:
  - If `!constructed`: show `Constructing` label and a progress bar using `hp/maxHp`.
  - If `constructed` and damaged: show `Repairing` when a worker is assigned.
- Minimap: workers shown as small neutral dots; guards as blue dots.

## Integration Points
- `BuildManager.handleClick`: after spending gold, spawn `EconomicBuilding` with `hp=0`, `constructed=false`, `isUnderConstruction=true`.
- `EconomicBuilding.update`: 
  - If `!constructed`: disable Market trade and Tower attacks; render scaffolding tint; still allow `enter/exit` for healing only after constructed (or disable entering until complete if preferred).
  - Expose `needsConstruction()` and `isDamaged()` helpers.
- `Game` constructor:
  - Spawn `Worker` at Castle (1–2 for now).
  - Spawn `CastleGuard` count based on `castle.level` (1 at level 1).
  - Add them to `entities` and selection handling like Hero/Monster.

## Balancing Hooks
- Rates and thresholds in a small config object (e.g., `NPC_CONFIG`), easy to tweak.
- Future: multiple workers stack additively; cap per building to avoid instant completes.

## Safety & Edge Cases
- If all workers die: buildings remain under construction; UI indicates `No workers`. Player can recruit replacements later (future feature).
- Workers won’t enter unconstructed buildings; they only interact at door.
- Construction particles throttled to avoid performance spikes.

## Verification
- Place Market/Tower: observe `Constructing` bar; 1 worker completes in ~6s for Market (hp=150 @ 25 hp/s).
- Damage a constructed building: worker repairs to full; inspector shows repairing.
- Spawn monsters: guards patrol and intercept near Castle.

## Future Upgrades
- Castle level system that spawns/updates guard composition.
- Worker queue manager with priorities (construction > repair).
- Recruit/hire UI for additional workers.
- Scaffolding art and guard equipment variants.

Confirm this plan and I will implement the entities, building lifecycle, behaviors, and UI updates accordingly. 