// ... imports ...
import { Utils } from '../utils.js';
import { Particle } from './Particle.js';
import { Projectile } from './Projectile.js';
import { MONSTER_ARCHETYPES } from '../config/ClassConfig.js';
import { GameLogger } from '../systems/GameLogger.js';

export class Monster {
    constructor(x, y, archetypeKey = 'SWARM') {
        this.x = x;
        this.y = y;
        this.archetype = archetypeKey;

        const config = MONSTER_ARCHETYPES[archetypeKey];
        this.name = config.name || archetypeKey;
        this.hp = config.hp;
        this.maxHp = config.hp;
        this.damage = config.damage;
        this.speed = config.speed;
        this.xpValue = config.xpReward;
        this.goldValue = config.goldDrop || 10; // Default if missing
        this.color = config.color;

        // COMBAT STATS
        this.dodgeChance = config.dodgeChance || 0;
        this.parryChance = config.parryChance || 0;
        this.resistPct = config.resistPct || 0;
        this.attackRange = config.attackRange || 20; // Default 20 if not specified

        this.radius = archetypeKey === 'TANK' ? 20 : 12;
        this.remove = false;
        this.damageHistory = new Map(); // Track damage sources
        this.attackCooldown = 0;
        this.target = null;
        this.vel = { x: 0, y: 0 };
        this.acc = { x: 0, y: 0 };
        this.decisionTimer = 0; // Balancing: Delay between actions
        this.reactionTimer = 0;
        this.isEngaged = false; this.engagedLockTimer = 0;
        this.attackWindup = 0;
        this.lungeTimer = 0;
        this.lungeVec = { x: 0, y: 0 };
        this.flashTimer = 0;
        this.targetStickTimer = 0;
        this.moveBlocked = false;
        this.blockedTimer = 0;
        this.blockedSide = 0;
        this.prevX = x;
        this.prevY = y;
        this.walkPhase = 0;

        // AGGRO SYSTEM
        this.aggroTarget = null; // Hero or Tower who damaged us (for retaliation)
        this.aggroTimer = 0; // How long to chase the aggro target (5 seconds)
        this.noticeRange = 150; // How close a hero needs to be to trigger "opportunity" attack

        // SIEGE SYSTEM - Lock-on persistence
        this.siegeTarget = null; // Building we're currently sieging
        this.siegeLockTimer = 0; // How long to stick with a siege target (prevents stuttering)
        this.siegeLockDuration = 2.0; // Lock onto building for 2 seconds minimum
        // Engagement Slots for melee attackers
        this.engagedHeroes = new Set();
        this.maxMeleeSlots = 4;

        // ADVANCED AI
        this.behavior = config.behavior || 'NORMAL';
        this.swarmThreshold = config.swarmThreshold || 0;
        this.state = 'HUNT'; // Default state: HUNT, GATHER, SIEGE
        this.gatherPoint = null;
        this.gatherTimer = 0;
        this.projectileColor = config.projectileColor || '#ff0000';

        this.initSwarm();
    }

    initSwarm() {
        // 40% chance for SWARM types to gather first
        if (this.behavior === 'SWARM' && Math.random() < 0.4) {
            this.state = 'GATHER';
            this.gatherTimer = Utils.rand(10, 20); // Wait 10-20 seconds max
            // Pick a gather point 300-500px from spawn (or castle)
            this.gatherPoint = {
                x: this.x + Utils.rand(-200, 200),
                y: this.y + Utils.rand(-200, 200)
            };
        }
    }

