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
        this.goldDrop = config.goldDrop || 0;
        this.color = config.color;
        this.displayName = config.name || archetypeKey;
        this.description = config.description || '';
        this.dodgeChance = config.dodgeChance || 0;
        this.parryChance = config.parryChance || 0;
        this.resistPct = config.resistPct || 0;
        
        this.radius = archetypeKey === 'TANK' ? 20 : 12; 
        this.remove = false;
        this.attackCooldown = 0;
        this.target = null;
        this.lastHitBy = null;
        this.killedBy = null;
        
        // AGGRO SYSTEM
        this.aggroTarget = null;
        this.aggroLockTimer = 0;
        this.aggroLockDuration = 3.0;
        this.noticeRange = 150;
        this.threatTable = new Map();
        
        // SIEGE SYSTEM - Lock-on persistence
        this.siegeTarget = null;
        this.siegeLockTimer = 0;
        this.siegeLockDuration = 2.0;
        this.decisionTimer = 0;
    }

    update(dt, game) {
        if (this.attackCooldown > 0) this.attackCooldown -= dt;
        
        if (this.aggroLockTimer > 0) this.aggroLockTimer -= dt;
        if (this.decisionTimer > 0) this.decisionTimer -= dt;
        
        // Threat decay
        if (this.threatTable.size > 0) {
            const decay = 5 * dt;
            for (const [attacker, threat] of this.threatTable.entries()) {
                const next = Math.max(0, threat - decay);
                if (next === 0) this.threatTable.delete(attacker); else this.threatTable.set(attacker, next);
            }
        }
        
        // Update siege lock timer
        if (this.siegeLockTimer > 0) {
            this.siegeLockTimer -= dt;
        }

        this.maintainSpace(game.entities, dt);

        // === AGGRO SYSTEM: 3-STEP PRIORITY ===
        
        // Aggro lock: commit to target for minimum duration unless exceptions
        if (this.aggroTarget && this.aggroLockTimer > 0) {
            const maxRange = 300;
            const invalid = !this.isValidTarget(this.aggroTarget) || Utils.dist(this.x, this.y, this.aggroTarget.x, this.aggroTarget.y) > maxRange;
            if (invalid) {
                this.aggroLockTimer = 0;
                this.aggroTarget = null;
            } else {
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
                if ((!this.aggroTarget || this.aggroLockTimer <= 0) && this.decisionTimer <= 0) {
                    this.target = nearbyHero;
                    this.decisionTimer = Utils.rand(0, 2);
                }
            }
        }
        
        // STEP 3: SIEGE - Target the nearest building (Guilds, Markets, Towers, or Castle)
        // Only if we're not in aggro mode and siege lock has expired or no siege target
        if (!this.aggroTarget && this.aggroLockTimer <= 0) {
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

    isValidTarget(ent) {
        if (!ent) return false;
        if (ent.remove || ent.hp <= 0) return false;
        if (ent.constructor.name === 'Hero') return ent.visible && ent.hp > 0 && !ent.remove;
        return true;
    }

    evaluateThreatSwitch() {
        if (this.threatTable.size === 0) return;
        const currentThreat = this.aggroTarget ? (this.threatTable.get(this.aggroTarget) || 0) : 0;
        let top = null;
        let topThreat = 0;
        for (const [attacker, threat] of this.threatTable.entries()) {
            if (!this.isValidTarget(attacker)) continue;
            if (threat > topThreat) { topThreat = threat; top = attacker; }
        }
        if (!top) return;
        const threshold = currentThreat * 1.5;
        if (!this.aggroTarget || this.aggroLockTimer <= 0) {
            if (topThreat >= threshold) {
                this.aggroTarget = top;
                this.target = top;
                this.aggroLockTimer = this.aggroLockDuration;
                this.siegeTarget = null;
                this.siegeLockTimer = 0;
            }
        }
    }

    maintainSpace(entities, dt) {
        entities.forEach(e => {
            if (e === this || e.remove) return;
            if (e.constructor.name === 'Monster') {
                const dist = Utils.dist(this.x, this.y, e.x, e.y);
                const minGap = this.radius + e.radius; 
                if (dist < minGap && dist > 0) {
                    const pushStrength = 40 * dt; 
                    const angle = Math.atan2(this.y - e.y, this.x - e.x);
                    this.x += Math.cos(angle) * pushStrength;
                    this.y += Math.sin(angle) * pushStrength;
                }
            }
        });
    }

    takeDamage(amount, game, source = null) {
        this.lastHitBy = source || this.lastHitBy;
        if (Math.random() < this.dodgeChance) {
            if (game) game.entities.push(new Particle(this.x, this.y - 20, "DODGE", "cyan"));
            amount = 0;
        }
        if (amount > 0 && Math.random() < this.parryChance) {
            amount *= 0.5;
            if (game) game.entities.push(new Particle(this.x, this.y - 20, "PARRY", "white"));
        }
        if (amount > 0 && this.resistPct > 0) {
            amount = amount * (1 - this.resistPct);
        }
        this.hp -= amount;
        if (game) game.entities.push(new Particle(this.x, this.y - 20, "-" + Math.floor(amount), "#ff5555"));
        
        if (source) {
            const prev = this.threatTable.get(source) || 0;
            this.threatTable.set(source, prev + amount);
            if (this.aggroLockTimer <= 0 && this.decisionTimer <= 0) {
                this.evaluateThreatSwitch();
                this.decisionTimer = Utils.rand(0, 2);
            }
        }
        
        if (this.hp <= 0) {
            const gold = this.goldDrop || 0;
            if (game && gold > 0) {
                const payees = [];
                for (const attacker of this.threatTable.keys()) {
                    if (attacker && attacker.constructor && attacker.constructor.name === 'Hero' && !attacker.remove && attacker.hp > 0) {
                        payees.push(attacker);
                    }
                }
                if (payees.length > 0) {
                    const share = Math.floor(gold / payees.length);
                    if (share > 0) {
                        payees.forEach(h => {
                            h.history.goldEarned += share;
                            h.gold += share;
                            game.entities.push(new Particle(h.x, h.y - 30, `+${share}g`, 'gold'));
                        });
                    }
                }
            }
            this.killedBy = this.lastHitBy;
            this.remove = true;
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
