import { Utils } from '../utils.js';
import { Stats } from '../components/Stats.js';
import { Inventory } from '../components/Inventory.js';
import { CLASS_CONFIG, SKILL_CONFIG } from '../config/ClassConfig.js';
import { Projectile } from './Projectile.js';
import { Particle } from './Particle.js';
import { ItemDrop } from './ItemDrop.js';
import { ITEM_CONFIG, EQUIPMENT, STARTING_EQUIPMENT } from '../config/ItemConfig.js';
import { DebugLogger } from '../systems/DebugLogger.js';
import { GameLogger } from '../systems/GameLogger.js';

export class Hero {
    constructor(x, y, type) {
        // FIX: Validate spawn coordinates
        this.x = Number.isFinite(x) ? x : 400;
        this.y = Number.isFinite(y) ? y : 400;

        // Normalize type to new names (MERCENARY/WAYFARER)
        // Support legacy WARRIOR/RANGER for backward compatibility
        if (type === 'WARRIOR') type = 'MERCENARY';
        if (type === 'RANGER') type = 'WAYFARER';
        this.type = CLASS_CONFIG[type] ? type : 'MERCENARY';
        if (!CLASS_CONFIG[type]) {
            console.warn('[Hero] Invalid type:', type, '- defaulting to MERCENARY');
        }

        // Get color from config or fallback
        const classConfig = CLASS_CONFIG[this.type];
        this.color = classConfig?.color || '#3498db';
        this.radius = 15;
        this.visible = true;
        this.vel = { x: 0, y: 0 };
        this.acc = { x: 0, y: 0 };

        this.name = Utils.generateFantasyName(this.type);
        this.personality = {
            brave: Utils.rand(0.3, 1.0),
            greedy: Utils.rand(0.3, 1.0),
            smart: Utils.rand(0.3, 1.0),
            social: Utils.rand(0.3, 1.0) // NEW: Social trait
        };
        this.history = { kills: 0, goldEarned: 0, nearDeath: 0, timesWounded: 0 };

        this.level = 1;
        const config = CLASS_CONFIG[this.type];
        this.stats = new Stats(config.baseStats, this.level, this.type);

        this.inventory = new Inventory(); // Belt-based system (no capacity parameter)
        this.gold = 0;

        // EQUIPMENT SYSTEM
        const startingEquip = STARTING_EQUIPMENT[this.type] || STARTING_EQUIPMENT.WARRIOR;
        this.equipment = {
            weapon: EQUIPMENT[startingEquip.weapon] || null,
            armor: EQUIPMENT[startingEquip.armor] || null
        };

        // Calculate max HP with armor bonus
        const armorHpBonus = this.equipment.armor?.hp || 0;
        this.hp = this.stats.derived.maxHP + armorHpBonus;
        this.maxHp = this.stats.derived.maxHP + armorHpBonus;
        this.xp = 0;
        this.xpToNextLevel = 100;

        this.attackCooldown = 0;
        this.lastDamageTime = 0;

        this.state = 'DECISION';
        this.target = null;
        this.wanderTarget = { x: x, y: y };
        this.wanderTimer = 0;

        // BALANCING
        this.decisionTimer = 0; // Delay between major decisions
        this.maxStamina = Math.floor(this.stats.derived.staminaMax);
        this.stamina = this.maxStamina;
        this.staminaRegen = this.stats.derived.staminaRegen; // Per second
        this.tiredCooldown = 0; // Cooldown for "TIRED" particle spam
        this.shopTimer = 0;     // Time to spend shopping
        this.lastShopTime = -100; // Allow immediate shopping at start
        this.fateUsed = false;

        // SKILL SYSTEM - New implementation
        this.learnedSkills = {};           // { skillId: true } - Skills hero has learned
        this.skillCooldowns = {};          // { skillId: lastUsedTime } - Track cooldowns
        this.skillActive = null;           // Currently executing skill
        this.skillLockTimer = 0;           // Lock during skill execution
        this.tumbleCooldown = 0;           // Specific cooldown for tumble (backward compat)

        this.actionLockTimer = 0;
        this.isAiming = false;
        this.aimingTimer = 0;
        this.reactionTimer = 0;
        this.nextState = null; this.nextTarget = null;
        this.isEngaged = false; this.engagedLockTimer = 0;
        this.moveBlocked = false;
        this.blockedTimer = 0;
        this.blockedSide = 0;
        this.victoryTimer = 0;
        this.attackWindup = 0;
        this.lungeTimer = 0;
        this.lungeVec = { x: 0, y: 0 };
        this.flashTimer = 0;
        this.preparedAttack = false; // Fix for attack windup loop
        this.stuckTimer = 0;
        this.lastMoveX = x;
        this.lastMoveY = y;
        this.isInsideBuilding = false;
        this.buildingTimeout = 0;
        this.stuckAttempts = 0;
        this.doorApproachTimer = 0;
        this.walkPhase = 0;

        // A* Pathfinding properties
        this.currentPath = null;      // Array of waypoints [{x, y}, ...]
        this.waypointIndex = 0;       // Current waypoint we're moving towards
        this.pathRefreshTimer = 0;    // Timer to refresh path periodically
        this.pathRefreshInterval = 1.0; // Refresh path every 1 second
        this.lastPathTarget = null;   // Last target we calculated path for

        // AUTO-LEARN TIER 1 SKILL: Heroes start with their basic skill
        // This gives them combat flavor from the start
        const classSkills = SKILL_CONFIG[this.type];
        if (classSkills) {
            for (const skillId of Object.keys(classSkills)) {
                const skill = classSkills[skillId];
                if (skill.tier === 1 && !skill.isPassive) {
                    this.learnSkill(skillId);
                    break; // Only learn the first tier-1 skill
                }
            }
        }
    }

    update(dt, game) {
        // Safety check for NaN coordinates
        if (isNaN(this.x) || isNaN(this.y)) {
            this.x = this.prevX || game.castle.x;
            this.y = this.prevY || (game.castle.y + 60);
            this.vel = { x: 0, y: 0 };
            this.acc = { x: 0, y: 0 };
        }

        if (this.hp <= 0) {
            GameLogger.log('DEATH', this, 'HERO_KILLED', { hp: this.hp, state: this.state, position: { x: this.x, y: this.y } });
            this.remove = true;
            return;
        }

        if (!this.visible) {
            // CRITICAL FIX: If invisible but NOT properly inside a building, restore visibility
            // This handles edge cases where hero becomes invisible without proper building entry
            const validInvisibleStates = ['SHOP_INSIDE', 'RESTING_INSIDE'];
            const shouldBeInvisible = validInvisibleStates.includes(this.state) && this.isInsideBuilding && this.inBuilding;

            if (!shouldBeInvisible) {
                // Hero is invisible but shouldn't be - restore them
                GameLogger.log('VISIBILITY', this, 'RESTORED_FROM_INVALID_INVISIBLE', { state: this.state, isInsideBuilding: this.isInsideBuilding, position: { x: this.x, y: this.y } });
                this.visible = true;
                this.isInsideBuilding = false;
                this.inBuilding = null;
                // Restore position if at invalid coordinates
                if (this.x < 0 || this.y < 0 || isNaN(this.x) || isNaN(this.y)) {
                    this.x = game.castle.x + Utils.rand(-30, 30);
                    this.y = game.castle.y + 60;
                    this.vel = { x: 0, y: 0 };
                    this.acc = { x: 0, y: 0 };
                }
                this.state = 'DECISION';
                this.target = null;
                game.entities.push(new Particle(this.x, this.y - 30, "!", "yellow"));
                return;
            }

            // Handle valid invisible states
            if (this.state === 'SHOP_INSIDE') { this.behaviorShopInside(dt, game); return; }
            if (this.state === 'RESTING_INSIDE') { this.behaviorRestingInside(dt, game); return; }
            return;
        }

        if (this.attackCooldown > 0) this.attackCooldown -= dt;
        if (this.actionLockTimer > 0) this.actionLockTimer -= dt;
        if (this.aimingTimer > 0) { this.aimingTimer -= dt; if (this.aimingTimer <= 0) this.isAiming = false; }
        if (this.tiredCooldown > 0) this.tiredCooldown -= dt;
        if (this.skillLockTimer > 0) this.skillLockTimer -= dt;
        // STAMINA REGEN
        if (this.stamina < this.maxStamina) {
            this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegen * dt);
        }

        if (this.skillActive && game.gameTime >= this.skillActive.activeUntil) {
            this.skillActive = null;
        }
        if (this.attackWindup > 0) this.attackWindup -= dt;
        if (this.lungeTimer > 0) this.lungeTimer -= dt;
        if (this.flashTimer > 0) this.flashTimer -= dt;
        if (this.reactionTimer > 0) {
            this.reactionTimer -= dt;
            if (this.reactionTimer > 0) return;
            if (this.nextState) { this.state = this.nextState; this.target = this.nextTarget; this.nextState = null; this.nextTarget = null; }
        }
        if (this.state !== 'FIGHT') { this.isEngaged = false; this.engagedLockTimer = 0; }

        const retreatPercent = this.stats.derived.retreatThreshold / this.personality.brave;
        const retreatHP = this.maxHp * Utils.clamp(retreatPercent, 0.1, 0.8);

        if (this.hp < retreatHP && this.state !== 'RETREAT') {
            this.state = 'RETREAT';
            this.target = this.findHome(game);
            this.history.nearDeath++;
            game.entities.push(new Particle(this.x, this.y - 40, "FLEE!", "white"));
        }

        this.maintainSpace(game.entities, dt);

        // NEW: Auto-use potions when HP is low
        this.checkPotionUsage(game);

        // PROACTIVE SKILL CHECK: Allow ranged heroes to use defensive skills outside of FIGHT
        // This enables Wayfarer to Tumble when enemies approach during exploration
        const classConfig = CLASS_CONFIG[this.type];
        if (classConfig?.isRanged && this.state !== 'FIGHT') {
            // Find nearby threat for skill trigger check
            const threat = game.entities.find(e =>
                e.constructor.name === 'Monster' &&
                !e.remove &&
                Utils.dist(this.x, this.y, e.x, e.y) < 100
            );
            if (threat) {
                this.target = threat; // Temporarily set target for skill check
                this.tryUseSkills(game);
            }
        }