    update(dt, game) {
        if (this.hp <= 0 || this.remove) {
            if (this.hp <= 0 && !this.deathLogged) {
                GameLogger.log('DEATH', this, 'MONSTER_KILLED', { hp: this.hp, target: this.target?.name });
                this.deathLogged = true;
            }
            return;
        }
        if (this.attackCooldown > 0) this.attackCooldown -= dt;
        if (this.attackWindup > 0) this.attackWindup -= dt;
        if (this.lungeTimer > 0) this.lungeTimer -= dt;
        if (this.flashTimer > 0) this.flashTimer -= dt;
        if (this.reactionTimer > 0) { this.reactionTimer -= dt; if (this.reactionTimer > 0) return; }

        // BALANCING: Decision Delay
        if (this.decisionTimer > 0) {
            this.decisionTimer -= dt;
            if (!this.target) return;
        }

        // Update aggro timer
        if (this.aggroTimer > 0) {
            this.aggroTimer -= dt;
            if (this.aggroTimer <= 0) {
                this.aggroTarget = null; // Retaliation period expired
            }
        }

        // Update siege lock timer
        if (this.siegeLockTimer > 0) {
            this.siegeLockTimer -= dt;
        }

        // Update engaged lock timer
        if (this.engagedLockTimer > 0) {
            this.engagedLockTimer -= dt;
        }

        // SWARM BEHAVIOR: GATHER STATE
        if (this.state === 'GATHER') {
            this.updateGather(dt, game);
            return;
        }

        // EARLY TARGET VALIDATION - Clear dead/removed targets immediately
        if (this.target) {
            const isUnit = this.target.constructor.name === 'Hero' ||
                this.target.constructor.name === 'Worker' ||
                this.target.constructor.name === 'CastleGuard';
            const isBuilding = this.target.constructor.name === 'EconomicBuilding' ||
                this.target.constructor.name === 'Building';

            const targetDead = this.target.remove || this.target.hp <= 0 ||
                (isUnit && !this.target.visible);

            if (targetDead) {
                this.target = null;
                this.isEngaged = false;
                this.preparedAttack = false;
                this.engagedLockTimer = 0;
            }
        }

        // === AGGRO SYSTEM: 3-STEP PRIORITY ===

        // STEP 1: RETALIATION - If hit by a Hero or Tower, chase them for 5 seconds
        if (this.aggroTarget && this.aggroTimer > 0) {
            // Validate aggro target
            const isHero = this.aggroTarget.constructor.name === 'Hero';
            const isTower = this.aggroTarget.constructor.name === 'EconomicBuilding' && this.aggroTarget.type === 'TOWER';

            if (this.aggroTarget.remove || this.aggroTarget.hp <= 0 ||
                (isHero && (!this.aggroTarget.visible || this.aggroTarget.hp <= 0))) {
                this.aggroTarget = null;
                this.aggroTimer = 0;
            } else {
                this.target = this.aggroTarget;
            }
        }

        // STEP 2: OPPORTUNITY - If a Hero gets too close (Notice Range), attack them
        // SIEGE monsters ignore this unless they are blocked (stuck)
        if ((!this.target || (this.target.constructor.name !== 'Hero' && this.target.constructor.name !== 'Worker' && this.target.constructor.name !== 'CastleGuard')) &&
            this.siegeLockTimer <= 0 && this.targetStickTimer <= 0 &&
            (this.behavior !== 'SIEGE' || this.moveBlocked)) {
            let nearbyUnit = null;
            let closestDist = this.noticeRange;

            game.entities.forEach(e => {
                const isUnit = (e.constructor.name === 'Hero' && e.visible) || ((e.constructor.name === 'Worker' || e.constructor.name === 'CastleGuard') && e.visible);
                if (isUnit && !e.remove && e.hp > 0) {
                    const d = Utils.dist(this.x, this.y, e.x, e.y);
                    if (d < closestDist) { closestDist = d; nearbyUnit = e; }
                }
            });

            if (nearbyUnit) {
                const currentDist = this.getDistanceToTarget(game);
                const newDist = Utils.dist(this.x, this.y, nearbyUnit.x, nearbyUnit.y);
                const switchThreshold = 1.5;
                if (!this.target || (newDist * switchThreshold < currentDist)) {
                    this.target = nearbyUnit;
                    this.reactionTimer = Utils.rand(0.2, 0.7);
                    this.targetStickTimer = 3.0;
                }
            }
        }

        // STEP 3: SIEGE - Target the nearest building
        if (!this.aggroTarget && this.aggroTimer <= 0) {
            const isCurrentTargetBuilding = this.target &&
                (this.target.constructor.name === 'EconomicBuilding' ||
                    this.target.constructor.name === 'Building');

            if (this.siegeTarget && this.siegeLockTimer > 0) {
                if (this.siegeTarget.remove || this.siegeTarget.hp <= 0) {
                    this.siegeTarget = null;
                    this.siegeLockTimer = 0;
                    this.target = null;
                } else {
                    this.target = this.siegeTarget;
                }
            }

            if (!this.target || (!isCurrentTargetBuilding && this.siegeLockTimer <= 0)) {
                if (this.target && (this.target.remove ||
                    (this.target.constructor.name === 'Hero' && (!this.target.visible || this.target.hp <= 0)))) {
                    this.target = null;
                }

                if (!this.target) {
                    let closestBuilding = null;
                    let minDistance = Infinity;

                    game.entities.forEach(e => {
                        const isBuilding = e.constructor.name === 'EconomicBuilding' ||
                            e.constructor.name === 'Building';

                        if (isBuilding && !e.remove && e.hp > 0) {
                            const d = Utils.dist(this.x, this.y, e.x, e.y);
                            if (d < minDistance) {
                                minDistance = d;
                                closestBuilding = e;
                            }
                        }
                    });

                    const newTarget = closestBuilding || (game.castle && !game.castle.remove ? game.castle : null);

                    if (newTarget) {
                        this.target = newTarget;
                        this.siegeTarget = newTarget;
                        this.siegeLockTimer = this.siegeLockDuration;
                        this.decisionTimer = Utils.rand(0.5, 1.5);
                    }
                }
            }
        }

        this.maintainSpace(game.entities, dt);

        if (!this.target) {
            return;
        }

        if (this.target.remove || this.target.hp <= 0 ||
            ((this.target.constructor.name === 'Hero' || this.target.constructor.name === 'Worker' || this.target.constructor.name === 'CastleGuard') && (!this.target.visible || this.target.hp <= 0))) {
            this.target = null;
            return;
        }

        const distToTarget = Utils.dist(this.x, this.y, this.target.x, this.target.y);
        const attackRange = this.radius + this.attackRange;
        let effectiveRange = attackRange;

        if (!Number.isFinite(this.target.x) || !Number.isFinite(this.target.y)) {
            console.warn('[Monster] Target has invalid coordinates:', this.target.type || this.target.name);
            this.target = null;
            return;
        }

        let targetPoint = { x: this.target.x, y: this.target.y };
        const isBuilding = this.target.constructor.name === 'EconomicBuilding' || this.target.constructor.name === 'Building';
        if (isBuilding) {
            if (game.getDoorPoint) {
                targetPoint = game.getDoorPoint(this.target);
            }
            if (!Number.isFinite(targetPoint.x) || !Number.isFinite(targetPoint.y)) {
                targetPoint = { x: this.target.x, y: this.target.y };
            }
            effectiveRange = attackRange + 10;
            if (game && game.canvas) {
                targetPoint.x = Math.max(0, Math.min(game.canvas.width, targetPoint.x));
                targetPoint.y = Math.max(0, Math.min(game.canvas.height, targetPoint.y));
            }
        } else {
            const targetRadius = this.target.radius || 15;
            effectiveRange = attackRange + targetRadius;
        }

        if (!Number.isFinite(this.x) || !Number.isFinite(this.y) ||
            !Number.isFinite(targetPoint.x) || !Number.isFinite(targetPoint.y)) {
            return;
        }

        const distToPoint = Utils.dist(this.x, this.y, targetPoint.x, targetPoint.y);
        const engageBuffer = this.isEngaged ? 8 : 0;
        const wayOutsideRange = distToPoint > (effectiveRange + 50);
        const shouldDisengage = distToPoint > (effectiveRange + engageBuffer) && (this.engagedLockTimer <= 0 || wayOutsideRange);

        if (shouldDisengage) {
            const dx = targetPoint.x - this.x, dy = targetPoint.y - this.y;
            const dist = Math.hypot(dx, dy);
            const dir = dist > 0 ? { x: dx / dist, y: dy / dist } : { x: 0, y: 0 };
            const arriveRadius = 50;
            const desiredSpeed = dist < arriveRadius ? this.speed * (dist / arriveRadius) : this.speed;

            let flow = { x: 0, y: 0 };
            if (this.target && this.target.constructor.name === 'EconomicBuilding' && this.target.id) {
                const door = game.getDoorPoint(this.target);
                flow = game.getFlowVector(this.target.id + ':door', door.x, door.y, this.x, this.y);
            } else if (this.siegeTarget && this.siegeTarget.id) {
                const door = game.getDoorPoint(this.siegeTarget);
                flow = game.getFlowVector(this.siegeTarget.id + ':door', door.x, door.y, this.x, this.y);
            }

            if (!Number.isFinite(flow.x) || !Number.isFinite(flow.y)) {
                flow = { x: 0, y: 0 };
            }

            let flowWeight = 0.6;
            if ((this.target && this.target.constructor.name === 'EconomicBuilding') && dist < 100) {
                flowWeight = 0.0;
            }
            let blendDir = Utils.normalize(dir.x + flow.x * flowWeight, dir.y + flow.y * flowWeight);
            if (this.moveBlocked) {
                if (this.blockedTimer <= 0) { this.blockedTimer = 0.5; this.blockedSide = Math.random() < 0.5 ? -1 : 1; }
                const perp = Utils.perp(blendDir.x, blendDir.y);
                const steerSide = { x: perp.x * this.blockedSide, y: perp.y * this.blockedSide };
                blendDir = Utils.normalize(blendDir.x + steerSide.x * 1.2, blendDir.y + steerSide.y * 1.2);
            } else {
                if (this.blockedTimer > 0) this.blockedTimer = Math.max(0, this.blockedTimer - dt);
                if (this.blockedTimer <= 0) this.blockedSide = 0;
            }
            const desired = { x: blendDir.x * desiredSpeed, y: blendDir.y * desiredSpeed };
            const smooth = Utils.lerpVec(this.vel.x, this.vel.y, desired.x, desired.y, 0.2);
            const steer = { x: smooth.x - this.vel.x, y: smooth.y - this.vel.y };
            const limited = Utils.limitVec(steer.x, steer.y, this.speed);
            this.acc.x += limited.x; this.acc.y += limited.y;
            this.isEngaged = false;
            const moved = Math.hypot(this.x - this.prevX, this.y - this.prevY);
            if (moved > 5) this.preparedAttack = false;
        }
        else {
            // In attack range
            if (this.attackCooldown <= 0) {
                // RANGED ATTACK
                if (this.behavior === 'RANGED') {
                    this.fireProjectile(game);
                    this.attackCooldown = 1.5;
                    return;
                }

                if (!this.preparedAttack) {
                    this.attackWindup = 0.2;
                    this.preparedAttack = true;
                } else if (this.attackWindup <= 0) {
                    const isHero = this.target.constructor.name === 'Hero';
                    const isWorker = this.target.constructor.name === 'Worker';
                    const isGuard = this.target.constructor.name === 'CastleGuard';
                    const isValidUnit = (isHero && this.target.visible && this.target.hp > 0) ||
                        (isWorker && this.target.hp > 0) ||
                        (isGuard && this.target.hp > 0);
                    const isBuilding = this.target.constructor.name === 'EconomicBuilding' ||
                        this.target.constructor.name === 'Building';
                    const isValidBuilding = isBuilding && this.target.hp > 0;

                    const targetInRange = distToPoint <= effectiveRange;

                    if (isBuilding && !targetInRange) {
                        GameLogger.log('COMBAT', this, 'BUILDING_ATTACK_OUT_OF_RANGE', {
                            distToPoint, effectiveRange, building: this.target.type
                        });
                    }

                    if (this.target && this.target.takeDamage &&
                        !this.target.remove && targetInRange &&
                        ((isValidUnit && this.target.hp > 0) || isValidBuilding)) {
                        this.target.takeDamage(this.damage, game, this);
                        this.attackCooldown = 1.5;
                        // Lunge
                        const tp = isBuilding && game.getDoorPoint ? game.getDoorPoint(this.target) : { x: this.target.x, y: this.target.y };
                        const ang = Math.atan2(tp.y - this.y, tp.x - this.x);
                        this.lungeVec = { x: Math.cos(ang) * 4, y: Math.sin(ang) * 4 };
                        this.lungeTimer = 0.12;
                    } else {
                        this.target = null;
                        this.isEngaged = false;
                    }
                    this.preparedAttack = false;
                }

                this.isEngaged = true;
                this.engagedLockTimer = 0.5;
                this.vel.x = 0; this.vel.y = 0;
                this.acc.x = 0; this.acc.y = 0;
            } else {
                this.isEngaged = true;
            }
        }
        if (this.targetStickTimer > 0) this.targetStickTimer -= dt;
    }

