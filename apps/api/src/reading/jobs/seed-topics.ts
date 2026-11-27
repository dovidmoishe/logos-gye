
import { sql } from 'drizzle-orm';

import { createDbClient } from './client';
import { topics } from '../../db/scripture';
import { getScriptOptions } from './lib/script-config';



const TOPIC_SEEDS = [
  ['faith', 'Faith', 'Trust, belief, confidence in God, spiritual conviction, and living by reliance on God.'],
  ['fear', 'Fear', 'Fear, dread, intimidation, courage, and seeking God in frightening circumstances.'],
  ['anxiety', 'Anxiety', 'Worry, anxious thoughts, uncertainty, distress, and concern about circumstances or the future.'],
  ['prayer', 'Prayer', 'Speaking with God, asking, intercession, thanksgiving, persistence, and dependence through prayer.'],
  ['peace', 'Peace', 'Inner peace, reconciliation, calm, rest, wholeness, and freedom from turmoil.'],
  ['purpose', 'Purpose', 'Calling, meaning, direction, assignment, vocation, and understanding why one is here.'],
  ['wisdom', 'Wisdom', 'Discernment, wise choices, instruction, prudence, understanding, and godly judgment.'],
  ['discipline', 'Discipline', 'Self-discipline, training, consistency, correction, obedience, and forming mature habits.'],
  ['diligence', 'Diligence', 'Hard work, persistence, stewardship, excellence, responsibility, and faithful effort.'],
  ['relationships', 'Relationships', 'Friendship, community, family, conflict, loyalty, encouragement, and life with others.'],
  ['marriage', 'Marriage', 'Marriage, covenant love, husbands and wives, faithfulness, intimacy, and household unity.'],
  ['love', 'Love', 'Godly love, compassion, kindness, sacrifice, affection, mercy, and care for others.'],
  ['forgiveness', 'Forgiveness', 'Receiving and extending forgiveness, mercy, pardon, reconciliation, and release from offense.'],
  ['sin', 'Sin', 'Disobedience, guilt, rebellion, repentance, corruption, and the need for cleansing.'],
  ['temptation', 'Temptation', 'Testing, enticement, resisting sin, endurance, and escaping destructive desires.'],
  ['self-control', 'Self-Control', 'Restraint, moderation, sober-mindedness, impulse control, and disciplined desires.'],
  ['purity', 'Purity', 'Holiness, sexual purity, clean motives, integrity, and being set apart for God.'],
  ['grief', 'Grief', 'Sorrow, mourning, loss, lament, comfort, tears, and hope in pain.'],
  ['loneliness', 'Loneliness', 'Isolation, abandonment, feeling unseen, companionship, belonging, and God being near.'],
  ['healing', 'Healing', 'Restoration, sickness, wounds, recovery, deliverance, and God making whole.'],
  ['anger', 'Anger', 'Wrath, frustration, patience under provocation, gentleness, and controlling harsh reactions.'],
  ['patience', 'Patience', 'Waiting, endurance, long-suffering, perseverance, timing, and remaining faithful under delay.'],
  ['leadership', 'Leadership', 'Serving, influence, authority, shepherding, responsibility, humility, and leading others well.'],
  ['identity', 'Identity', 'Worth, belonging, being known by God, new life, sonship, and spiritual identity.'],
  ['salvation', 'Salvation', 'Rescue, redemption, eternal life, deliverance from sin, and being saved by God.'],
  ['grace', 'Grace', 'Undeserved favor, mercy, gift, kindness from God, and strength beyond personal merit.'],
  ['trust', 'Trust', 'Reliance, confidence, surrender, depending on God, and believing his faithfulness.'],
  ['contentment', 'Contentment', 'Satisfaction, gratitude, enoughness, resisting comparison, and peace in provision.'],
  ['hope', 'Hope', 'Expectation, future restoration, confidence in God promises, encouragement, and not giving up.'],
  ['joy', 'Joy', 'Gladness, rejoicing, delight in God, celebration, and strength through spiritual joy.'],
  ['obedience', 'Obedience', 'Following God commands, submission, faithfulness, surrender, and responsive action.'],
  ['repentance', 'Repentance', 'Turning from sin, confession, changed direction, humility, and returning to God.'],
  ['humility', 'Humility', 'Meekness, lowliness, teachability, serving others, and resisting pride.'],
  ['pride', 'Pride', 'Arrogance, self-exaltation, conceit, boasting, and the danger of resisting God.'],
  ['justice', 'Justice', 'Righteous judgment, fairness, defending the vulnerable, truth, and setting wrongs right.'],
  ['mercy', 'Mercy', 'Compassion, pity, kindness toward the guilty or hurting, and withholding deserved judgment.'],
  ['compassion', 'Compassion', 'Tenderhearted concern, care for suffering, kindness, and action toward people in need.'],
  ['generosity', 'Generosity', 'Giving, sharing, open-handedness, charity, hospitality, and provision for others.'],
  ['stewardship', 'Stewardship', 'Managing resources, money, gifts, time, creation, and responsibilities faithfully.'],
  ['work', 'Work', 'Labor, vocation, effort, productivity, excellence, and serving God through daily work.'],
  ['money', 'Money', 'Wealth, poverty, provision, greed, generosity, debt, and faithful financial stewardship.'],
  ['provision', 'Provision', 'Needs being met, daily bread, dependence, abundance, and God supplying what is necessary.'],
  ['guidance', 'Guidance', 'Direction, decision-making, paths, counsel, seeking God will, and being led.'],
  ['strength', 'Strength', 'Power, endurance, courage, weakness, help, and being sustained by God.'],
  ['comfort', 'Comfort', 'Consolation, encouragement, nearness in suffering, relief, and God caring for the hurting.'],
  ['protection', 'Protection', 'Safety, refuge, shelter, defense, deliverance from enemies, and God guarding his people.'],
  ['deliverance', 'Deliverance', 'Rescue from danger, oppression, bondage, enemies, sin, and overwhelming trouble.'],
  ['spiritual-warfare', 'Spiritual Warfare', 'Battle, enemies, evil, armor, resistance, vigilance, and standing firm spiritually.'],
  ['worship', 'Worship', 'Praise, adoration, singing, reverence, thanksgiving, and honoring God.'],
  ['gratitude', 'Gratitude', 'Thankfulness, remembrance, praise for gifts, appreciation, and recognizing God goodness.'],
  ['fasting', 'Fasting', 'Abstaining, seeking God, humility, devotion, spiritual focus, and dependence.'],
  ['scripture', 'Scripture', 'God word, commandments, teaching, meditation, truth, and delighting in Scripture.'],
  ['truth', 'Truth', 'Honesty, reality, faithfulness, sound teaching, integrity, and rejecting falsehood.'],
  ['discernment', 'Discernment', 'Testing, distinguishing good and evil, wisdom, judgment, and recognizing deception.'],
  ['holiness', 'Holiness', 'Being set apart, righteousness, purity, consecration, and living pleasing to God.'],
  ['righteousness', 'Righteousness', 'Right living, justice, uprightness, obedience, and being aligned with God ways.'],
  ['shame', 'Shame', 'Disgrace, regret, humiliation, hiding, restoration, and freedom from condemnation.'],
  ['guilt', 'Guilt', 'Conviction, wrongdoing, confession, forgiveness, cleansing, and restored relationship with God.'],
  ['depression', 'Depression', 'Despair, heaviness, sadness, hopelessness, low spirit, and crying out for help.'],
  ['stress', 'Stress', 'Pressure, burden, overwhelm, weariness, rest, and finding strength under demands.'],
  ['rest', 'Rest', 'Sabbath, refreshment, ceasing, relief from burden, sleep, and peace in God.'],
  ['perseverance', 'Perseverance', 'Endurance, steadfastness, finishing, trials, patience, and continuing faithfully.'],
  ['suffering', 'Suffering', 'Pain, hardship, persecution, trials, affliction, endurance, and hope through difficulty.'],
  ['persecution', 'Persecution', 'Opposition, suffering for faith, enemies, rejection, endurance, and courage under hostility.'],
  ['faithfulness', 'Faithfulness', 'Loyalty, reliability, covenant keeping, steadfast love, and consistent obedience.'],
  ['revival', 'Revival', 'Renewal, awakening, returning to God, restored devotion, and fresh spiritual life.'],
  ['service', 'Service', 'Serving others, humility, ministry, sacrifice, helpfulness, and using gifts for good.'],
  ['evangelism', 'Evangelism', 'Witness, proclaiming good news, mission, testimony, and inviting others toward salvation.'],
  ['unity', 'Unity', 'Togetherness, one body, agreement, reconciliation, peace among believers, and shared purpose.'],
  ['community', 'Community', 'Fellowship, gathering, mutual care, encouragement, belonging, and shared spiritual life.'],
  ['family', 'Family', 'Parents, children, household, honoring relatives, instruction, care, and generational faithfulness.'],
  ['parenting', 'Parenting', 'Raising children, instruction, discipline, nurture, blessing, and household leadership.'],
  ['friendship', 'Friendship', 'Companionship, loyalty, counsel, encouragement, betrayal, and choosing close relationships wisely.'],
  ['envy', 'Envy', 'Comparison, jealousy, coveting, resentment, contentment, and rejoicing with others.'],
  ['lust', 'Lust', 'Wrong desire, sexual temptation, craving, purity, self-control, and guarding the heart.'],
  ['idolatry', 'Idolatry', 'False gods, misplaced worship, attachments, serving created things, and returning to God.'],
  ['doubt', 'Doubt', 'Uncertainty, weak faith, questions, unbelief, reassurance, and seeking confidence in God.'],
  ['calling', 'Calling', 'Assignment, vocation, purpose, being sent, gifts, and responding to God direction.'],
  ['courage', 'Courage', 'Boldness, bravery, confidence, facing fear, strength, and acting faithfully under risk.'],
  ['renewal', 'Renewal', 'Transformation, new mind, restoration, fresh strength, and being made new.'],
  ['blessing', 'Blessing', 'Favor, fruitfulness, goodness, inheritance, prosperity in God terms, and received gifts.'],
] as const;

const main = async () => {
  const options = getScriptOptions();
  const seeds = options.limit ? TOPIC_SEEDS.slice(0, options.limit) : TOPIC_SEEDS;

  console.log(`Preparing to seed ${seeds.length} topics`);

  if (options.dryRun) {
    console.table(
      seeds.map((seed) => ({ name: seed[1], slug: seed[0] })),
    );
    return;
  }

  const { close, db } = createDbClient();

  try {
    for (const [slug, name, description] of seeds) {
      await db
        .insert(topics)
        .values({ description, name, slug })
        .onConflictDoUpdate({
          target: topics.slug,
          set: {
            description: sql`excluded.description`,
            name: sql`excluded.name`,
          },
        });
    }

    console.log(`Seeded ${seeds.length} topics`);
  } finally {
    await close();
  }
};

void main().catch((error) => {
  console.error('Topic seed failed');
  console.error(error);
  process.exit(1);
});