        // State Machine
        switch (this.state) {
            case 'RETREAT':
                this.behaviorRetreat(dt, game);
                break;
            case 'RETREAT_ENTERING':
                this.behaviorRetreatEntering(dt, game);
                break;
            case 'RESTING_INSIDE':
                this.behaviorRestingInside(dt, game);
                break;
            case 'DECISION':
                this.behaviorDecision(dt, game);
                break;
            case 'FIGHT':
                this.behaviorFight(dt, game);
                break;
            case 'QUEST':
                this.behaviorQuest(dt, game);
                break;
            case 'SHOP':
                this.behaviorShop(dt, game);
                break;
            case 'SHOP_ENTERING':
                this.behaviorShopEntering(dt, game);
                break;
            case 'SHOP_INSIDE':
                this.behaviorShopInside(dt, game);
                break;
            case 'VICTORY':
                this.behaviorVictory(dt, game);
                break;
            case 'PATROL':
                this.behaviorPatrol(dt, game);
                break;
            case 'EXPLORE':
                this.behaviorExplore(dt, game);
                break;
        }

        // FIX: Process accumulated acceleration into velocity and position
        // Without this, heroes never move when using moveTowards()!
        this.integrate(dt, game);
    }

    /**
     * DECISION 2.0: Affinity-Based Action Choice
     * Uses patrolAffinity/exploreAffinity from ClassConfig and personality traits.
     */
    decideNextAction(game) {
        const hasPotionNeed = !this.inventory.isBeltFull();
        const lowGold = this.gold < 50;
        const healthy = this.hp >= this.maxHp * 0.9;

        // Get class affinities from config
        const classConfig = CLASS_CONFIG[this.type];
        let exploreW = classConfig?.exploreAffinity ?? 0.5;
        let patrolW = classConfig?.patrolAffinity ?? 0.5;

        // Personality modifiers
        // Greedy heroes want to explore for loot
        if (this.personality?.greedy > 0.6) {
            exploreW += 0.15;
        }

        // Smart heroes patrol more efficiently (less wasted wandering)
        if (this.personality?.smart > 0.6) {
            patrolW += 0.1;
        }

        // If low on gold or missing potions, explore to find resources
        if (lowGold || hasPotionNeed) {
            exploreW += 0.2;
            patrolW -= 0.1;
        }

        // If healthy, more willing to explore dangerous areas
        if (healthy) {
            exploreW += 0.1;
        }

        // Normalize weights
        exploreW = Utils.clamp(exploreW, 0, 1);
        patrolW = Utils.clamp(patrolW, 0, 1);
        const total = exploreW + patrolW;
        const exploreChance = exploreW / total;

        const roll = Math.random();
        if (roll < exploreChance) {
            const pt = this.getExplorePoint(game);
            this.exploreTarget = pt;
            this.exploreTimer = 6.0;
            this.state = 'EXPLORE';
        } else {
            this.setupPatrolRoute(game);
            this.state = 'PATROL';
        }
    }

    getExplorePoint(game) {
        const cx = game.castle.x, cy = game.castle.y;
        const w = game.canvas.width, h = game.canvas.height;
        const maxR = Math.hypot(w, h) * 0.5;
        const angle = Math.random() * Math.PI * 2;
        const radius = Utils.clamp(maxR * (0.6 + Math.random() * 0.35), 0, maxR);
        let px = cx + Math.cos(angle) * radius;
        let py = cy + Math.sin(angle) * radius;
        px = Math.max(0, Math.min(w, px));
        py = Math.max(0, Math.min(h, py));
        const pt = { x: px, y: py };
        const valid = this.isPointReachable(pt, game);
        if (valid) return pt;
        return { x: cx + Utils.rand(-50, 50), y: cy + Utils.rand(30, 80) };
    }
    isPointReachable(pt, game) {
        const obstacles = game.getObstacles();
        for (const o of obstacles) {
            if (pt.x >= o.x1 && pt.x <= o.x2 && pt.y >= o.y1 && pt.y <= o.y2) return false;
        }
        return true;
    }

    /**
     * EXPLORE 2.0: Natural Discovery & Smart Threat Response
     * - Heroes don't beeline to POIs, they discover them naturally
     * - Personality-based threat evaluation when encountering danger
     */
    behaviorExplore(dt, game) {
        if (!this.exploreTarget) {
            this.state = 'DECISION';
            return;
        }

        // DISCOVERY RADIUS: Based on INT stat
        const discoveryRadius = 80 + (this.stats?.current?.INT || 5) * 4; // 80-120px

        // Check for POI discovery while moving
        const nearbyPOIs = game.entities.filter(e =>
            e.constructor?.name === 'POI' &&
            !e.remove &&
            Utils.dist(this.x, this.y, e.x, e.y) < discoveryRadius
        );

        for (const poi of nearbyPOIs) {
            // Mark as discovered (shows particle effect once)
            if (!poi.discovered) {
                poi.markDiscovered(this, game);
            }

            // TREASURE: Approach and loot if within interaction range
            if (poi.type === 'TREASURE' && Utils.dist(this.x, this.y, poi.x, poi.y) < poi.interactRadius + 10) {
                poi.interact(this, game);
                // Greedy heroes might continue exploring for more
                if (this.personality?.greedy > 0.7) {
                    this.exploreTarget = this.getExplorePoint(game);
                    this.exploreTimer = 6.0;
                } else {
                    this.state = 'DECISION';
                }
                return;
            }
        }

        // THREAT DETECTION: Check for monsters/dens during exploration
        const perceptionRange = this.stats?.derived?.perceptionRange || 150;
        const nearbyMonsters = game.entities.filter(e =>
            e.constructor?.name === 'Monster' &&
            !e.remove &&
            Utils.dist(this.x, this.y, e.x, e.y) < perceptionRange
        );

        if (nearbyMonsters.length > 0) {
            // SMART THREAT EVALUATION
            const decision = this.evaluateExplorationThreat(nearbyMonsters, game);

            switch (decision) {
                case 'FIGHT':
                    this.target = nearbyMonsters[0];
                    this.state = 'FIGHT';
                    game.entities.push(new Particle(this.x, this.y - 30, "!", "#ff6600"));
                    return;

                case 'FLEE':
                    // Run away from closest threat
                    const closest = nearbyMonsters.sort((a, b) =>
                        Utils.dist(this.x, this.y, a.x, a.y) - Utils.dist(this.x, this.y, b.x, b.y)
                    )[0];
                    const fleeAngle = Math.atan2(this.y - closest.y, this.x - closest.x);
                    this.x += Math.cos(fleeAngle) * this.stats.derived.moveSpeedMultiplier * 60 * dt;
                    this.y += Math.sin(fleeAngle) * this.stats.derived.moveSpeedMultiplier * 60 * dt;
                    game.entities.push(new Particle(this.x, this.y - 30, "!!", "#e74c3c"));
                    return;

                case 'REROUTE':
                    // Find alternative explore point away from danger
                    this.exploreTarget = this.getExplorePoint(game);
                    game.entities.push(new Particle(this.x, this.y - 30, "...", "#9b59b6"));
                    return;

                case 'IGNORE':
                default:
                    // Continue exploring, stay alert
                    break;
            }
        }

        // Standard explore movement
        const d = Utils.dist(this.x, this.y, this.exploreTarget.x, this.exploreTarget.y);
        if (d < 15) {
            this.state = 'DECISION';
            this.exploreTarget = null;
            return;
        }

        this.exploreTimer = (this.exploreTimer || 0) - dt;
        if (this.exploreTimer <= 0) {
            this.state = 'DECISION';
            this.exploreTarget = null;
            return;
        }

        const beforeX = this.x, beforeY = this.y;
        this.moveWithPathfinding(this.exploreTarget.x, this.exploreTarget.y, dt, game, true);
        const moved = Utils.dist(beforeX, beforeY, this.x, this.y);

        if (moved < 1) {
            this.stuckTimer += dt;
        } else {
            this.stuckTimer = 0;
            this.stuckAttempts = 0;
        }

        if (this.stuckTimer > 2.0 && d > 25) {
            this.stuckAttempts = (this.stuckAttempts || 0) + 1;
            if (this.stuckAttempts > 3) {
                this.state = 'DECISION';
                this.stuckAttempts = 0;
                this.stuckTimer = 0;
                return;
            }
            this.exploreTarget = this.getExplorePoint(game);
            this.stuckTimer = 0;
        }
    }

    /**
     * EXPLORE 2.0: Evaluate threat during exploration
     * Returns: 'FIGHT' | 'FLEE' | 'REROUTE' | 'IGNORE'
     */
    evaluateExplorationThreat(monsters, game) {
        if (monsters.length === 0) return 'IGNORE';

        const brave = this.personality?.brave ?? 0.5;
        const smart = this.personality?.smart ?? 0.5;
        const greedy = this.personality?.greedy ?? 0.5;

        // Calculate average threat level
        let totalThreat = 0;
        for (const m of monsters) {
            totalThreat += this.evaluateThreatLevel(m);
        }
        const avgThreat = totalThreat / monsters.length;

        // Check if there's treasure nearby worth fighting for
        const nearbyTreasure = game.entities.find(e =>
            e.constructor?.name === 'POI' &&
            e.type === 'TREASURE' &&
            !e.remove &&
            Utils.dist(this.x, this.y, e.x, e.y) < 150
        );

        // HP check
        const hpPercent = this.hp / this.maxHp;

        // BRAVE HEROES: Fight if threat is manageable
        if (brave > 0.7) {
            if (avgThreat < 50) return 'FIGHT';
            if (avgThreat < 80 && hpPercent > 0.6) return 'FIGHT';
            return 'FIGHT'; // Brave to the end
        }

        // COWARD HEROES: Flee at first sight
        if (brave < 0.4) {
            if (avgThreat > 20) return 'FLEE';
            if (monsters.length > 1) return 'FLEE';
            return 'REROUTE'; // Even low threat makes them nervous
        }

        // SMART HEROES: Make optimal decision
        if (smart > 0.6) {
            if (avgThreat < 30 && hpPercent > 0.7) return 'FIGHT';
            if (avgThreat < 50 && nearbyTreasure && greedy > 0.5) return 'FIGHT';
            if (avgThreat > 60 || hpPercent < 0.4) return 'REROUTE';
            return 'IGNORE'; // Wait and see
        }

        // GREEDY HEROES: Fight if treasure nearby
        if (greedy > 0.7) {
            if (nearbyTreasure && avgThreat < 60) return 'FIGHT';
            if (hpPercent < 0.3) return 'FLEE'; // Save the gold!
        }

        // DEFAULT: Moderate response
        if (avgThreat < 40) return 'FIGHT';
        if (avgThreat > 70) return 'FLEE';
        return 'REROUTE';
    }

    /**
     * PATROL 2.0: Building-Bound Patrol System
     * Sets up a patrol route that visits random buildings in the city.
     * Hero lingers at each building for a short time before moving to next.
     */
    setupPatrolRoute(game) {
        // Get all buildings in the city
        const buildings = game.entities.filter(e =>
            e.constructor.name === 'EconomicBuilding' ||
            e.constructor.name === 'Castle'
        );

        if (buildings.length === 0) {
            // Fallback: patrol around castle
            if (game.castle) {
                this.patrolRoute = [
                    { x: game.castle.x - 60, y: game.castle.y + 50 },
                    { x: game.castle.x + 60, y: game.castle.y + 50 }
                ];
            } else {
                this.patrolRoute = [];
            }
            this.patrolIdx = 0;
            this.patrolTimer = 15.0;
            this.patrolLingerTimer = 0;
            return;
        }

        // Pick 3-5 random buildings to visit
        const numWaypoints = 3 + Math.floor(Math.random() * 3);
        const shuffled = [...buildings].sort(() => Math.random() - 0.5);
        const selectedBuildings = shuffled.slice(0, Math.min(numWaypoints, buildings.length));

        // Generate perimeter waypoints around each building
        this.patrolRoute = selectedBuildings.map(building => {
            // Calculate a point on the building's perimeter (south side preferred for visibility)
            const angle = Math.PI * 0.5 + (Math.random() - 0.5) * Math.PI * 0.5; // 45° to 135° (south-ish)
            const radius = (building.width || 40) * 0.5 + 25; // Outside building footprint
            return {
                x: building.x + Math.cos(angle) * radius,
                y: building.y + Math.sin(angle) * radius,
                building: building // Reference for threat detection
            };
        });

        this.patrolIdx = 0;
        this.patrolTimer = 20.0;  // Total patrol duration
        this.patrolLingerTimer = 0;  // Time spent at current waypoint
        this.isLingering = false;
    }

    /**
     * PATROL 2.0: Building-Bound Patrol Behavior
     * - Visits random buildings and lingers for 3-5 seconds
     * - Enhanced threat detection: responds to building attacks
     * - +50% perception range while patrolling
     */
    behaviorPatrol(dt, game) {
        // Setup route if needed
        if (!this.patrolRoute || this.patrolRoute.length === 0) {
            this.setupPatrolRoute(game);
            if (!this.patrolRoute || this.patrolRoute.length === 0) {
                this.state = 'DECISION';
                return;
            }
        }

        // THREAT DETECTION: Check if any building is under attack
        // Patrol heroes have boosted perception (+50%)
        const boostedPerception = (this.stats?.derived?.perceptionRange || 200) * 1.5;
        const buildingUnderAttack = game.entities.find(e =>
            (e.constructor.name === 'EconomicBuilding' || e.constructor.name === 'Castle') &&
            e.hp < e.maxHp && // Has taken damage
            e.lastDamageTime && (game.gameTime - e.lastDamageTime) < 2.0 && // Damaged recently
            Utils.dist(this.x, this.y, e.x, e.y) < boostedPerception
        );

        if (buildingUnderAttack) {
            // Find the attacker
            const attacker = game.entities.find(m =>
                m.constructor.name === 'Monster' &&
                !m.remove &&
                Utils.dist(m.x, m.y, buildingUnderAttack.x, buildingUnderAttack.y) < 80
            );
            if (attacker) {
                this.target = attacker;
                this.state = 'FIGHT';
                game.entities.push(new Particle(this.x, this.y - 30, "DEFEND!", "#ffcc00"));
                return;
            }
        }

        const tgt = this.patrolRoute[this.patrolIdx];
        const d = Utils.dist(this.x, this.y, tgt.x, tgt.y);

        // LINGER MECHANIC: Pause at each waypoint
        if (this.isLingering) {
            this.patrolLingerTimer -= dt;
            if (this.patrolLingerTimer <= 0) {
                // Done lingering, move to next waypoint
                this.isLingering = false;
                this.patrolIdx++;
                if (this.patrolIdx >= this.patrolRoute.length) {
                    this.state = 'DECISION';
                    return;
                }
            }
            // Stay in place while lingering (idle animation state)
            return;
        }

        // Arrived at waypoint
        if (d < 20) {
            // Start lingering at this building
            this.isLingering = true;
            this.patrolLingerTimer = 3.0 + Math.random() * 2.0; // 3-5 seconds
            return;
        }

        // Moving to waypoint
        const beforeX = this.x, beforeY = this.y;
        this.moveWithPathfinding(tgt.x, tgt.y, dt, game, true);
        const moved = Utils.dist(beforeX, beforeY, this.x, this.y);

        if (moved < 1) {
            this.stuckTimer += dt;
        } else {
            this.stuckTimer = 0;
            this.stuckAttempts = 0;
        }

        if (this.stuckTimer > 2.0 && d > 25) {
            // Skip to next waypoint if stuck
            this.patrolIdx = Math.min(this.patrolIdx + 1, this.patrolRoute.length - 1);
            this.stuckAttempts = (this.stuckAttempts || 0) + 1;
            if (this.stuckAttempts > 3) {
                this.state = 'DECISION';
                this.stuckAttempts = 0;
                return;
            }
            this.stuckTimer = 0;
        }

        // Overall patrol timer
        this.patrolTimer = (this.patrolTimer || 0) - dt;
        if (this.patrolTimer <= 0) {
            this.state = 'DECISION';
        }
    }
    findHome(game) {
        // Prioritize Guilds
        let best = null;
        let minDist = Infinity;

        // First pass: Look for Guilds
        game.entities.forEach(e => {
            if (e.constructor.name.includes('Guild') && !e.remove && e.constructed && e.hp > 0) {
                const d = Utils.dist(this.x, this.y, e.x, e.y);
                if (d < minDist) { minDist = d; best = e; }
            }
        });

        if (best) return best;

        // Second pass: Any EconomicBuilding
        minDist = Infinity;
        game.entities.forEach(e => {
            if ((e.constructor.name === 'EconomicBuilding') && !e.remove && e.constructed && e.hp > 0) {
                const d = Utils.dist(this.x, this.y, e.x, e.y);
                if (d < minDist) { minDist = d; best = e; }
            }
        });
        return best || game.castle;
    }

    behaviorResting(dt, game) {
        if (this.hp >= this.maxHp) {
            if (this.target && this.target.exit) {
                this.target.exit(this);
            } else {
                this.visible = true;
            }
            this.state = 'DECISION';
            this.target = null;
            game.entities.push(new Particle(this.x, this.y - 30, "Ready!", "lime"));
        }
        if (this.isInsideBuilding && this.buildingTimeout > 0) {
            this.buildingTimeout -= dt;
            if (this.buildingTimeout <= 0) {
                if (this.target && this.target.exit) this.target.exit(this);
                this.state = 'DECISION';
                this.target = null;
            }
        }
    }

    behaviorRetreat(dt, game) {
        if (!this.target || this.target.remove) {
            this.target = this.findHome(game);
        }

        const door = game.getDoorPoint(this.target);
        const distToDoor = Utils.dist(this.x, this.y, door.x, door.y);
        if (this.visible) {
            if (distToDoor < 40 && !this.isInsideBuilding) {
                this.doorApproachTimer += dt;
                if (distToDoor < 25 || this.doorApproachTimer > 2.0) {
                    const entered = this.target.enter && this.target.enter(this);
                    if (entered || this.isInsideBuilding) {
                        this.state = 'RESTING_INSIDE';
                        this.doorApproachTimer = 0;
                    } else {
                        this.state = 'DECISION';
                        this.doorApproachTimer = 0;
                        return;
                    }
                } else {
                    // FIX: Increased acceleration for final approach
                    const dx = door.x - this.x, dy = door.y - this.y;
                    const len = Math.hypot(dx, dy) || 1;
                    const approachSpeed = 300;
                    this.acc.x += (dx / len) * approachSpeed;
                    this.acc.y += (dy / len) * approachSpeed;
                }
            } else {
                this.moveWithPathfinding(door.x, door.y, dt, game, true);
            }
        }
    }

    behaviorRetreatEntering(dt, game) {
        if (!this.target) { this.state = 'DECISION'; return; }
        const door = game.getDoorPoint(this.target);
        const dist = Utils.dist(this.x, this.y, door.x, door.y);
        this.doorApproachTimer += dt;
        if (dist < 25 || this.doorApproachTimer > 2.0) {
            const entered = this.target.enter && this.target.enter(this);
            if (entered || this.isInsideBuilding) {
                this.state = 'RESTING_INSIDE';
                this.doorApproachTimer = 0;
                return;
            } else {
                this.state = 'DECISION';
                this.doorApproachTimer = 0;
                return;
            }
        }
        const dx = door.x - this.x, dy = door.y - this.y;
        const len = Math.hypot(dx, dy) || 1;
        this.acc.x += (dx / len) * 120 * dt;
        this.acc.y += (dy / len) * 120 * dt;

    }

    behaviorRestingInside(dt, game) {
        if (this.hp >= this.maxHp) {
            if (this.target && this.target.exit) this.target.exit(this);
            this.state = 'DECISION';
            this.target = null;
            game.entities.push(new Particle(this.x, this.y - 30, "Ready!", "lime"));
            return;
        }
        if (this.isInsideBuilding && this.buildingTimeout > 0) {
            this.buildingTimeout -= dt;
            if (this.buildingTimeout <= 0) {
                if (this.target && this.target.exit) this.target.exit(this);
                this.state = 'DECISION';
                this.target = null;
            }
        }
    }

    behaviorDecision(dt, game) {
        // FIX: Safeguard - ensure hero is visible when in DECISION state
        if (!this.visible && !this.isInsideBuilding) {
            this.visible = true;
            // Restore position if hero is at invalid location
            if (this.x < 0 || this.y < 0 || isNaN(this.x) || isNaN(this.y)) {
                this.x = game.castle.x + Utils.rand(-30, 30);
                this.y = game.castle.y + 60;
            }
        }

        if (this.nextState) return;
        const range = this.stats.derived.perceptionRange;
        const nearbyMonsters = game.entities.filter(e => e.constructor.name === 'Monster' && Utils.dist(this.x, this.y, e.x, e.y) < range);
        const dangerNearby = nearbyMonsters.some(m => Utils.dist(this.x, this.y, m.x, m.y) < 120);
        // SHOPPING CHECK
        // If we have gold and need potions (belt not full), go shop!
        // FIX: Add cooldown check to prevent loop
        if (this.gold >= 50 && !this.inventory.isBeltFull()) {
            if (game.gameTime - this.lastShopTime > 10) { // 10s cooldown
                // Check if market exists
                const hasMarket = game.entities.some(e => e.constructor.name === 'EconomicBuilding' && e.type === 'MARKET' && e.constructed && !e.remove);
                if (hasMarket && !dangerNearby) {
                    this.nextState = 'SHOP';
                    this.nextTarget = null; // Will find target in behaviorShop
                    this.reactionTimer = Utils.rand(0.2, 0.7);
                    game.entities.push(new Particle(this.x, this.y - 30, "!", "white"));
                    return;
                }
            }
        }

        // BLACKSMITH CHECK - Visit to upgrade equipment if have enough gold
        const weaponTier = this.equipment?.weapon?.tier || 0;
        const armorTier = this.equipment?.armor?.tier || 0;
        const minUpgradeCost = 80; // T2 equipment costs 80g
        if (this.gold >= minUpgradeCost && (weaponTier < 4 || armorTier < 4)) {
            if (game.gameTime - this.lastShopTime > 15) { // 15s cooldown for Blacksmith
                const hasBlacksmith = game.entities.some(e => e.constructor.name === 'EconomicBuilding' && e.type === 'BLACKSMITH' && e.constructed && !e.remove);
                if (hasBlacksmith && !dangerNearby) {
                    this.nextState = 'SHOP';
                    this.nextTarget = null;
                    this.preferBlacksmith = true; // Flag to prefer Blacksmith in behaviorShop
                    this.reactionTimer = Utils.rand(0.2, 0.7);
                    game.entities.push(new Particle(this.x, this.y - 30, "⚔", "#ffd700"));
                    return;
                }
            }
        }


        // PERSONALITY: Find preferred target based on traits
        // Fix: Weigh distance more heavily to prevent "cross-map" targeting
        const target = this.findPreferredTarget(nearbyMonsters);

        if (target) {
            this.nextState = 'FIGHT';
            this.nextTarget = target;
            game.entities.push(new Particle(this.x, this.y - 30, "!", "white"));
            this.reactionTimer = Utils.rand(0.2, 0.7);
            return;
        }

        // PERSONALITY: Cowardly avoidance
        // If there are monsters nearby but we didn't pick one (too dangerous), run away!
        if (nearbyMonsters.length > 0 && this.personality.brave < 0.4) {
            // Check morale before fleeing!
            const morale = this.calculateMorale(game);
            // If morale is high enough (lots of friends), maybe don't flee?
            // Coward (0.3) * Morale (e.g. 1.5) = 0.45 -> Still low, but maybe enough to stay?
            // Let's say effective bravery = brave * morale.

            if (this.personality.brave * morale < 0.5) {
                const closest = nearbyMonsters.sort((a, b) => Utils.dist(this.x, this.y, a.x, a.y) - Utils.dist(this.x, this.y, b.x, b.y))[0];
                const dist = Utils.dist(this.x, this.y, closest.x, closest.y);
                if (dist < 100) {
                    // Run away from closest threat
                    const angle = Math.atan2(this.y - closest.y, this.x - closest.x); // Angle AWAY
                    this.x += Math.cos(angle) * this.stats.derived.moveSpeedMultiplier * 60 * dt;
                    this.y += Math.sin(angle) * this.stats.derived.moveSpeedMultiplier * 60 * dt;
                    return; // Don't wander if fleeing
                }
            }
        }

        // SOCIAL: Party Formation / Following
        // DISABLED: Per user request to remove early party behavior for now.
        /*
        if (this.personality.social > 0.75) {
            const allies = this.findNearbyAllies(game, 150); // Reduced range (200 -> 150)
            if (allies.length > 0) {
                // Follow the "leader" (highest level or bravest)
                const leader = allies.sort((a, b) => b.level - a.level || b.personality.brave - a.personality.brave)[0];

                // Only follow if they are moving somewhere (have a target or wandering)
                // and I'm not too close already
                const distToLeader = Utils.dist(this.x, this.y, leader.x, leader.y);
                if (distToLeader > 40) {
                        this.moveTowards(leader.x, leader.y, dt, game);
                    return; // Follow leader instead of wandering randomly
                }
            }
        }
        */

        const flags = game.entities.filter(e => e.constructor.name === 'Flag');
        if (flags.length > 0) {
            const flag = flags[0];
            const morale = this.calculateMorale(game);
            if (!dangerNearby || (this.personality.brave * morale > 0.8)) { this.state = 'QUEST'; this.target = flag; return; }
        }

        if (!this.target && !this.nextState) {
            this.decideNextAction(game);
        }
    }

    findNearbyAllies(game, range) {
        return game.entities.filter(e =>
            e.constructor.name === 'Hero' &&
            e !== this &&
            !e.remove &&
            e.hp > 0 &&
            Utils.dist(this.x, this.y, e.x, e.y) < range
        );
    }

    calculateMorale(game) {
        const allies = this.findNearbyAllies(game, 150);
        // Base morale 1.0
        // +0.2 per ally
        return 1.0 + (allies.length * 0.2);
    }

    evaluateThreatLevel(target) {
        if (!target) return 0;

        // Base threat: How fast can they kill me?
        // (Monster Dmg / My HP)
        const damageThreat = (target.damage || 10) / (this.hp || 1);

        // Size threat: HP pool
        const sizeThreat = (target.maxHp || 50) / (this.maxHp || 100);

        let threatScore = (damageThreat * 50) + (sizeThreat * 10);

        // Personality Modifiers
        // Brave heroes underestimate threat
        if (this.personality.brave > 0.7) threatScore *= 0.6;
        // Cowardly heroes overestimate threat
        if (this.personality.brave < 0.4) threatScore *= 1.5;
        // Smart heroes assess more accurately (closer to base) but penalty for unknowns? 
        // (For now, smart just doesn't have a skew, or maybe slight reduction for confidence)

        return threatScore;
    }

    findPreferredTarget(monsters) {
        if (!monsters || monsters.length === 0) return null;

        // 1. Filter out "Too Dangerous" targets
        const dangerTolerance = 20 + (this.personality.brave * 80);
        const validTargets = monsters.filter(m => {
            const threat = this.evaluateThreatLevel(m);
            return threat < dangerTolerance;
        });

        if (validTargets.length === 0) return null;

        // 2. Score-based Sorting (Weighted)
        return validTargets.sort((a, b) => {
            const distA = Utils.dist(this.x, this.y, a.x, a.y);
            const distB = Utils.dist(this.x, this.y, b.x, b.y);

            // Base Score: Negative Distance (closer is better)
            // Weight distance heavily to prevent bad traffic
            let scoreA = -distA * 2.0;
            let scoreB = -distB * 2.0;

            // GREEDY: Bonus for Gold
            if (this.personality.greedy > 0.7) {
                scoreA += (a.goldValue || 0) * 5;
                scoreB += (b.goldValue || 0) * 5;
            }

            // BRAVE: Bonus for Max HP (Big targets)
            if (this.personality.brave > 0.7) {
                scoreA += (a.maxHp || 0) * 0.5;
                scoreB += (b.maxHp || 0) * 0.5;
            }

            // SMART: Bonus for Low HP (Easy kills)
            if (this.personality.smart > 0.7) {
                scoreA += (1000 - a.hp); // Lower HP = Higher Score
                scoreB += (1000 - b.hp);
            }

            return scoreB - scoreA; // Descending score
        })[0];
    }

    behaviorFight(dt, game) {
        if (!this.target || this.target.remove || this.target.hp <= 0) {
            if (this.target && this.target.hp <= 0) {
                this.history.kills++;
                this.gainXp(this.target.xpValue * this.stats.derived.xpMultiplier, game);
                if (!CLASS_CONFIG[this.type].isRanged && this.target && this.target.unregisterEngagement) this.target.unregisterEngagement(this);
                this.victoryTimer = Utils.rand(1.0, 2.0);
                game.entities.push(new Particle(this.x, this.y - 30, "Victory!", "gold"));
                const bounds = { width: game.canvas.width, height: game.canvas.height };
                this.wanderTarget = { x: Math.max(0, Math.min(bounds.width, this.x + Utils.rand(-80, 80))), y: Math.max(0, Math.min(bounds.height, this.y + Utils.rand(-80, 80))) };
                this.attackCooldown = 0;
                this.state = 'VICTORY'; this.target = null; return;
            }
            this.state = 'DECISION'; this.target = null; return;
        }

        // NEW: Try to use skills before normal attack logic
        if (this.tryUseSkills(game)) {
            // Skill was used, possibly skip normal attack this frame
            return;
        }

        const config = CLASS_CONFIG[this.type];
        const dist = Utils.dist(this.x, this.y, this.target.x, this.target.y);

        // CLASS BEHAVIOR: Optimal Range Maintenance
        const minRange = config.optimalRange ? config.optimalRange[0] : 0;
        const maxRange = config.optimalRange ? config.optimalRange[1] : 40;

        if (dist > maxRange) {
            // Too far: Chase
            this.isEngaged = false; this.engagedLockTimer = 0;
            this.moveTowards(this.target.x, this.target.y, dt, game);
            this.preparedAttack = false; // Reset attack prep if we move
        } else if (dist < minRange && false) { // DISABLED KITING for stability
            // Too close: Kite / Reposition (Ranger behavior)
            const kiting = this.behaviorKite(this.target, dt, game);
            if (!kiting) {
                // If too tired to kite, fight back!
                if (this.attackCooldown <= 0) {
                    this.attack(game);
                    this.attackCooldown = this.stats.derived.attackSpeed;
                }
            }
            this.isEngaged = false; this.engagedLockTimer = 0;
        } else {
            // In optimal range: Attack!

            // Fix for Attack Loop:
            // 1. If cooldown is ready, start windup (if not already started)
            // 2. Wait for windup
            // 3. Attack

            if (this.attackCooldown <= 0) {
                if (!this.preparedAttack) {
                    // Start windup
                    this.attackWindup = 0.2;
                    this.preparedAttack = true;
                } else if (this.attackWindup <= 0) {
                    // Windup finished, execute attack
                    this.attack(game);
                    this.attackCooldown = this.stats.derived.attackSpeed;
                    this.preparedAttack = false;
                }
            }

            if (!CLASS_CONFIG[this.type].isRanged && this.target.registerEngagement) this.target.registerEngagement(this);
            this.isEngaged = true;
            if (this.engagedLockTimer <= 0) this.engagedLockTimer = 1.2;
            this.vel.x = 0; this.vel.y = 0;
            this.acc.x = 0; this.acc.y = 0;
        }
    }

    behaviorKite(target, dt, game) {
        // STAMINA CHECK
        // Cost decreases with AGI; minimum 10 per second
        const kiteCostPerSec = Math.max(10, 25 - (this.stats.current.AGI * 0.5));
        const kiteCost = kiteCostPerSec * dt;
        if (this.stamina >= kiteCost) {

            // Move AWAY from target
            const angle = Math.atan2(this.y - target.y, this.x - target.x);

            // FIX: Use validated config lookup with fallback
            const config = CLASS_CONFIG[this.type] || CLASS_CONFIG['RANGER'];
            const moveSpeedMult = this.stats?.derived?.moveSpeedMultiplier || 1;
            const speed = config.baseSpeed * moveSpeedMult;

            // Only consume stamina if we actually move (speed > 0)
            if (Number.isFinite(speed) && speed > 0) {
                this.stamina -= kiteCost;
                // FIX: Use acceleration instead of direct position modification
                // This ensures integrate() handles NaN recovery
                this.acc.x += Math.cos(angle) * speed * 2;
                this.acc.y += Math.sin(angle) * speed * 2;
                return true; // Successfully kiting
            }
            return false; // Stuck/Rooted
        } else {
            // Out of stamina! Can't kite.
            if (game && this.tiredCooldown <= 0) {
                game.entities.push(new Particle(this.x, this.y - 40, "TIRED", "gray"));
                this.tiredCooldown = 2.0; // 2 seconds cooldown
            }
            return false; // Failed to kite
        }
    }

    behaviorShop(dt, game) {
        if (!this.target || this.target.remove) {
            // Check if we prefer Blacksmith
            if (this.preferBlacksmith) {
                const blacksmiths = game.entities.filter(e => e.constructor.name === 'EconomicBuilding' && e.type === 'BLACKSMITH' && e.constructed && !e.remove);
                if (blacksmiths.length > 0) {
                    this.target = blacksmiths.sort((a, b) => Utils.dist(this.x, this.y, a.x, a.y) - Utils.dist(this.x, this.y, b.x, b.y))[0];
                    this.preferBlacksmith = false; // Clear flag
                } else {
                    this.preferBlacksmith = false;
                    this.state = 'DECISION';
                    return;
                }
            } else {
                const markets = game.entities.filter(e => e.constructor.name === 'EconomicBuilding' && e.type === 'MARKET' && e.constructed && !e.remove);
                if (markets.length === 0) { this.state = 'DECISION'; return; }
                this.target = markets.sort((a, b) => Utils.dist(this.x, this.y, a.x, a.y) - Utils.dist(this.x, this.y, b.x, b.y))[0];
            }
        }

        const door = { x: this.target.x, y: this.target.y + (this.target.height / 2) - 5 };
        const dist = Utils.dist(this.x, this.y, door.x, door.y);

        if (!this.target.constructed) { this.state = 'DECISION'; return; }
        if (this.visible) {
            DebugLogger.log('SHOP', this.name, 'APPROACH', { dist, visible: this.visible, isInside: this.isInsideBuilding, state: this.state });
            if (dist < 40 && !this.isInsideBuilding) {
                this.doorApproachTimer += dt;
                if (dist < 25 || this.doorApproachTimer > 2.0) {
                    const entered = this.target.enter && this.target.enter(this);
                    if (entered || this.isInsideBuilding) {
                        this.shopTimer = 3.0;
                        this.state = 'SHOP_INSIDE';
                        this.doorApproachTimer = 0;
                        DebugLogger.log('SHOP', this.name, 'ENTER', { building: this.target?.type });
                    } else {
                        this.state = 'DECISION';
                        this.doorApproachTimer = 0;
                        return;
                    }
                } else {
                    // FIX: Increased acceleration for final approach (was 120*dt which is too weak)
                    const dx = door.x - this.x, dy = door.y - this.y;
                    const len = Math.hypot(dx, dy) || 1;
                    const approachSpeed = 300; // Much stronger approach
                    this.acc.x += (dx / len) * approachSpeed;
                    this.acc.y += (dy / len) * approachSpeed;
                }
            } else {
                this.moveWithPathfinding(door.x, door.y, dt, game, true);
            }
        }

        if (this.state === 'SHOP_INSIDE' && !this.visible && this.isInsideBuilding) {
            this.behaviorShopInside(dt, game);
        }
    }

    behaviorShopEntering(dt, game) {
        if (!this.target) { this.state = 'DECISION'; return; }
        const door = { x: this.target.x, y: this.target.y + (this.target.height / 2) - 5 };
        const dist = Utils.dist(this.x, this.y, door.x, door.y);
        this.doorApproachTimer += dt;
        if (dist < 25 || this.doorApproachTimer > 2.0) {
            const entered = this.target.enter && this.target.enter(this);
            if (entered || this.isInsideBuilding) {
                this.shopTimer = 3.0;
                this.state = 'SHOP_INSIDE';
                this.doorApproachTimer = 0;
                return;
            } else {
                this.state = 'DECISION';
                this.doorApproachTimer = 0;
                return;
            }
        }
        const dx = door.x - this.x, dy = door.y - this.y;
        const len = Math.hypot(dx, dy) || 1;
        this.acc.x += (dx / len) * 120 * dt;
        this.acc.y += (dy / len) * 120 * dt;
    }

    behaviorShopInside(dt, game) {
        if (this.shopTimer > 0) this.shopTimer -= dt;
        if (this.buildingTimeout > 0) this.buildingTimeout -= dt;
        // Allow repeated purchase attempts while inside Market
        if (this.inBuilding && this.inBuilding.type === 'MARKET') {
            this.shopPurchaseCooldown = (this.shopPurchaseCooldown || 0) - dt;
            if (this.shopPurchaseCooldown <= 0) {
                this.shopPurchaseCooldown = 0.8;
                if (this.inBuilding.attemptPotionSale) this.inBuilding.attemptPotionSale(this);
            }
        }
        if (this.shopTimer <= 0 || this.buildingTimeout <= 0) {
            this.lastShopTime = game.gameTime;
            if (this.target && this.target.exit) this.target.exit(this);
            this.state = 'DECISION';
            this.target = null;
        }
    }

    behaviorQuest(dt, game) {
        if (!this.target || this.target.remove) { this.state = 'DECISION'; this.target = null; return; }
        const dist = Utils.dist(this.x, this.y, this.target.x, this.target.y);
        if (dist < 20) {
            const reward = Math.floor(this.target.reward || 0);
            this.gold += reward;
            this.history.goldEarned += reward;
            game.entities.push(new Particle(this.x, this.y - 30, `+${reward}g`, "gold"));
            this.target.remove = true;
            this.victoryTimer = 1.0;
            this.state = 'VICTORY';
            this.target = null;
        } else {
            this.moveTowards(this.target.x, this.target.y, dt, game);
        }
    }

    checkPotionUsage(game) {
        // Only use potions when visible and not resting in a building
        if (!this.visible) return;

        // Don't use potions if we're already retreating to heal
        // (Let the building heal us for free instead)
        if (this.state === 'RETREAT') return;

        // SMART TRAIT INTEGRATION:
        // Smart heroes (1.0): Know exact threshold to drink (efficient)
        // Dumb heroes (0.3): Panic drink at wrong times (wasteful)
        // Brave heroes: Drink later (more risk)
        // Cowardly heroes: Drink earlier (safer but wasteful)

        const smartness = this.personality?.smart || 0.5;
        const bravery = this.personality?.brave || 0.5;

        // Base threshold: 40% HP for optimal efficiency
        // Smart heroes approach this optimal value
        // Dumb heroes vary wildly (drink at 30%-70%)
        const optimalThreshold = 0.40;
        const variance = (1 - smartness) * 0.30; // Dumb = ±30% variance
        const braveModifier = (1 - bravery) * 0.20; // Coward = +20% earlier

        const hpThreshold = optimalThreshold + braveModifier + (Math.random() - 0.5) * variance;
        const drinkThreshold = this.maxHp * Math.max(0.2, Math.min(0.7, hpThreshold));

        // Check HP Potions
        if (this.hp < drinkThreshold && this.inventory.hasPotion()) {
            const potion = this.inventory.usePotion();

            if (potion) {
                const healAmount = potion.healAmount || 50;
                const oldHp = this.hp;
                this.hp = Math.min(this.hp + healAmount, this.maxHp);
                const actualHeal = this.hp - oldHp;

                game.entities.push(new Particle(
                    this.x,
                    this.y - 40,
                    `+ ${Math.floor(actualHeal)} HP`,
                    "#2ecc71"
                ));
            }
        }

        // STAMINA POTION CHECK (NEW)
        // Smart heroes: Drink when stamina < 25% and in combat
        // Dumb heroes: May forget or drink at wrong times
        const staminaPercent = this.stamina / this.maxStamina;
        const shouldDrinkStamina = this.state === 'FIGHT' && staminaPercent < 0.25;

        if (shouldDrinkStamina && smartness > 0.4 && this.inventory.hasStaminaPotion?.()) {
            const staminaPotion = this.inventory.useStaminaPotion?.();
            if (staminaPotion) {
                const restoreAmount = staminaPotion.staminaAmount || 50;
                this.stamina = Math.min(this.stamina + restoreAmount, this.maxStamina);

                game.entities.push(new Particle(
                    this.x,
                    this.y - 40,
                    `+ ${restoreAmount} STA`,
                    "#3498db"
                ));
            }
        }
    }

    dropPotions(game) {
        const potions = this.inventory.getAllPotions();

        // Drop each potion as a lootable ItemDrop entity
        potions.forEach((potion, index) => {
            // Scatter drops in a small circle around the hero
            const angle = (Math.PI * 2 / potions.length) * index;
            const dropX = this.x + Math.cos(angle) * 20;
            const dropY = this.y + Math.sin(angle) * 20;

            game.entities.push(new ItemDrop(dropX, dropY, potion.type));
        });

        // Clear the hero's inventory
        this.inventory.clearPotions();
    }

    attack(game) {
        // EQUIPMENT: Add weapon damage bonus
        const weaponDamage = this.equipment.weapon?.damage || 0;
        const weaponCrit = this.equipment.weapon?.crit || 0;

        let damage = this.stats.derived.meleeDamage + weaponDamage;
        const critChance = this.stats.derived.critChance + weaponCrit;

        if (Math.random() < critChance) {
            damage *= 2;
            game.entities.push(new Particle(this.x, this.y - 30, "CRIT!", "#ff00ff"));
        }
        // Pass 'this' as source so monsters know who attacked them
        if (CLASS_CONFIG[this.type].isRanged) {
            game.entities.push(new Projectile(this.x, this.y, this.target, damage, this));
        }
        else {
            this.target.takeDamage(damage, game, this);
        }
        this.actionLockTimer = 0.5;
        if (CLASS_CONFIG[this.type].isRanged) { this.isAiming = true; this.aimingTimer = 0.5; }
        // Lunge forward a bit
        if (this.target) {
            const ang = Math.atan2(this.target.y - this.y, this.target.x - this.x);
            this.lungeVec = { x: Math.cos(ang) * 4, y: Math.sin(ang) * 4 };
            this.lungeTimer = 0.12;
        }
    }

    takeDamage(amount, game, source = null) {
        this.lastDamageTime = game.gameTime;

        // EQUIPMENT: Add armor dodge bonus
        const armorDodge = this.equipment.armor?.dodge || 0;
        let dodge = this.stats.derived.dodgeChance + armorDodge;

        if (this.skillActive && this.skillActive.dodgeBonus) dodge += this.skillActive.dodgeBonus;
        if (Math.random() < dodge) { if (game) game.entities.push(new Particle(this.x, this.y - 20, "DODGE", "cyan")); return; }
        if (Math.random() < this.stats.derived.parryChance) { amount *= 0.5; if (game) game.entities.push(new Particle(this.x, this.y - 20, "PARRY", "white")); }

        // EQUIPMENT: Add armor defense (damage reduction)
        const armorDefense = this.equipment.armor?.defense || 0;
        const armorResist = this.equipment.armor?.resist || 0;
        amount = Math.max(1, amount - armorDefense * 0.5); // Defense reduces damage

        if (this.stats.derived.physicalResist || armorResist) {
            amount -= amount * (this.stats.derived.physicalResist + armorResist);
        }
        this.hp -= amount; this.history.timesWounded++;
        if (game) game.entities.push(new Particle(this.x, this.y - 20, "-" + Math.floor(amount), "red"));
        this.flashTimer = 0.06;

        // NEW: Drop potions on death
        if (this.hp <= 0) {
            this.dropPotions(game);
        }
    }

    gainXp(amount, game) {
        this.xp += amount;
        if (this.xp >= this.xpToNextLevel) this.levelUp(game);
    }

    levelUp(game) {
        this.level++; this.xp = 0; this.xpToNextLevel = Math.floor(this.xpToNextLevel * 1.5);
        this.stats.level = this.level; this.stats.update();
        this.maxHp = this.stats.derived.maxHP; this.hp = this.maxHp;
        this.maxStamina = Math.floor(this.stats.derived.staminaMax);
        this.staminaRegen = this.stats.derived.staminaRegen;
        this.stamina = this.maxStamina;
        // Ranger skill disabled per Operation Combat Polish
        game.entities.push(new Particle(this.x, this.y - 40, "LEVEL UP!", "#00ffff"));
    }

    moveTowards(tx, ty, dt, game) {
        // FIX: Remove undefined actionLockTimer check, keep isAiming
        if (this.isAiming) {
            DebugLogger.log('MOVE', this.name, 'BLOCKED_AIMING');
            return;
        }
        // FIX: Add fallback config lookup for safety
        const config = CLASS_CONFIG[this.type] || CLASS_CONFIG['WARRIOR'];
        const moveSpeedMult = this.stats?.derived?.moveSpeedMultiplier || 1;
        let maxSpeed = config.baseSpeed * moveSpeedMult * (this.skillActive?.speedMult || 1);
        const staminaPct = this.stamina / this.maxStamina; if (staminaPct < 0.2) maxSpeed *= 0.5;
        const dx = tx - this.x, dy = ty - this.y;
        const dist = Math.hypot(dx, dy);
        const dir = dist > 0 ? { x: dx / dist, y: dy / dist } : { x: 0, y: 0 };
        const arriveRadius = 60;
        const stopRadius = 5;
        let desiredSpeed;
        if (dist < stopRadius) {
            desiredSpeed = 0;
            this.vel.x = 0; this.vel.y = 0;
        } else if (dist < arriveRadius) {
            const t = (dist - stopRadius) / (arriveRadius - stopRadius);
            desiredSpeed = maxSpeed * t * t;
        } else {
            desiredSpeed = maxSpeed;
        }
        // Flow field blending (untuk target bangunan/retreat)
        let flow = { x: 0, y: 0 };
        if (game && this.target && this.target.constructor.name === 'EconomicBuilding' && this.target.id) {
            const door = game.getDoorPoint(this.target);
            flow = game.getFlowVector(this.target.id + ':door', door.x, door.y, this.x, this.y);
        } else if (game && tx === game.castle.x && ty === game.castle.y) {
            const door = game.getDoorPoint(game.castle);
            flow = game.getFlowVector('castle:door', door.x, door.y, this.x, this.y);
        }
        let flowWeight = 0.6;
        if (dist < 100 && ((this.target && this.target.constructor.name === 'EconomicBuilding') || (game && tx === game.castle.x && ty === game.castle.y))) {
            flowWeight = 0.0;
        }
        let blendDir = Utils.normalize(dir.x + flow.x * flowWeight, dir.y + flow.y * flowWeight);
        if (this.moveBlocked) {
            if (this.blockedTimer <= 0) { this.blockedTimer = 0.35; this.blockedSide = Math.random() < 0.5 ? -1 : 1; }
            const perp = Utils.perp(blendDir.x, blendDir.y);
            const steerSide = { x: perp.x * this.blockedSide, y: perp.y * this.blockedSide };
            blendDir = Utils.normalize(blendDir.x + steerSide.x * 0.8, blendDir.y + steerSide.y * 0.8);
        } else {
            if (this.blockedTimer > 0) this.blockedTimer = Math.max(0, this.blockedTimer - dt);
            if (this.blockedTimer <= 0) this.blockedSide = 0;
        }
        // Prevent desired speed from becoming too tiny outside stop radius
        const minCruise = (dist > stopRadius) ? maxSpeed * 0.25 : 0;
        const finalSpeed = Math.max(desiredSpeed, minCruise);
        const desired = { x: blendDir.x * finalSpeed, y: blendDir.y * finalSpeed };
        const smooth = Utils.lerpVec(this.vel.x, this.vel.y, desired.x, desired.y, 0.15);
        const steer = { x: smooth.x - this.vel.x, y: smooth.y - this.vel.y };
        const steerStrength = maxSpeed * 4;
        const limited = Utils.limitVec(steer.x, steer.y, steerStrength);
        this.acc.x += limited.x; this.acc.y += limited.y;
    }

    cooldownRemaining(skill, game) {
        return Math.max(0, (skill.lastUsed || -100) + skill.cooldown - game.gameTime);
    }

    canUseSkill(skill, game) {
        return this.stamina >= skill.staminaCost && this.cooldownRemaining(skill, game) <= 0;
    }

    useSkill(skill, game) {
        this.stamina -= skill.staminaCost;
        skill.lastUsed = game.gameTime;
        const dur = Math.min(skill.durationMax, skill.durationBase + skill.durationPerLevel * this.level);
        this.skillActive = { speedMult: skill.speedMult, dodgeBonus: skill.dodgeBonus, activeUntil: game.gameTime + dur };
        game.entities.push(new Particle(this.x, this.y - 40, skill.name, "cyan"));
    }

    wander(dt, game) {
        // Fix: Initialize wanderTimer if undefined or invalid
        if (typeof this.wanderTimer !== 'number' || isNaN(this.wanderTimer)) {
            this.wanderTimer = 0;
        }

        // Fix: Initialize wanderTarget if undefined
        if (!this.wanderTarget) {
            this.wanderTarget = { x: this.x, y: this.y };
        }

        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
            // Fix: Safety check for canvas dimensions
            const bounds = {
                width: (game.canvas && game.canvas.width) || 800,
                height: (game.canvas && game.canvas.height) || 600
            };

            this.wanderTarget.x = Math.max(0, Math.min(bounds.width, this.x + Utils.rand(-100, 100)));
            this.wanderTarget.y = Math.max(0, Math.min(bounds.height, this.y + Utils.rand(-100, 100)));
            this.wanderTimer = 3;
        }

        const dist = Utils.dist(this.x, this.y, this.wanderTarget.x, this.wanderTarget.y);
        if (!isNaN(dist) && dist > 10) {
            this.moveTowards(this.wanderTarget.x, this.wanderTarget.y, dt, game);
        }
    }

    maintainSpace(entities, dt) {
        // Override: jika sedang di depan pintu target, matikan repulsi agar masuk 100%
        if ((this.state === 'SHOP' || this.state === 'RETREAT') && this.target && this.target.constructor.name === 'EconomicBuilding') {
            const doorX = this.target.x;
            const doorY = this.target.y + (this.target.height / 2) - 5;
            const dd = Utils.dist(this.x, this.y, doorX, doorY);
            if (dd < 30) {
                return;
            }
        }
        this.moveBlocked = false;
        let sepX = 0, sepY = 0;
        entities.forEach(e => {
            if (e === this || e.remove) return;
            const isUnit = e.constructor.name === 'Hero' || e.constructor.name === 'Monster' || e.constructor.name === 'Worker' || e.constructor.name === 'CastleGuard';
            if (isUnit) {
                if (e.visible === false) return;
                const dist = Utils.dist(this.x, this.y, e.x, e.y);
                const minGap = this.radius + (e.radius || 12);
                if (dist < minGap && dist > 0) {
                    const nx = (this.x - e.x) / dist;
                    const ny = (this.y - e.y) / dist;
                    const overlap = minGap - dist;
                    const pushStrength = overlap * 0.5;
                    const travelState = this.state === 'SHOP' || this.state === 'RETREAT' || this.state === 'PATROL' || this.state === 'EXPLORE';
                    const scale = this.isEngaged ? 0.0 : (travelState ? 0.15 : 0.3);
                    sepX += nx * overlap * scale;
                    sepY += ny * overlap * scale;
                }
                const fx = (this.target ? this.target.x : (this.wanderTarget ? this.wanderTarget.x : this.x));
                const fy = (this.target ? this.target.y : (this.wanderTarget ? this.wanderTarget.y : this.y));
                const dir = Utils.normalize(fx - this.x, fy - this.y);
                const ax = e.x - this.x, ay = e.y - this.y;
                const aheadDot = Utils.dot(dir.x, dir.y, (ax / ((dist || 1))), (ay / ((dist || 1))));

                const travelState = this.state === 'SHOP' || this.state === 'RETREAT' || this.state === 'PATROL' || this.state === 'EXPLORE';
                if (!travelState && aheadDot > 0.6 && dist < minGap * 0.8) this.moveBlocked = true;
            }

            if (e.constructor.name === 'EconomicBuilding') {
                if (this.target === e) return;
                const fx = (this.target ? this.target.x : (this.wanderTarget ? this.wanderTarget.x : this.x));
                const fy = (this.target ? this.target.y : (this.wanderTarget ? this.wanderTarget.y : this.y));
                const dir = Utils.normalize(fx - this.x, fy - this.y);
                const bx = e.x - this.x;
                const by = e.y - this.y;
                const bd = Math.hypot(bx, by);
                // Jika kita mendekati pintu target, jangan tolak gedung lain terlalu agresif
                let nearDoor = false;
                if (this.target && this.target.constructor.name === 'EconomicBuilding') {
                    const doorX = this.target.x;
                    const doorY = this.target.y + (this.target.height / 2) - 5;
                    const dd = Utils.dist(this.x, this.y, doorX, doorY);
                    nearDoor = dd < 50;
                }
                if (nearDoor) return;
                if (bd < Math.max(e.width, e.height)) {
                    const bdir = Utils.normalize(bx, by);
                    const facing = Utils.dot(dir.x, dir.y, bdir.x, bdir.y);
                    if (facing > 0.8) {
                        const perp = Utils.perp(dir.x, dir.y);
                        const push = (this.state === 'SHOP' || this.state === 'RETREAT') ? 60 : 100;
                        this.acc.x += perp.x * push * dt;
                        this.acc.y += perp.y * push * dt;
                    }
                }
            }
        });
        const isRanged = CLASS_CONFIG[this.type]?.isRanged;
        if (isRanged && this.state === 'FIGHT' && !this.skillActive && this.target) {
            const minRange = CLASS_CONFIG[this.type].optimalRange ? CLASS_CONFIG[this.type].optimalRange[0] : 0;
            const maxRange = CLASS_CONFIG[this.type].optimalRange ? CLASS_CONFIG[this.type].optimalRange[1] : 40;
            const d = Utils.dist(this.x, this.y, this.target.x, this.target.y);
            const scale = d >= minRange && d <= maxRange ? 0.1 : 1.0;
            this.acc.x += sepX * scale;
            this.acc.y += sepY * scale;
        } else {
            this.acc.x += sepX;
            this.acc.y += sepY;
        }
    }

    integrate(dt, game) {
        // FIX: Safety check for invalid type - fallback to WARRIOR config
        const config = CLASS_CONFIG[this.type] || CLASS_CONFIG['WARRIOR'];
        const moveSpeedMult = this.stats?.derived?.moveSpeedMultiplier || 1;
        const maxSpeed = config.baseSpeed * moveSpeedMult * (this.skillActive?.speedMult || 1);

        // FIX: NaN position recovery
        if (!Number.isFinite(this.x) || !Number.isFinite(this.y)) {
            console.warn('[Hero] NaN position detected, recovering...', { type: this.type, x: this.x, y: this.y });
            this.x = this.prevX || game?.castle?.x || 400;
            this.y = this.prevY || game?.castle?.y || 400;
            this.vel.x = 0; this.vel.y = 0;
            this.acc.x = 0; this.acc.y = 0;
            return;
        }

        // HARD STOP hanya saat sedang FIGHT
        if (this.isEngaged && this.state === 'FIGHT') {
            this.vel.x = 0; this.vel.y = 0;
            this.acc.x = 0; this.acc.y = 0;
            return;
        }
        // Apply acceleration
        this.vel.x += this.acc.x * dt;
        this.vel.y += this.acc.y * dt;
        // Apply friction/dampening to prevent slippery movement
        const friction = 0.98;
        this.vel.x *= friction;
        this.vel.y *= friction;
        // Clamp to max speed
        const limited = Utils.limitVec(this.vel.x, this.vel.y, maxSpeed);
        this.vel.x = limited.x;
        this.vel.y = limited.y;
        // Stop completely if velocity is negligible
        const velMag = Math.hypot(this.vel.x, this.vel.y);
        this.walkPhase = (this.walkPhase || 0) + (velMag > 0.5 ? velMag * 0.05 : 0) * dt * 60;
        if (velMag < 0.02) { this.vel.x = 0; this.vel.y = 0; }
        this.x += this.vel.x * dt;
        this.y += this.vel.y * dt;
        if (Number.isFinite(this.x) && Number.isFinite(this.y)) {
            this.prevX = this.x;
            this.prevY = this.y;
        }
        this.acc.x = 0;
        this.acc.y = 0;
    }

    behaviorVictory(dt, game) {
        if (this.victoryTimer > 0) {
            this.victoryTimer -= dt;
            if (this.victoryTimer <= 0) {
                // FIX: Ensure hero is visible when exiting victory state
                if (!this.visible && !this.isInsideBuilding) {
                    this.visible = true;
                }
                this.state = 'DECISION';
            }
        } else {
            // FIX: Ensure hero is visible when exiting victory state
            if (!this.visible && !this.isInsideBuilding) {
                this.visible = true;
            }
            this.state = 'DECISION';
        }
    }

    draw(ctx) {
        if (!this.visible) return;

        let ox = 0, oy = 0;
        if (this.lungeTimer > 0) { const t = this.lungeTimer / 0.12; ox = this.lungeVec.x * t; oy = this.lungeVec.y * t; }
        const vm = Math.hypot(this.vel.x, this.vel.y);
        if (vm > 0.5) { oy += Math.sin((this.walkPhase || 0)) * 1.5; }
        Utils.drawSprite(ctx, 'hero', this.x + ox, this.y + oy, 20 + (this.level), this.color);
        // HP bar
        ctx.fillStyle = 'red'; ctx.fillRect(this.x - 10, this.y - 25, 20, 4);
        ctx.fillStyle = '#2ecc71'; ctx.fillRect(this.x - 10, this.y - 25, 20 * (this.hp / this.maxHp), 4);
        // STAMINA bar (physical classes emphasized)
        ctx.fillStyle = '#444'; ctx.fillRect(this.x - 10, this.y - 20, 20, 3);
        ctx.fillStyle = '#00bfff'; ctx.fillRect(this.x - 10, this.y - 20, 20 * (this.stamina / this.maxStamina), 3);
        if (this.flashTimer > 0) { ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.x, this.y, this.radius + 5, 0, Math.PI * 2); ctx.stroke(); }
        ctx.save(); ctx.fillStyle = 'white'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.strokeStyle = 'black'; ctx.lineWidth = 2;
        const text = `${this.name} (Lv.${this.level})`;
        ctx.strokeText(text, this.x, this.y - 32); ctx.fillText(text, this.x, this.y - 32);
        if (this.personality.brave < 0.4) { ctx.fillStyle = 'red'; ctx.fillRect(this.x - 12, this.y - 42, 4, 4); }
        if (this.personality.greedy > 0.7) { ctx.fillStyle = 'gold'; ctx.fillRect(this.x - 2, this.y - 42, 4, 4); }
        if (this.personality.smart > 0.7) { ctx.fillStyle = 'cyan'; ctx.fillRect(this.x + 8, this.y - 42, 4, 4); }
        ctx.restore();
    }

    /**
     * Move towards a target using A* pathfinding for buildings, direct for combat
     * @param {number} tx - Target X coordinate
     * @param {number} ty - Target Y coordinate
     * @param {number} dt - Delta time
     * @param {Object} game - Game reference
     * @param {boolean} usePathfinding - Whether to use A* (default: auto-detect)
     */
    moveWithPathfinding(tx, ty, dt, game, usePathfinding = null) {
        // Determine if we should use pathfinding
        // Use pathfinding for: buildings, retreating, exploring
        // Use direct movement for: combat (need to face enemy directly)
        const shouldUsePath = usePathfinding !== null ? usePathfinding :
            (this.target && (
                this.target.constructor.name === 'EconomicBuilding' ||
                this.state === 'RETREAT' ||
                this.state === 'SHOP' ||
                this.state === 'EXPLORE' ||
                this.state === 'PATROL'
            ));

        if (!shouldUsePath || !game.pathfinder) {
            // Direct movement for combat or if no pathfinder
            this.moveTowards(tx, ty, dt, game);
            return;
        }

        // Check if we need a new path
        const targetKey = `${Math.floor(tx)},${Math.floor(ty)}`;
        const needsNewPath =
            !this.currentPath ||
            this.lastPathTarget !== targetKey ||
            this.pathRefreshTimer <= 0;

        if (needsNewPath) {
            // Request new path from A*
            const path = game.pathfinder.findPath(this.x, this.y, tx, ty);
            if (path && path.length > 0) {
                this.currentPath = path;
                this.waypointIndex = 0;
                this.lastPathTarget = targetKey;
                this.pathRefreshTimer = this.pathRefreshInterval;
            } else {
                // No path found - fall back to direct movement
                this.moveTowards(tx, ty, dt, game);
                return;
            }
        }

        // Decrement path refresh timer
        this.pathRefreshTimer -= dt;

        // Follow the path
        if (this.currentPath && this.waypointIndex < this.currentPath.length) {
            const waypoint = this.currentPath[this.waypointIndex];
            const distToWaypoint = Utils.dist(this.x, this.y, waypoint.x, waypoint.y);

            // Move to current waypoint
            if (distToWaypoint > 15) {
                // Use direct movement to waypoint (no recursive pathfinding)
                this.moveTowards(waypoint.x, waypoint.y, dt, game);
            } else {
                // Reached waypoint, move to next
                this.waypointIndex++;

                // If we've reached the end of path, go directly to target
                if (this.waypointIndex >= this.currentPath.length) {
                    this.moveTowards(tx, ty, dt, game);
                }
            }
        } else {
            // No path or finished path - direct movement
            this.moveTowards(tx, ty, dt, game);
        }
    }

    /**
     * Clear current path (call when target changes)
     */
    clearPath() {
        this.currentPath = null;
        this.waypointIndex = 0;
        this.lastPathTarget = null;
    }

    // ============================================
    // SKILL SYSTEM METHODS
    // ============================================

    /**
     * Learn a new skill (called when hero buys skill at Guild)
     */
    learnSkill(skillId) {
        this.learnedSkills[skillId] = true;
        this.skillCooldowns[skillId] = -999; // Ready immediately
    }

    /**
     * Check if hero has learned a specific skill
     */
    hasSkill(skillId) {
        return this.learnedSkills[skillId] === true;
    }

    /**
     * Get skill config by ID for this hero's class
     */
    getSkillConfig(skillId) {
        const classSkills = SKILL_CONFIG[this.type];
        return classSkills ? classSkills[skillId] : null;
    }

    /**
     * Check if skill is off cooldown and hero has enough stamina
     */
    canUseSkill(skillId, gameTime) {
        const skill = this.getSkillConfig(skillId);
        if (!skill) return false;
        if (!this.hasSkill(skillId)) return false;
        if (skill.isPassive) return false; // Passives don't "use"

        const lastUsed = this.skillCooldowns[skillId] || -999;
        const cdRemaining = (lastUsed + skill.cooldown) - gameTime;
        if (cdRemaining > 0) return false;
        if (this.stamina < skill.staminaCost) return false;

        return true;
    }

    /**
     * Get remaining cooldown for a skill
     */
    getSkillCooldown(skillId, gameTime) {
        const skill = this.getSkillConfig(skillId);
        if (!skill) return 0;
        const lastUsed = this.skillCooldowns[skillId] || -999;
        return Math.max(0, (lastUsed + skill.cooldown) - gameTime);
    }

    /**
     * Check if skill trigger conditions are met (AI logic)
     */
    checkSkillTrigger(skillId, game) {
        const skill = this.getSkillConfig(skillId);
        if (!skill || !skill.trigger) return false;

        const trigger = skill.trigger;
        const target = this.target;

        if (trigger.type === 'ENEMY_CLOSE') {
            if (!target || target.remove) return false;
            const dist = Utils.dist(this.x, this.y, target.x, target.y);
            if (dist < trigger.minDistance || dist > trigger.maxDistance) return false;
            if (trigger.hpThreshold && (this.hp / this.maxHp) > trigger.hpThreshold) return false;
            return true;
        }

        if (trigger.type === 'ENEMY_LOW_HP') {
            if (!target || target.remove) return false;
            const dist = Utils.dist(this.x, this.y, target.x, target.y);
            if (dist > trigger.maxDistance) return false;
            if ((target.hp / target.maxHp) > trigger.hpThreshold) return false;
            return true;
        }

        return false;
    }

    /**
     * Main skill AI check - called during combat update
     */
    tryUseSkills(game) {
        if (this.skillLockTimer > 0) return false;

        // Allow skills in FIGHT state, or DECISION state for ranged heroes (proactive evasion)
        const config = CLASS_CONFIG[this.type];
        const allowedStates = config?.isRanged
            ? ['FIGHT', 'DECISION', 'EXPLORE', 'PATROL']
            : ['FIGHT'];
        if (!allowedStates.includes(this.state)) return false;

        const classSkills = SKILL_CONFIG[this.type];
        if (!classSkills) return false;

        // Check each learned skill
        for (const skillId of Object.keys(this.learnedSkills)) {
            if (!this.canUseSkill(skillId, game.gameTime)) continue;
            if (!this.checkSkillTrigger(skillId, game)) continue;

            // Execute the skill!
            this.executeSkill(skillId, game);
            return true;
        }

        return false;
    }

    /**
     * Execute a skill by ID
     */
    executeSkill(skillId, game) {
        const skill = this.getSkillConfig(skillId);
        if (!skill) return;

        // Consume stamina and set cooldown
        this.stamina -= skill.staminaCost;
        this.skillCooldowns[skillId] = game.gameTime;

        // Visual feedback
        game.entities.push(new Particle(this.x, this.y - 25, skill.particleText, skill.particleColor));

        // Execute class-specific skill logic
        if (this.type === 'MERCENARY') {
            this.executeMercenarySkill(skillId, game);
        } else if (this.type === 'WAYFARER') {
            this.executeWayfarerSkill(skillId, game);
        }
    }

    /**
     * Execute Mercenary-specific skills
     */
    executeMercenarySkill(skillId, game) {
        const skill = this.getSkillConfig(skillId);
        const target = this.target;

        if (skillId === 'SAND_KICK') {
            if (target && !target.remove) {
                // Apply stun
                target.stunTimer = (target.stunTimer || 0) + skill.stunDuration;
                // Apply accuracy debuff  
                target.accuracyDebuff = skill.accuracyDebuff;
                target.accuracyDebuffTimer = skill.debuffDuration;
                // Bonus damage
                target.takeDamage(skill.bonusDamage, game, this);
                // Sand particle effect
                for (let i = 0; i < 5; i++) {
                    const ox = (Math.random() - 0.5) * 30;
                    const oy = (Math.random() - 0.5) * 20;
                    game.entities.push(new Particle(target.x + ox, target.y + oy, '•', skill.particleColor));
                }
            }
        }

        if (skillId === 'SUCKER_PUNCH') {
            if (target && !target.remove) {
                // High damage
                const damage = this.stats.derived.attackDamage * skill.damageMultiplier;
                target.takeDamage(damage, game, this);
                // Knockback
                const dx = target.x - this.x;
                const dy = target.y - this.y;
                const dist = Math.hypot(dx, dy) || 1;
                target.x += (dx / dist) * skill.knockbackDistance;
                target.y += (dy / dist) * skill.knockbackDistance;
            }
        }
    }

    /**
     * Execute Wayfarer-specific skills (Nav-Grid aware!)
     */
    executeWayfarerSkill(skillId, game) {
        const skill = this.getSkillConfig(skillId);
        const target = this.target;

        if (skillId === 'TUMBLE' || skillId === 'CALTROPS') {
            // Calculate dash direction (away from enemy)
            let dashX = this.x;
            let dashY = this.y;

            if (target && !target.remove) {
                const dx = this.x - target.x;
                const dy = this.y - target.y;
                const dist = Math.hypot(dx, dy) || 1;
                const dirX = dx / dist;
                const dirY = dy / dist;

                // Try direct backward dash first
                let tryX = this.x + dirX * skill.dashDistance;
                let tryY = this.y + dirY * skill.dashDistance;

                // Use NavGrid to find safe landing spot
                if (game.navGrid && skill.trigger.useNavGrid) {
                    const safeSpot = this.findSafeDashSpot(tryX, tryY, dirX, dirY, skill.dashDistance, game);
                    if (safeSpot) {
                        dashX = safeSpot.x;
                        dashY = safeSpot.y;
                    } else {
                        // No safe spot found - use direct dash anyway (fallback)
                        dashX = tryX;
                        dashY = tryY;
                    }
                } else {
                    // No NavGrid - use direct dash
                    dashX = tryX;
                    dashY = tryY;
                }

                // Clamp to world bounds
                dashX = Math.max(30, Math.min(game.canvas.width - 30, dashX));
                dashY = Math.max(30, Math.min(game.canvas.height - 30, dashY));
            }

            // Execute dash (instant teleport for now)
            this.x = dashX;
            this.y = dashY;
            this.vel.x = 0;
            this.vel.y = 0;

            // Fire instant shot (Tumble)
            if (skill.instantShot && target && !target.remove) {
                const damage = this.stats.derived.attackDamage * skill.shotDamageMultiplier;
                game.entities.push(new Projectile(
                    this.x, this.y,
                    target.x, target.y,
                    damage, this, target,
                    skill.particleColor
                ));
            }

            // Leave caltrops (Caltrops skill)
            if (skillId === 'CALTROPS') {
                // Apply slow to enemies near original position
                const oldX = this.x - (dashX - this.x); // Approximate old pos
                const oldY = this.y - (dashY - this.y);
                for (const ent of game.entities) {
                    if (ent.constructor.name === 'Monster') {
                        const d = Utils.dist(oldX, oldY, ent.x, ent.y);
                        if (d < skill.slowRadius) {
                            ent.slowEffect = skill.slowEffect;
                            ent.slowTimer = skill.slowDuration;
                        }
                    }
                }
            }

            // Lock movement briefly
            this.skillLockTimer = 0.3;
        }

        if (skillId === 'KILL_SHOT') {
            if (target && !target.remove) {
                const damage = this.stats.derived.attackDamage * skill.damageMultiplier;
                game.entities.push(new Projectile(
                    this.x, this.y,
                    target.x, target.y,
                    damage, this, target,
                    skill.particleColor
                ));
            }
        }
    }

    /**
     * Find a safe spot to dash to using NavGrid
     */
    findSafeDashSpot(targetX, targetY, dirX, dirY, maxDist, game) {
        if (!game.navGrid) return { x: targetX, y: targetY };

        // Check if target is walkable
        if (game.navGrid.isWalkable(targetX, targetY)) {
            return { x: targetX, y: targetY };
        }

        // Try shorter distances
        for (let dist = maxDist - 20; dist >= 30; dist -= 20) {
            const tryX = this.x + dirX * dist;
            const tryY = this.y + dirY * dist;
            if (game.navGrid.isWalkable(tryX, tryY)) {
                return { x: tryX, y: tryY };
            }
        }

        // Try perpendicular directions (left/right)
        const perpX = -dirY;
        const perpY = dirX;
        for (const side of [1, -1]) {
            const tryX = this.x + (dirX * 40) + (perpX * side * 50);
            const tryY = this.y + (dirY * 40) + (perpY * side * 50);
            if (game.navGrid.isWalkable(tryX, tryY)) {
                return { x: tryX, y: tryY };
            }
        }

        // Fallback: stay in place
        return null;
    }
}