    getDistanceToTarget(game) {
        if (!this.target) return Infinity;
        const isBuilding = this.target.constructor.name === 'EconomicBuilding' || this.target.constructor.name === 'Building';
        if (isBuilding && game && game.getDoorPoint) {
            const door = game.getDoorPoint(this.target);
            return Utils.dist(this.x, this.y, door.x, door.y);
        }
        return Utils.dist(this.x, this.y, this.target.x, this.target.y);
    }

    getDistanceToTargetEstimate() {
        if (!this.target) return Infinity;
        return Utils.dist(this.x, this.y, this.target.x, this.target.y);
    }

    canAcceptMeleeAttacker() {
        return this.engagedHeroes.size < this.maxMeleeSlots;
    }
    registerEngagement(hero) {
        if (this.engagedHeroes.has(hero)) return true;
        if (this.canAcceptMeleeAttacker()) { this.engagedHeroes.add(hero); return true; }
        return false;
    }
    unregisterEngagement(hero) {
        if (this.engagedHeroes.has(hero)) this.engagedHeroes.delete(hero);
    }

    maintainSpace(entities, dt) {
        this.moveBlocked = false;
        let sepX = 0, sepY = 0;
        entities.forEach(e => {
            if (e === this || e.remove) return;
            const isUnit = e.constructor.name === 'Monster' || e.constructor.name === 'Hero' || e.constructor.name === 'Worker' || e.constructor.name === 'CastleGuard';
            if (isUnit) {
                if (e.visible === false) return;
                const dist = Utils.dist(this.x, this.y, e.x, e.y);
                const minGap = this.radius + e.radius;
                if (dist < minGap && dist > 0) {
                    const nx = (this.x - e.x) / dist;
                    const ny = (this.y - e.y) / dist;
                    const overlap = (minGap - dist);
                    const approachingTarget = this.target && this.getDistanceToTargetEstimate &&
                        this.getDistanceToTargetEstimate() < 50;
                    const scale = this.isEngaged ? 0.08 : (approachingTarget ? 0.15 : 0.3);
                    sepX += nx * overlap * scale;
                    sepY += ny * overlap * scale;
                }
                const fx = this.target ? this.target.x : this.x;
                const fy = this.target ? this.target.y : this.y;
                const dir = Utils.normalize(fx - this.x, fy - this.y);
                const ax = e.x - this.x, ay = e.y - this.y;
                const aheadDot = Utils.dot(dir.x, dir.y, (ax / ((dist || 1))), (ay / ((dist || 1))));
                if (aheadDot > 0.5 && dist < minGap * 1.2) this.moveBlocked = true;
            }
            if (e.constructor.name === 'EconomicBuilding') {
                if (this.target === e || this.isEngaged) return;
                const tx = this.target ? this.target.x : this.x;
                const ty = this.target ? this.target.y : this.y;
                const dir = Utils.normalize(tx - this.x, ty - this.y);
                const bx = e.x - this.x;
                const by = e.y - this.y;
                const bd = Math.hypot(bx, by);
                const bw = Number.isFinite(e.width) ? e.width : 0;
                const bh = Number.isFinite(e.height) ? e.height : 0;
                if (bd < Math.max(bw, bh)) {
                    const bdir = Utils.normalize(bx, by);
                    const facing = Utils.dot(dir.x, dir.y, bdir.x, bdir.y);
                    if (facing > 0.8) {
                        const perp = Utils.perp(dir.x, dir.y);
                        const ax = perp.x * 100 * dt;
                        const ay = perp.y * 100 * dt;
                        if (Number.isFinite(ax) && Number.isFinite(ay)) {
                            this.acc.x += ax;
                            this.acc.y += ay;
                        }
                    }
                }
            }
        });
        this.acc.x += sepX;
        this.acc.y += sepY;
    }

