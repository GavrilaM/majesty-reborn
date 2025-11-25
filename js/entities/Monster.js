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
        this.decisionTimer = 0; // Balancing: Delay between actions

        // AGGRO SYSTEM
        this.aggroTarget = null; // Hero or Tower who damaged us (for retaliation)
        this.aggroTimer = 0; // How long to chase the aggro target (5 seconds)
        this.noticeRange = 150; // How close a hero needs to be to trigger "opportunity" attack

        // SIEGE SYSTEM - Lock-on persistence
        this.siegeTarget = null; // Building we're currently sieging
        this.siegeLockTimer = 0; // How long to stick with a siege target (prevents stuttering)
        this.siegeLockDuration = 2.0; // Lock onto building for 2 seconds minimum
    }

    update(dt, game) {
        if (this.attackCooldown > 0) this.attackCooldown -= dt;

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
        if ((!this.target || this.target.constructor.name !== 'Hero') && this.siegeLockTimer <= 0) {
            let nearbyHero = null;
            let closestDist = this.noticeRange;

            game.entities.forEach(e => {
                if (e.constructor.name === 'Hero' && e.visible && !e.remove && e.hp > 0) {
                    const d = Utils.dist(this.x, this.y, e.x, e.y);
                    if (d < closestDist) {
                        closestDist = d;
                        nearbyHero = e;
                    }
                }
            });

            if (nearbyHero) {
                // Hero opportunity overrides siege lock
                this.target = nearbyHero;
                this.siegeTarget = null;
                this.siegeLockTimer = 0;
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

        if (distToTarget > attackRange) {
            // Move towards target
            const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
            this.x += Math.cos(angle) * this.speed * dt;
            this.y += Math.sin(angle) * this.speed * dt;
        }
        else {
            // In attack range
            if (this.attackCooldown <= 0) {
                // Final check before attacking
                const isHero = this.target.constructor.name === 'Hero';
                const isValidHero = isHero && this.target.visible && this.target.hp > 0;
                const isBuilding = this.target.constructor.name === 'EconomicBuilding' ||
                    this.target.constructor.name === 'Building';
                const isValidBuilding = isBuilding && this.target.hp > 0;

                if (this.target && this.target.takeDamage &&
                    !this.target.remove &&
                    (isValidHero || isValidBuilding)) {
                    this.target.takeDamage(this.damage, game, this);
                    this.attackCooldown = 1.5;
                } else {
                    // Target became invalid during attack, drop it
                    this.target = null;
                }
            }
        }
    }

    maintainSpace(entities, dt) {
        entities.forEach(e => {
            if (e === this || e.remove) return;
            // Collide with Monsters and Heroes
            const isUnit = e.constructor.name === 'Monster' || e.constructor.name === 'Hero';
            if (isUnit) {
                const dist = Utils.dist(this.x, this.y, e.x, e.y);
                const minGap = this.radius + e.radius;

                // Soft Collision
                if (dist < minGap && dist > 0) {
                    const overlap = minGap - dist;
                    const force = Math.min(overlap * 2, 10) * dt;
                    const angle = Math.atan2(this.y - e.y, this.x - e.x);

                    this.x += Math.cos(angle) * force * 10;
                    this.y += Math.sin(angle) * force * 10;
                }
            }
        });
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
        Utils.drawSprite(ctx, 'monster', this.x, this.y, this.radius * 2, this.color);
        ctx.fillStyle = 'red';
        ctx.fillRect(this.x - 10, this.y - 15, 20, 3);
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(this.x - 10, this.y - 15, 20 * (this.hp / this.maxHp), 3);
    }
}