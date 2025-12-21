// ... imports ...
import { Utils } from '../utils.js';
import { Particle } from './Particle.js';
import { MONSTER_ARCHETYPES } from '../config/ClassConfig.js';

export class Monster {
    constructor(x, y, archetypeKey = 'SWARM') {
        this.x = x;
        this.y = y;
        this.archetype = archetypeKey;

        const config = MONSTER_ARCHETYPES[archetypeKey];
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
    }

    update(dt, game) {
        if (this.hp <= 0 || this.remove) return;
        if (this.attackCooldown > 0) this.attackCooldown -= dt;
        if (this.attackWindup > 0) this.attackWindup -= dt;
        if (this.lungeTimer > 0) this.lungeTimer -= dt;
        if (this.flashTimer > 0) this.flashTimer -= dt;
        if (this.reactionTimer > 0) { this.reactionTimer -= dt; if (this.reactionTimer > 0) return; }

        // BALANCING: Decision Delay
        if (this.decisionTimer > 0) {
            this.decisionTimer -= dt;
            // If waiting, we might still move if we have a target, but let's say we pause thinking?
            // Or maybe this only affects switching targets?
            // For now, let's make it a hard pause for "thinking" to slow down chaos
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

        this.maintainSpace(game.entities, dt);

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
                // Chase the attacker (Hero or Tower) who damaged us
                // Aggro overrides siege lock
                this.target = this.aggroTarget;
                this.siegeTarget = null;
                this.siegeLockTimer = 0;
            }
        }