    integrate(dt, game) {
        if (isNaN(this.x) || isNaN(this.y)) {
            this.x = this.prevX || 0;
            this.y = this.prevY || 0;
            this.vel.x = 0; this.vel.y = 0;
            this.acc.x = 0; this.acc.y = 0;
            return;
        }

        if (this.isEngaged && this.attackCooldown <= 0) {
            this.vel.x = 0; this.vel.y = 0;
            this.acc.x = 0; this.acc.y = 0;
            return;
        }
        const aLimited = Utils.limitVec(this.acc.x, this.acc.y, this.speed * 3);
        this.vel.x += aLimited.x * dt;
        this.vel.y += aLimited.y * dt;
        const friction = 0.97;
        this.vel.x *= friction;
        this.vel.y *= friction;
        const limited = Utils.limitVec(this.vel.x, this.vel.y, this.speed);
        this.vel.x = limited.x; this.vel.y = limited.y;
        const velMag = Math.hypot(this.vel.x, this.vel.y);
        this.walkPhase = (this.walkPhase || 0) + (velMag > 0.5 ? velMag * 0.05 : 0) * dt * 60;
        if (velMag < 0.02) { this.vel.x = 0; this.vel.y = 0; }
        this.x += this.vel.x * dt;
        this.y += this.vel.y * dt;
        if (Number.isFinite(this.x) && Number.isFinite(this.y)) {
            this.prevX = this.x;
            this.prevY = this.y;
        }
        this.acc.x = 0; this.acc.y = 0;
    }

    updateGather(dt, game) {
        this.gatherTimer -= dt;
        if (this.gatherTimer <= 0) {
            this.state = 'HUNT';
            return;
        }

        // 1. Move to gather point
        const dist = Utils.dist(this.x, this.y, this.gatherPoint.x, this.gatherPoint.y);
        if (dist > 50) {
            // Move towards gather point
            const dx = this.gatherPoint.x - this.x;
            const dy = this.gatherPoint.y - this.y;
            const angle = Math.atan2(dy, dx);
            this.acc.x += Math.cos(angle) * this.speed * 4; // Use acceleration
            this.acc.y += Math.sin(angle) * this.speed * 4;
        } else {
            // 2. Nervous Idle (Random jitter)
            if (Math.random() < 0.05) {
                const jitterAngle = Math.random() * Math.PI * 2;
                this.acc.x += Math.cos(jitterAngle) * this.speed * 5;
                this.acc.y += Math.sin(jitterAngle) * this.speed * 5;
            }
        }

        // 3. Check for friends
        if (Math.floor(this.gatherTimer) !== Math.floor(this.gatherTimer + dt)) {
            let allies = 0;
            const checkRadius = 150;
            for (const e of game.entities) {
                if (e.constructor.name === 'Monster' &&
                    e !== this &&
                    e.behavior === 'SWARM' &&
                    Utils.dist(this.x, this.y, e.x, e.y) < checkRadius) {
                    allies++;
                }
            }

            if (allies >= this.swarmThreshold) {
                this.state = 'HUNT';
                game.entities.push(new Particle(this.x, this.y - 30, "ATTACK!", "red"));
            }
        }
    }