        // STEP 2: OPPORTUNITY - If a Hero gets too close (Notice Range), attack them
        // Only check if we're not locked onto a siege target
        if ((!this.target || (this.target.constructor.name !== 'Hero' && this.target.constructor.name !== 'Worker' && this.target.constructor.name !== 'CastleGuard')) && this.siegeLockTimer <= 0 && this.targetStickTimer <= 0) {
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
                this.target = nearbyUnit;
                this.reactionTimer = Utils.rand(0.2, 0.7);
                this.siegeTarget = null;
                this.siegeLockTimer = 0;
                this.targetStickTimer = 2.0;
            }
        }

        // STEP 3: SIEGE - Target the nearest building (Guilds, Markets, Towers, or Castle)
        // Only if we're not in aggro mode and siege lock has expired or no siege target
        if (!this.aggroTarget && this.aggroTimer <= 0) {
            const isCurrentTargetBuilding = this.target &&
                (this.target.constructor.name === 'EconomicBuilding' ||
                    this.target.constructor.name === 'Building');

            // If we have a siege target and lock timer is active, stick with it
            if (this.siegeTarget && this.siegeLockTimer > 0) {
                // Validate siege target
                if (this.siegeTarget.remove || this.siegeTarget.hp <= 0) {
                    this.siegeTarget = null;
                    this.siegeLockTimer = 0;
                    this.target = null;
                } else {
                    // Keep targeting the locked siege target
                    this.target = this.siegeTarget;
                }
            }

            // If no valid target or siege lock expired, find new building
            if (!this.target || (!isCurrentTargetBuilding && this.siegeLockTimer <= 0)) {
                // Validate current target
                if (this.target && (this.target.remove ||
                    (this.target.constructor.name === 'Hero' && (!this.target.visible || this.target.hp <= 0)))) {
                    this.target = null;
                }

                // If no valid target, find the closest building to attack
                if (!this.target) {
                    let closestBuilding = null;
                    let minDistance = Infinity;

                    // Iterate through all entities to find buildings
                    game.entities.forEach(e => {
                        // Check for both 'EconomicBuilding' (Guilds, Markets, Towers, Castle) and 'Building'
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

                    // Default to castle only if no other buildings exist
                    const newTarget = closestBuilding || (game.castle && !game.castle.remove ? game.castle : null);

                    if (newTarget) {
                        this.target = newTarget;
                        this.siegeTarget = newTarget;
                        this.siegeLockTimer = this.siegeLockDuration; // Lock onto this building
                        this.decisionTimer = Utils.rand(0.5, 1.5); // Pause before engaging
                    }
                }
            }
        }

        // MOVE / ATTACK (only if target is valid)
        if (!this.target) {
            // No valid target - stand still
            return;
        }

        // Final validation before movement/attack
        if (this.target.remove || this.target.hp <= 0 ||
            (this.target.constructor.name === 'Hero' && (!this.target.visible || this.target.hp <= 0))) {
            this.target = null;
            return;
        }

        const distToTarget = Utils.dist(this.x, this.y, this.target.x, this.target.y);
        const attackRange = this.radius + 20;
        
        // Fix: For large buildings, distance to center is misleading. 
        // Use distance to edge/door if target is a building.
        let effectiveRange = attackRange;
        let targetPoint = { x: this.target.x, y: this.target.y };

        const isBuilding = this.target.constructor.name === 'EconomicBuilding' || this.target.constructor.name === 'Building';
        if (isBuilding) {
            // Use door point or approximate edge
            if (game.getDoorPoint) {
                targetPoint = game.getDoorPoint(this.target);
            }
            // Increase range slightly for buildings to account for size
            effectiveRange = attackRange + 10; 
        }

        const distToPoint = Utils.dist(this.x, this.y, targetPoint.x, targetPoint.y);

        if (distToPoint > effectiveRange) {
            // Move towards target
            const dx = targetPoint.x - this.x, dy = targetPoint.y - this.y;
            const dist = Math.hypot(dx, dy);
            const dir = dist > 0 ? { x: dx / dist, y: dy / dist } : { x: 0, y: 0 };
            const arriveRadius = 50;
            const desiredSpeed = dist < arriveRadius ? this.speed * (dist / arriveRadius) : this.speed;
            // Flow blending jika target bangunan
            let flow = { x: 0, y: 0 };
            if (this.target && this.target.constructor.name === 'EconomicBuilding' && this.target.id) {
                const door = game.getDoorPoint(this.target);
                flow = game.getFlowVector(this.target.id + ':door', door.x, door.y, this.x, this.y);
            } else if (this.siegeTarget && this.siegeTarget.id) {
                const door = game.getDoorPoint(this.siegeTarget);
                flow = game.getFlowVector(this.siegeTarget.id + ':door', door.x, door.y, this.x, this.y);
            }
            let blendDir = Utils.normalize(dir.x + flow.x * 0.6, dir.y + flow.y * 0.6);
            if (this.moveBlocked) {
                if (this.blockedTimer <= 0) { this.blockedTimer = 0.35; this.blockedSide = Math.random() < 0.5 ? -1 : 1; }
                const perp = Utils.perp(blendDir.x, blendDir.y);
                const steerSide = { x: perp.x * this.blockedSide, y: perp.y * this.blockedSide };
                blendDir = Utils.normalize(blendDir.x + steerSide.x * 0.8, blendDir.y + steerSide.y * 0.8);
            } else {
                if (this.blockedTimer > 0) this.blockedTimer = Math.max(0, this.blockedTimer - dt);
                if (this.blockedTimer <= 0) this.blockedSide = 0;
            }
            const desired = { x: blendDir.x * desiredSpeed, y: blendDir.y * desiredSpeed };
            const steer = { x: desired.x - this.vel.x, y: desired.y - this.vel.y };
            const limited = Utils.limitVec(steer.x, steer.y, this.speed);
            this.acc.x += limited.x; this.acc.y += limited.y;
            this.isEngaged = false; this.engagedLockTimer = 0;
            this.preparedAttack = false; // Reset attack prep if we move
        }
        else {
            // In attack range
            if (this.attackCooldown <= 0) {
                if (!this.preparedAttack) {
                    // Start windup
                    this.attackWindup = 0.2;
                    this.preparedAttack = true;
                } else if (this.attackWindup <= 0) {
                    // Final check before attacking
                    const isHero = this.target.constructor.name === 'Hero';
                    const isWorker = this.target.constructor.name === 'Worker';
                    const isGuard = this.target.constructor.name === 'CastleGuard';
                    const isValidUnit = (isHero && this.target.visible) || isWorker || isGuard;
                    const isBuilding = this.target.constructor.name === 'EconomicBuilding' ||
                        this.target.constructor.name === 'Building';
                    const isValidBuilding = isBuilding && this.target.hp > 0;

                    if (this.target && this.target.takeDamage &&
                        !this.target.remove &&
                        ((isValidUnit && this.target.hp > 0) || isValidBuilding)) {
                        this.target.takeDamage(this.damage, game, this);
                        this.attackCooldown = 1.5;
                        // Lunge
                        const ang = Math.atan2(this.target.y - this.y, this.target.x - this.x);
                        this.lungeVec = { x: Math.cos(ang) * 4, y: Math.sin(ang) * 4 };
                        this.lungeTimer = 0.12;
                    } else {
                        // Target became invalid during attack, drop it
                        this.target = null;
                    }
                    this.preparedAttack = false;
                }
            }

            this.isEngaged = true; if (this.engagedLockTimer <= 0) this.engagedLockTimer = 1.0;
            this.vel.x = 0; this.vel.y = 0;
            this.acc.x = 0; this.acc.y = 0;
        }
        if (this.targetStickTimer > 0) this.targetStickTimer -= dt;
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
                    const pushStrength = overlap * 0.5;
                    const scale = this.isEngaged ? 0.0 : 0.3;
                    sepX += nx * overlap * scale;
                    sepY += ny * overlap * scale;
                }
                const fx = this.target ? this.target.x : this.x;
                const fy = this.target ? this.target.y : this.y;
                const dir = Utils.normalize(fx - this.x, fy - this.y);
                const ax = e.x - this.x, ay = e.y - this.y;
                const aheadDot = Utils.dot(dir.x, dir.y, (ax / ((dist||1))), (ay / ((dist||1))));
                if (aheadDot > 0.6 && dist < minGap * 0.8) this.moveBlocked = true;
            }
            if (e.constructor.name === 'EconomicBuilding') {
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
                        const stepX = perp.x * 12 * dt;
                        const stepY = perp.y * 12 * dt;
                        if (Number.isFinite(stepX) && Number.isFinite(stepY)) {
                            this.x += stepX;
                            this.y += stepY;
                        }
                    }
                }
            }
        });
        this.acc.x += sepX;
        this.acc.y += sepY;
    }

    integrate(dt, game) {
        // Safety check for NaN coordinates (Ghost Monster Fix)
        if (isNaN(this.x) || isNaN(this.y)) {
            this.hp = 0; 
            this.remove = true;
            return;
        }

        // HARD STOP when engaged in combat
        if (this.isEngaged) {
            this.vel.x = 0; this.vel.y = 0;
            this.acc.x = 0; this.acc.y = 0;
            return;
        }
        // Limit acceleration then apply
        const aLimited = Utils.limitVec(this.acc.x, this.acc.y, this.speed * 3);
        this.vel.x += aLimited.x * dt;
        this.vel.y += aLimited.y * dt;
        // Apply friction/dampening
        const friction = 0.97;
        this.vel.x *= friction;
        this.vel.y *= friction;
        // Clamp to max speed
        const limited = Utils.limitVec(this.vel.x, this.vel.y, this.speed);
        this.vel.x = limited.x; this.vel.y = limited.y;
        // Stop completely if velocity is negligible
        const velMag = Math.hypot(this.vel.x, this.vel.y);
        if (velMag < 0.02) { this.vel.x = 0; this.vel.y = 0; }
        this.x += this.vel.x * dt;
        this.y += this.vel.y * dt;
        this.acc.x = 0; this.acc.y = 0;
    }

    takeDamage(amount, game, source = null) {
        // COMBAT STATS LOGIC
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
            // Optional: Show resist text? Maybe too cluttered.
        }

        this.hp -= amount;
        this.flashTimer = 0.06;
        if (game) game.entities.push(new Particle(this.x, this.y - 20, "-" + Math.floor(amount), "#ff5555"));

        // TRACK DAMAGE
        if (source) {
            // Unwrap projectile source if needed (though Projectile passes the real source usually)
            // But here we trust 'source' is the entity that caused damage
            const currentDamage = this.damageHistory.get(source) || 0;
            this.damageHistory.set(source, currentDamage + amount);

            // AGGRO: If damaged by a Hero OR a Tower, set them as retaliation target for 5 seconds
            const isHero = source.constructor.name === 'Hero';
            const isTower = source.constructor.name === 'EconomicBuilding' && source.type === 'TOWER';

            // If I was hit by a Hero OR a Tower, and they're still valid
            if ((isHero && source.visible && !source.remove && source.hp > 0) ||
                (isTower && !source.remove && source.hp > 0)) {
                this.aggroTarget = source;
                this.aggroTimer = 5.0; // Chase for 5 seconds
                // Immediately switch target to the attacker
                this.target = source;
                this.targetStickTimer = 0;
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

        // 1. Filter and sum damage from Heroes
        for (const [source, damage] of this.damageHistory.entries()) {
            if (source.constructor.name === 'Hero') {
                totalHeroDamage += damage;
                heroDamageMap.set(source, damage);
            }
        }

        // 2. Determine distribution
        if (totalHeroDamage > 0) {
            // Heroes contributed!

            // Calculate Last Hit Bonus (20%)
            const bonusAmount = Math.floor(totalGold * 0.2);
            const poolAmount = totalGold - bonusAmount;

            // If killer is a Hero, they get the bonus
            if (killer && killer.constructor.name === 'Hero') {
                killer.gold += bonusAmount;
                killer.history.goldEarned += bonusAmount;
                game.entities.push(new Particle(killer.x, killer.y - 40, `+${bonusAmount}g (Kill)`, "gold"));
            } else {
                // Killer was not a hero (e.g. Tower), or unknown.
                // Add bonus back to pool? Or give to Treasury?
                // Prompt: "if they [building] last hit, gold still shared among the heroes."
                // So we just distribute the bonus along with the pool, effectively making the pool 100%
                // But wait, if we add it to pool, it's distributed by damage.
                // If we want to strictly follow "last hit get bigger %", we only give bonus if hero killed.
                // If building killed, no one gets "last hit bonus", so the whole pot is shared.
                // So effectively, poolAmount becomes totalGold.
                // BUT, if we want to be nice, maybe we just distribute totalGold proportional to damage.
            }

            const distributeAmount = (killer && killer.constructor.name === 'Hero') ? poolAmount : totalGold;

            // Distribute the rest based on damage contribution
            for (const [hero, damage] of heroDamageMap.entries()) {
                if (hero.remove) continue; // Skip removed heroes (optional, but safer)

                const share = Math.floor((damage / totalHeroDamage) * distributeAmount);
                if (share > 0) {
                    hero.gold += share;
                    hero.history.goldEarned += share;
                    game.entities.push(new Particle(hero.x, hero.y - 30, `+${share}g`, "gold"));
                }
            }
        } else {
            // No heroes involved (Tower solo kill) -> Treasury
            game.gold += totalGold;
            game.entities.push(new Particle(this.x, this.y - 30, `+${totalGold}g`, "yellow"));
        }
    }

    draw(ctx) {
        let ox = 0, oy = 0;
        if (this.lungeTimer > 0) { const t = this.lungeTimer / 0.12; ox = this.lungeVec.x * t; oy = this.lungeVec.y * t; }
        Utils.drawSprite(ctx, 'monster', this.x + ox, this.y + oy, this.radius * 2, this.color);
        if (this.flashTimer > 0) { ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.x, this.y, this.radius + 5, 0, Math.PI * 2); ctx.stroke(); }
        ctx.fillStyle = 'red';
        ctx.fillRect(this.x - 10, this.y - 15, 20, 3);
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(this.x - 10, this.y - 15, 20 * (this.hp / this.maxHp), 3);
    }
}