    fireProjectile(game) {
        if (this.target) {
            const proj = new Projectile(
                this.x,
                this.y - 15,
                this.target,
                this.damage,
                this,
                this.projectileColor
            );
            game.entities.push(proj);
        }
    }

    takeDamage(amount, game, source = null) {
        if (this.state === 'GATHER') {
            this.state = 'HUNT';
            this.gatherTimer = 0;
        }

        if (Math.random() < this.dodgeChance) {
            if (game) game.entities.push(new Particle(this.x, this.y - 20, "DODGE", "cyan"));
            return;
        }

        if (Math.random() < this.parryChance) {
            amount *= 0.5;
            if (game) game.entities.push(new Particle(this.x, this.y - 20, "PARRY", "white"));
        }

        if (this.resistPct > 0) {
            const resisted = amount * this.resistPct;
            amount -= resisted;
        }

        this.hp -= amount;
        this.flashTimer = 0.06;
        if (game) game.entities.push(new Particle(this.x, this.y - 20, "-" + Math.floor(amount), "#ff5555"));

        if (source) {
            const currentDamage = this.damageHistory.get(source) || 0;
            this.damageHistory.set(source, currentDamage + amount);

            const isHero = source.constructor.name === 'Hero';
            const isTower = source.constructor.name === 'EconomicBuilding' && source.type === 'TOWER';

            if ((isHero && source.visible && !source.remove && source.hp > 0) ||
                (isTower && !source.remove && source.hp > 0)) {

                const currentTargetDist = this.target ? Utils.dist(this.x, this.y, this.target.x, this.target.y) : Infinity;
                const newAttackerDist = Utils.dist(this.x, this.y, source.x, source.y);

                const shouldSwitch = !this.target ||
                    this.target.remove ||
                    this.target.hp <= 0 ||
                    (newAttackerDist < currentTargetDist * 0.5);

                if (shouldSwitch) {
                    this.aggroTarget = source;
                    this.aggroTimer = 5.0;
                    this.target = source;
                    this.targetStickTimer = 2.0;
                } else {
                    this.aggroTarget = source;
                    this.aggroTimer = 5.0;
                }
            }
        }

        if (this.hp <= 0 && !this.remove) {
            this.remove = true;
            this.distributeRewards(game, source);
        }
    }

    distributeRewards(game, killer) {
        const totalGold = this.goldValue;
        let totalHeroDamage = 0;
        const heroDamageMap = new Map();

        for (const [source, damage] of this.damageHistory.entries()) {
            if (source.constructor.name === 'Hero') {
                totalHeroDamage += damage;
                heroDamageMap.set(source, damage);
            }
        }

        if (totalHeroDamage > 0) {
            const bonusAmount = Math.floor(totalGold * 0.2);
            const poolAmount = totalGold - bonusAmount;

            if (killer && killer.constructor.name === 'Hero') {
                killer.gold += bonusAmount;
                killer.history.goldEarned += bonusAmount;
                game.entities.push(new Particle(killer.x, killer.y - 40, `+${bonusAmount}g (Kill)`, "gold"));
            }

            const distributeAmount = (killer && killer.constructor.name === 'Hero') ? poolAmount : totalGold;

            for (const [hero, damage] of heroDamageMap.entries()) {
                if (hero.remove) continue;

                const share = Math.floor((damage / totalHeroDamage) * distributeAmount);
                if (share > 0) {
                    hero.gold += share;
                    hero.history.goldEarned += share;
                    game.entities.push(new Particle(hero.x, hero.y - 30, `+${share}g`, "gold"));
                }
            }
        } else {
            game.gold += totalGold;
            game.entities.push(new Particle(this.x, this.y - 30, `+${totalGold}g`, "yellow"));
        }
    }

    draw(ctx) {
        let ox = 0, oy = 0;
        if (this.lungeTimer > 0) { const t = this.lungeTimer / 0.12; ox = this.lungeVec.x * t; oy = this.lungeVec.y * t; }
        const vm = Math.hypot(this.vel.x, this.vel.y);
        if (vm > 0.5) { oy += Math.sin((this.walkPhase || 0)) * 1.2; }
        Utils.drawSprite(ctx, 'monster', this.x + ox, this.y + oy, this.radius * 2, this.color);
        if (this.flashTimer > 0) { ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.x, this.y, this.radius + 5, 0, Math.PI * 2); ctx.stroke(); }
        ctx.fillStyle = '#333';
        ctx.fillRect(this.x - 10, this.y - 15, 20, 3);
        ctx.fillStyle = '#ff3333';
        ctx.fillRect(this.x - 10, this.y - 15, 20 * (this.hp / this.maxHp), 3);
    }
}
